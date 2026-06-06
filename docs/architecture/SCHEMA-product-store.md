# Schema Unificado & Migração — product-store (SSoT de Produtos)

## Autor: @data-engineer (Dara) · Data: 2026-06-06
## Insumo: ADR-002 (unificação aprovada — absorver órfãos)
## Status: Design para implementação (@dev)

> **Contexto de persistência:** o sistema NÃO usa Postgres relacional para produtos —
> usa **localStorage + Supabase `sync_data` (key-value, JSON por chave)**. Portanto o
> "schema" aqui é o **contrato de objeto JS** do módulo `product-store`, e a "migração"
> é uma **função de consolidação idempotente** (não DDL). RLS/índices não se aplicam a
> esta entidade; aplicam-se as regras de integridade no nível da aplicação.

---

## 1. Achados da auditoria de dados (cloud, user_id `LARIUCCI`)

| Base | Itens | Chave de identidade | Observações |
|------|-------|---------------------|-------------|
| `gdp.produtos.v1` (SSoT) | 270 | **`sku`** (0 duplicados, 0 ausentes) | `id` nulo em **28/270**; 161 c/ custo, 160 c/ preço-ref; schema rico |
| `intel.central-produtos.v2` | 386 | `sku` (`LICT-*`), `id` (`PROD-*`) | 132 órfãos; campos `nome`/`preco_custo`/`unidade_base` (nomenclatura diferente) |
| `caixaescolar.banco.v1` | 256 | `id` (`bp-*`) | 36 órfãos; campos `item`/`margemPadrao`/`ultimaCotacao` |
| `gdp.estoque-intel.produtos.v1` | 201 | `sku` (`LICT-*`) | 167 órfãos; subset da intel.v2 |

**Decisão de chave:** `sku` é a chave natural estável na SSoT. Identidade de dedup =
`sku` (quando presente) **OU** `normalizeProductName(descricao)` (fallback). Reusa a
`normalizeProductName` de `radar-matcher-core.js` (já trata acento/sinônimo/ruído).

---

## 2. Schema unificado (contrato `product-store`)

Superset reconciliado dos 4 schemas. **Campo canônico → aliases aceitos na leitura.**

```js
// Produto canônico (SSoT) — server-lib/product-store schema
{
  // ── Identidade ──
  id:            string,   // estável, nunca null (gerar se ausente: "PROD-<ts>-<rnd>")
  sku:           string,   // chave natural ("BANK-*", "LICT-*", "bp-*") — única
  descricao:     string,   // nome canônico  [alias: nome, item]
  ncm:           string,
  unidade:       string,   // "UN"|"KG"|...  [alias: unidade_base]
  marca:         string,
  grupo:         string,   // [alias: categoria]

  // ── Precificação ──
  custoBase:        number|null,  // [alias: preco_custo]
  precoReferencia:  number|null,  // [alias: preco_referencia]
  margemAlvo:       number|null,  // [alias: margemPadrao]
  ultimaCotacao:    string|null,  // ISO date

  // ── Inteligência competitiva (do schema rico da SSoT) ──
  custosFornecedor:          array,  // [{data, valor, fornecedor}]
  concorrentes:              array,  // [{nome, preco, edital, data}]
  propostas:                 array,  // [{preco, escola, edital, data}]
  historicoResultados:       array,
  precoReferenciaHistorico:  number|null,
  taxaConversao:             number|null,

  // ── Classificação / flags ──
  produto_critico:       boolean,  // default false
  embalagem_descricao:   string,
  origem:                string,   // "0"=nacional, etc.
  classificacao_kraljic: string,   // da intel.v2 (preservar se existir)
  ativo:                 boolean,  // default true

  // ── Auditoria (baseline obrigatório) ──
  fonte:        string,   // origem do dado: "migracao_<base>" | "manual" | "b2b" | ...
  criadoEm:     string,   // ISO — nunca null (default: agora)
  atualizadoEm: string    // ISO — nunca null
}
```

### Regras de integridade (nível aplicação)
- `id` e `sku` **NOT NULL** após normalização (gerar quando ausente).
- `descricao` **NOT NULL** (fallback: `nome` → `item` → "Produto <i>").
- `criadoEm`/`atualizadoEm` sempre preenchidos (baseline Dara).
- `sku` **único** na coleção — colisão na migração → merge, não duplicar.
- Arrays nunca `null` (default `[]`).

---

## 3. Mapeamento de campos por base (para a migração)

| Canônico | gdp.produtos.v1 | intel.central-produtos.v2 | caixaescolar.banco.v1 | estoque-intel.produtos.v1 |
|----------|-----------------|---------------------------|------------------------|---------------------------|
| `descricao` | `descricao` | `nome` | `item` | `nome` |
| `unidade` | `unidade` | `unidade_base` | `unidade` | `unidade_base` |
| `grupo` | `grupo` | `categoria` | `grupo` | `categoria` |
| `custoBase` | `custoBase` | `preco_custo` | `custoBase` | `preco_custo` |
| `precoReferencia` | `precoReferencia` | `preco_referencia` | `precoReferencia` | `preco_referencia` |
| `margemAlvo` | `margemAlvo` | — | `margemPadrao` | — |
| `concorrentes`/`propostas`/`custosFornecedor` | ✓ | — | ✓ | — |
| `classificacao_kraljic` | — | ✓ | — | — |

---

## 4. Estratégia de migração consolidadora (`migrarParaSSoT`)

**Tipo:** função idempotente JS, não DDL. Roda uma vez (flag), com backup automático.

### Precedência de fontes (mais rica → mais pobre)
```
1. gdp.produtos.v1          (SSoT atual — schema rico, base do merge)
2. caixaescolar.banco.v1    (tem pricing + concorrentes/propostas)
3. intel.central-produtos.v2 (tem 132 órfãos + kraljic)
4. gdp.estoque-intel.produtos.v1 (subset — só preenche lacunas)
```

### Algoritmo (merge por chave, enriquecimento aditivo)
```
flag = "gdp.produtos.migrado-ssot.v1"
SE flag existe → abortar (idempotência)

snapshot()  // backup das 4 chaves ANTES (Fase 0)

índice = {}  // chave de dedup → produto canônico
PARA CADA base em ordem de precedência:
  PARA CADA item:
    canon = mapearParaCanonico(item, base)          // aplica mapa §3
    chave = canon.sku || normalizeProductName(canon.descricao)
    SE chave vazia → pular (log)
    SE índice[chave] existe:
      enriquecer(índice[chave], canon)              // só preenche campos VAZIOS; arrays = união
    SENÃO:
      canon.id = canon.id || gerarId()              // resolve os 28 ids nulos
      canon.fonte = canon.fonte || "migracao_" + base
      índice[chave] = canon

resultado = Object.values(índice)
validar: count >= 270 (SSoT) ; ids únicos ; skus únicos ; sem descricao vazia
gravar gdp.produtos.v1 = { updatedAt: now, itens: resultado }
flag = now
log: "{novos} absorvidos, {enriquecidos} mesclados, total {N}"
```

### Regra de enriquecimento (não-destrutiva)
- Escalares: preenche só se o canônico estiver **vazio/null** (SSoT vence em conflito).
- Arrays (`concorrentes`/`propostas`/`custosFornecedor`): **união** dedup por conteúdo.
- `classificacao_kraljic`: copia da intel.v2 se ausente.
- Nunca sobrescreve `custoBase`/`precoReferencia` já preenchidos na SSoT.

### Resultado esperado
`gdp.produtos.v1` final ≈ **270 + 132 + 36 + (órfãos estoque não cobertos)** ≈ **440-450
produtos**, schema canônico, ids/skus únicos, catálogo completo. Sem perda.

---

## 5. Segurança & reversibilidade

- **Backup obrigatório (Fase 0):** snapshot JSON das 4 chaves (cloud+local) em
  `docs/architecture/data-snapshots/<timestamp>/` antes de qualquer escrita.
- **Idempotência:** flag `gdp.produtos.migrado-ssot.v1` impede reexecução.
- **Rollback:** restaurar o snapshot da Fase 0 (as 4 chaves originais).
- **Gate de validação pós-migração:** `count >= 270`, `0 ids nulos`, `0 sku duplicado`,
  `0 descricao vazia`. Falhou qualquer um → não grava, mantém original, loga erro.
- **CodeRabbit:** revisar `product-store.js` + `migrarParaSSoT` antes do merge (foco:
  perda de dados, idempotência, integridade de chave).

---

## 6. Handoff → @dev (Dex)

Implementar nas fases do ADR-002:
- **Fase 0:** script de snapshot/backup das 4 chaves + relatório de divergência.
- **Fase 1:** `server-lib/product-store.js` (ESM) + twin browser + testes (modelo:
  `radar-matcher-core.js`). API: `list/get/getByNameOrSku/save/remove/searchCatalog`.
- **Fase 2:** `migrarParaSSoT()` conforme §4, com gate de validação §5.
- **Fase 3:** telas consomem `product-store` (GDP, Radar/bancoPrecos, centralProdutos).

Dúvidas de schema/migração → @data-engineer. Push/deploy → @devops.

---

## 7. Status de implementação (@dev)

| Fase | Status | Artefato |
|------|--------|----------|
| Fase 0 — backup + auditoria | ✅ FEITO | `docs/architecture/data-snapshots/2026-06-06T00-00-00/` (4 chaves + manifest) |
| Fase 1 — módulo core + testes | ✅ FEITO | `server-lib/product-store-core.js` + `tests/product-store-core.test.js` (14) + `tests/product-store-migration.test.js` (3, dados reais) |
| Fase 2 — wiring da migração no browser | ✅ FEITO | `product-store.js` (wrapper localStorage/Supabase) + `product-store-core.browser.js` (twin) + `migrarParaSSoT()` idempotente c/ backup + gate; testes `product-store-wrapper.test.js` (9) + `product-store-sync.test.js` (1) |
| Fase 3 — telas consomem o módulo | ✅ FEITO | `gdp-banco-produtos.js` (Central GDP) e `app.js`/`loadBancoLocal` (Radar/bancoPrecos) delegam ao ProductStore; scripts carregados em `gdp-contratos.html` + `index.html` |
| Fase 4 — aposentar bases legadas | ✅ PARCIAL | `saveBancoProdutos` roteia escrita pela SSoT; chaves legadas mantidas read-only durante transição (remover das SYNC_KEYS após estabilização em produção) |

### Validação de integração (boot real do GDP com dados de produção)
SSoT 270 → migração APLICADA → **457 produtos** consolidados | gate OK (0 id nulo/sku dup/sem desc)
| backup criado | idempotente (2ª chamada = already_done) | asBancoPrecos expõe os 457 ao Radar.

**Total de testes:** 182 passando (16 arquivos). Twin em sync (guard anti-drift).

### Resultado da consolidação (validado contra dados reais de produção)
- Entrada: 270 (SSoT) + 256 (banco) + 386 (intel) + 201 (estoque) = 1113 itens brutos
- **Consolidado: 457 produtos únicos** | 656 enriquecimentos | 0 sem chave
- Gate de validação: **OK** (0 id nulo, 0 sku duplicado, 0 sem descrição)
- Catálogo completo preservado — órfãos da Intel (abacaxi, alface...) absorvidos.

> **Lógica pura validada e testada.** O que falta (Fases 2-3) é o *wiring* de persistência
> e a troca das telas para consumir o módulo — operação de browser, maior risco, recomenda-se
> story dedicada + janela de teste antes de aposentar as bases antigas (Fase 4).
