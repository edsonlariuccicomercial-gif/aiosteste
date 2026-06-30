# ADR-004: Central de Produtos — Conectar a Escrita à Tabela Supabase (fechar a SSoT)

## Status: Aceito
## Data: 2026-06-30
## Autor: @architect (Aria)
## Insumos: causa-raiz @analyst (handoff-analyst-causaraiz-central-produtos-20260630.yaml)
## Continuação de: ADR-002 (unificação SSoT em `gdp.produtos.v1`)

## Contexto

ADR-002 elegeu `gdp.produtos.v1` como SSoT e criou o `product-store`. Porém tratou
apenas a camada **localStorage**. A persistência na **tabela Supabase `produtos`**
nunca foi conectada à UI. O resultado é o defeito relatado pelo usuário em 2026-06-30:

- Cadastra produto → **some** no próximo boot.
- Exclui produto → **reaparece**.
- Vínculos item-do-contrato ↔ Central não persistem → quebra pedidos e NF.

### Causa-raiz (confirmada pelo @analyst, lida no código)

1. **A UI grava SÓ no localStorage.** `saveBancoProdutos()` (gdp-banco-produtos.js:109-125)
   faz `localStorage.setItem` cru e chama `schedulCloudSync()`.
2. **`syncToCloud` PULA `gdp.produtos.v1`** (gdp-core.js:601) porque está em
   `_SUPABASE_TABLE_KEYS` — o blob legado não publica produtos (correto: a verdade é a tabela).
3. **Mas NADA chama `gdpApi.produtos.save()/.remove()`** — ZERO ocorrências no código.
   A entidade existe (gdp-api.js:678) mas está órfã. A escrita na nuvem nunca acontece.
4. **O boot Supabase-First hidrata `gdp.produtos.v1` da tabela `produtos`** a cada boot
   (gdp-init.js:3216) e o **servidor sempre vence**: o merge só preserva o local se
   `msSinceLocalSave < 5000ms` (gdp-init.js:3243-3246), mas `saveBancoProdutos` **nunca
   registra `_lastLocalSave`** (usa `setItem` cru, não `saveWrappedArray`) → `preferLocal=false`.
5. **Dois caches RAM** do mesmo `gdp.produtos.v1` competem: `bancoProdutos`
   (gdp-banco-produtos.js) e `ProductStore._itens` (product-store.js), sem sincronização.

### Descobertas adicionais do arquiteto (lidas no gdp-api.js)

- **D1 — Perda de campos ricos:** `mapToTable` (gdp-api.js:176-185) **descarta silenciosamente**
  qualquer campo fora de `TABLE_COLS.produtos`. A tabela tem
  `[id,empresa_id,descricao,sku,ncm,unidade,marca,grupo,produto_critico,unidade_base,
  embalagens,custo_base,preco_referencia,margem_alvo,fonte,created_at,updated_at]`.
  `PRODUTO_DEFAULTS` (gdp-banco-produtos.js:12-35) tem campos NÃO mapeados que seriam
  **perdidos** ao gravar: `custosFornecedor`, `concorrentes`, `propostas`,
  `historicoResultados`, `precoReferenciaHistorico`, `taxaConversao`, `embalagem_descricao`,
  `criadoEm`, `atualizadoEm`. Também faltam os mapeamentos camel→snake
  (`custoBase→custo_base`, `precoReferencia→preco_referencia`, `margemAlvo→margem_alvo`,
  `produtoCritico→produto_critico`).
- **D2 — Tombstone ausente:** `_DELETE_KEYS` (gdp-api.js:276-284) **NÃO inclui `produtos`**.
  `_trackDeletedId` (linha 286) faz early-return sem a chave → `gdpApi.produtos.remove()`
  deleta no Supabase mas **não cria tombstone** → numa segunda máquina (ou via realtime/eco)
  o produto pode ressuscitar. `list()` (linha 329) e o `_mergeTable` do boot (gdp-init.js:3228)
  ambos filtram por `_DELETE_KEYS`/`.deleted.v1` — ou seja, a infra de tombstone já existe,
  só falta REGISTRAR `produtos` nela.
- **D3 — Infra pronta:** `createEntityApi('produtos').save/remove` já fazem upsert via
  backend (service_role, RLS-safe), echo-suppression (`_markSelfEcho`), retry queue offline
  e espelho no localStorage. **Não precisamos construir nada novo no transporte** — só ligar.

## Decisão

**Princípio (reafirma ADR-002):** a tabela Supabase `produtos` é a **fonte única**.
localStorage `gdp.produtos.v1` é **cache espelho**. Toda escrita da UI flui
**UI → gdpApi.produtos (Supabase) → espelho localStorage**, igual a contratos/pedidos/NF.

### D-1 — Escrita na tabela em TODA mutação de produto
`salvarProduto`, `excluirProduto`, `excluirProdutosSelecionados`, `criarProdutoRapido`,
`confirmarImportacaoTiny`, `limparTodoBancoProdutos` e o `ProductStore.save/remove`
passam a chamar `gdpApi.produtos.save(item)` / `.remove(id)` (ou `saveAll` em lote),
**além** de atualizar o cache local. Padrão idêntico ao de contratos.

### D-2 — Dirty-window: marcar edição do usuário
Após cada escrita local de produto, chamar `gdpMarkUserEdit('gdp.produtos.v1')`
(gdp-core.js:1117) para o merge do boot Supabase-First respeitar a edição recente
(`preferLocal=true` na janela de 5s) e o echo-suppression cobrir o eco do realtime.

### D-3 — Tombstone de produtos
Adicionar `produtos: 'gdp.produtos.deleted.v1'` em `_DELETE_KEYS` (gdp-api.js) **e** garantir
que `gdp.produtos.deleted.v1` esteja na cadeia de `.deleted.v1` consumida pelo boot
(gdp-init.js `_mergeTable` já deriva `lsKey.replace('.v1','.deleted.v1')` → automático)
e por `syncFromCloud`/`syncToCloud` (gdp-core.js — `GDP_SYNC_KEYS` já tem várias `.deleted.v1`;
incluir esta). Exclusão passa a deixar tombstone → não ressuscita no merge nem no realtime.

### D-4 — Esquema completo (delegado ao @data-engineer)
Resolver D1 com a abordagem **JSONB de cauda** (consistente com o resto do schema, que usa
`dados_extras`/`metadata`):
- Acrescentar `CAMEL_TO_SNAKE`: `custoBase→custo_base, precoReferencia→preco_referencia,
  margemAlvo→margem_alvo, produtoCritico→produto_critico, unidadeBase→unidade_base,
  embalagemDescricao→embalagem_descricao` (e os inversos já são derivados por SNAKE_TO_CAMEL).
- Adicionar **uma coluna `dados_extras jsonb`** na tabela `produtos` (migration) para guardar
  os campos ricos sem colunizar cada um: `custosFornecedor, concorrentes, propostas,
  historicoResultados, precoReferenciaHistorico, taxaConversao, embalagem_descricao,
  criadoEm`. O @data-engineer decide o empacotamento (wrap/unwrap em `mapToTable`/`mapFromTable`
  para produtos, OU no product-store antes de chamar gdpApi). **Decisão de schema é dele.**
- `created_at`/`updated_at`: já tratados por `save()` (linha 366). `criadoEm` legado vai em
  `dados_extras` ou mapeia para `created_at` — escolha do @data-engineer.

### D-5 — Um dono só em RAM (unificar caches)
`bancoProdutos` (gdp-banco-produtos.js) deve passar a ser uma **view** do `ProductStore`,
não um segundo cache. Concretamente: `loadBancoProdutos()` lê de `ProductStore.list()`
quando disponível; `saveBancoProdutos()` delega a `ProductStore.save` por item. Mantém
o fallback atual (setItem direto) só quando o store não carregou. Elimina a divergência RAM.

### D-6 — SKU estável (proteção de vínculo)
Manter e reforçar `sanitizeBancoProduto` (gdp-banco-produtos.js:54-62): **nunca regenerar**
SKU válido existente. O vínculo do contrato é `item.skuVinculado === produto.sku`; regenerar
SKU quebra pedido/NF. Em produtos sem SKU, gerar **uma vez** e persistir na tabela (não a
cada boot). @dev valida que nenhum caminho reescreve SKU de produto já vinculado.

## Consequências

**Positivas:**
- Cadastro/exclusão de produto **persistem** (fonte única real, multi-máquina).
- Vínculos de contrato estáveis → pedidos e NF confiáveis.
- Reaproveita 100% da infra existente (RLS backend, echo-suppress, retry, tombstone).

**Riscos / mitigação:**
- **Migration de schema** (`dados_extras`) — @data-engineer: aditiva, sem DROP, idempotente.
- **Backfill:** os produtos já no localStorage de cada máquina precisam ser empurrados para a
  tabela uma vez (one-shot no boot: se a tabela vier vazia mas o local tiver N>0, fazer
  `saveAll`). @dev implementa com guarda anti-duplicação (upsert por id é idempotente).
- **REGRA INEGOCIÁVEL:** nenhuma escrita às cegas que zere a tabela. As guardas anti-vazio
  já existentes (gdp-api.js:340-345, gdp-init.js:3222-3226) permanecem.

## Plano de implementação (cadeia de agentes)

1. **@data-engineer (Dara) — PRÓXIMO:** D-4. Migration aditiva `produtos.dados_extras jsonb`
   (idempotente, `IF NOT EXISTS`); confirmar colunas atuais batem com `TABLE_COLS.produtos`;
   definir o contrato wrap/unwrap dos campos ricos; entregar o mapeamento camel→snake exato.
   Validar RLS (a escrita já passa por `/api/gdp-data` service_role).
2. **@dev (Dex):** D-1, D-2, D-3, D-5, D-6 no front (gdp-banco-produtos.js, product-store.js,
   gdp-api.js `_DELETE_KEYS`+`CAMEL_TO_SNAKE`, gdp-core.js `GDP_SYNC_KEYS`). Backfill one-shot.
   Bump de versão dos scripts no HTML (`?v=N`).
3. **@qa (Quinn):** validar **na tela, logado** (Playwright): cadastrar → reload → permanece;
   excluir → reload → não volta; vincular item de contrato → reload → vínculo intacto;
   testar em 2 sessões (multi-máquina). Conferir que campos ricos (custo/preço) sobrevivem.
4. **@devops (Gage):** aplicar migration; `cd painel-caixa-escolar && npx vercel --prod --force`;
   confirmar versão servida; orientar Ctrl+Shift+R.

## Arquivos impactados

- `squads/caixa-escolar/dashboard/gdp-api.js` (`_DELETE_KEYS`, `CAMEL_TO_SNAKE`, eventual wrap em produtos)
- `squads/caixa-escolar/dashboard/js/gdp-banco-produtos.js` (todas as mutações → gdpApi + markUserEdit)
- `squads/caixa-escolar/dashboard/product-store.js` (save/remove → gdpApi; dono único RAM)
- `squads/caixa-escolar/dashboard/js/gdp-core.js` (`GDP_SYNC_KEYS` += `gdp.produtos.deleted.v1`)
- `squads/caixa-escolar/dashboard/js/gdp-init.js` (backfill one-shot; merge já compatível)
- migration Supabase `produtos.dados_extras` (@data-engineer)
