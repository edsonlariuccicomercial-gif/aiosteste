# ADR-004 — Contrato de Mapeamento `produtos` (entregue por @data-engineer)

Documento de implementação para o @dev. Define EXATAMENTE como o produto (camelCase,
schema rico do `PRODUTO_DEFAULTS`) é traduzido para a tabela Supabase `produtos` e de volta.

## 1. Estado confirmado do schema (migration 014, lido no código)

A tabela `produtos` tem 17 colunas, batendo **1:1** com `TABLE_COLS.produtos` (gdp-api.js:154):

```
id, empresa_id, descricao, sku, ncm, unidade, marca, grupo, produto_critico,
unidade_base, embalagens, custo_base, preco_referencia, margem_alvo, fonte,
created_at, updated_at
```
- `id` text PK; `empresa_id` NOT NULL DEFAULT 'LARIUCCI'; `embalagens` jsonb DEFAULT '[]'.
- Trigger `set_updated_at_produtos` mantém `updated_at` server-side.
- **FK:** `estoque_simples.produto_id REFERENCES produtos(id) ON DELETE CASCADE`
  → um hard DELETE em produtos apaga o estoque_simples do produto. Ver §5.

**Migration 041 (aplicada por @devops):** acrescenta `dados_extras jsonb DEFAULT '{}'`.

## 2. Mapeamento camel → snake (adicionar a `CAMEL_TO_SNAKE` em gdp-api.js:158)

```js
// ADR-004 — produtos
custoBase: 'custo_base',
precoReferencia: 'preco_referencia',
margemAlvo: 'margem_alvo',
produtoCritico: 'produto_critico',
unidadeBase: 'unidade_base',
embalagemDescricao: 'embalagem_descricao', // NÃO é coluna — vai p/ dados_extras (ver §3)
dadosExtras: 'dados_extras'
```
> `produto_critico` já é o nome usado no PRODUTO_DEFAULTS (snake), então a chave camel
> `produtoCritico` é defensiva (caso algum caminho use camel). `SNAKE_TO_CAMEL` é derivado
> automaticamente (gdp-api.js:173-174) — não precisa editar.

## 3. Wrap/unwrap de `dados_extras` — DECISÃO: em `mapToTable`/`mapFromTable`, isolado p/ `produtos`

**Por quê aqui e não no product-store:** centraliza a tradução na única camada que já
traduz (gdp-api.js), mantém o product-store agnóstico de schema, e cobre TODOS os
chamadores de `gdpApi.produtos` (não só o store). O backend `/api/gdp-data` repassa as
`rows` as-is ao PostgREST — que REJEITA colunas inexistentes; portanto o filtro de
`mapToTable` por `TABLE_COLS` é a guarda correta e `dados_extras` PRECISA estar na lista.

### 3.1 Campos que vão para `dados_extras` (NÃO têm coluna própria)
```
custosFornecedor, concorrentes, propostas, historicoResultados,
precoReferenciaHistorico, taxaConversao, embalagem_descricao, criadoEm
```

### 3.2 `TABLE_COLS.produtos` — acrescentar `dados_extras`
```js
produtos: ['id','empresa_id','descricao','sku','ncm','unidade','marca','grupo',
  'produto_critico','unidade_base','embalagens','custo_base','preco_referencia',
  'margem_alvo','fonte','dados_extras','created_at','updated_at'],
```

### 3.3 Wrap na escrita (mapToTable) — APENAS quando table === 'produtos'
Após o loop genérico de `mapToTable` (gdp-api.js:176-185), para produtos, empacotar os
campos ricos no `row.dados_extras` e remover quaisquer chaves ricas que tenham vazado:
```js
// dentro de mapToTable, após montar `row`:
if (table === 'produtos') {
  var RICH = ['custosFornecedor','concorrentes','propostas','historicoResultados',
              'precoReferenciaHistorico','taxaConversao','embalagem_descricao','criadoEm'];
  var extras = (item.dadosExtras || item.dados_extras) ? Object.assign({}, item.dados_extras || item.dadosExtras) : {};
  RICH.forEach(function (k) {
    if (item[k] !== undefined) extras[k] = item[k];
    // aceitar também o camel embalagemDescricao
  });
  if (item.embalagemDescricao !== undefined) extras.embalagem_descricao = item.embalagemDescricao;
  row.dados_extras = extras;
  // garantir que nenhuma chave rica virou coluna inexistente (mapToTable já filtra por cols,
  // então só `dados_extras` — que agora está em TABLE_COLS — sobrevive)
}
```

### 3.4 Unwrap na leitura (mapFromTable) — APENAS quando vier `dados_extras`
`mapFromTable` é genérico (não conhece a tabela). Espalhar os campos ricos de volta ao
nível raiz para o `PRODUTO_DEFAULTS` reconhecê-los:
```js
// dentro de mapFromTable, após montar `obj`:
if (obj.dados_extras && typeof obj.dados_extras === 'object') {
  var ex = obj.dados_extras;
  ['custosFornecedor','concorrentes','propostas','historicoResultados',
   'precoReferenciaHistorico','taxaConversao','embalagem_descricao','criadoEm']
    .forEach(function (k) { if (obj[k] === undefined && ex[k] !== undefined) obj[k] = ex[k]; });
  delete obj.dados_extras; // não vaza p/ o objeto de domínio
  delete obj.dadosExtras;
}
```
> `embalagem_descricao` e `criadoEm` são os nomes que o `getProdutoComDefaults` espera
> (PRODUTO_DEFAULTS usa `embalagem_descricao` e `criadoEm`). Mantidos snake/camel como no schema rico.

## 4. Idempotência e timestamps
- `gdpApi.produtos.save()` (gdp-api.js:363) já gera `id` se faltar, seta `empresa_id` e
  `updated_at`, faz upsert `on_conflict=id` (idempotente) e espelha no localStorage. **OK.**
- `criadoEm` (camel, schema rico) → guardar em `dados_extras.criadoEm`. NÃO mapear para
  `created_at` (a coluna `created_at` tem DEFAULT now() e é gerida pelo banco). Mantém o
  histórico de criação do produto sem conflitar com o timestamp da linha.

## 5. Exclusão — tombstone + cuidado com CASCADE (D-3 do ADR)
- `gdpApi.produtos.remove()` faz **hard DELETE**, que **cascateia** em `estoque_simples`.
  Para a Central isso é aceitável (apagar produto apaga seu estoque simples). MAS a infra
  de soft-delete não está nesta tabela (sem `deleted_at`). Decisão: **manter hard DELETE +
  tombstone client-side** (`_DELETE_KEYS.produtos = 'gdp.produtos.deleted.v1'`) — já é o
  padrão de contratos/pedidos. O tombstone impede ressurreição via list()/merge/realtime.
- **@dev:** adicionar `produtos: 'gdp.produtos.deleted.v1'` em `_DELETE_KEYS` (gdp-api.js:276)
  e incluir `gdp.produtos.deleted.v1` em `GDP_SYNC_KEYS` (gdp-core.js:162). O boot
  (`_mergeTable`, gdp-init.js:3228) já deriva `.deleted.v1` automaticamente.

## 6. RLS — NADA a fazer
`produtos` já coberto por migration 034 (anon read-only + escrita service_role via
/api/gdp-data). Adicionar coluna não altera policy. Validado: `produtos` está na allowlist
do backend (`ALLOWED_TABLES`, api/gdp-data.js:21) e na lista da 034.

## 7. Checklist de aplicação
1. **@devops:** `*dry-run` 041 → `*apply-migration` 041 (aditiva, segura). Rollback pronto.
2. **@dev:** editar `CAMEL_TO_SNAKE`, `TABLE_COLS.produtos`, wrap/unwrap §3, `_DELETE_KEYS`,
   `GDP_SYNC_KEYS` + as mutações da UI (D-1/D-2/D-5/D-6 do ADR-004) + backfill one-shot.
3. **@qa:** validar na tela (criar/excluir/vincular sobrevivem reload; campos ricos persistem;
   multi-sessão).
