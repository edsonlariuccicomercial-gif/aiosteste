# ADR-003: Conciliação/Extratos — Fonte Única (tabela) e aposentadoria do blob `sync_data` legado

## Status: Aprovada (decisão do usuário: pausar conciliação até o fix)
## Data: 2026-06-24
## Autor: @architect (Aria)
## Insumos: diagnóstico @analyst (Atlas) — handoff-analyst-to-dev-P4-CAUSARAIZ-extratoId-race-20260624.yaml

## Contexto

O usuário reproduziu 3x ao vivo: ao **conciliar 1 lançamento**, o extrato "fecha sozinho",
o resumo mostra **"0/0"** e não reabre. Diagnóstico do @analyst (validado via Playwright):

- Os 346 itens de `gdp.conciliacao.v1` no **localStorage** ficam com `extratoId` **VAZIO**
  logo após conciliar.
- A **tabela Supabase `conciliacoes` está ÍNTEGRA**: 346/346 itens **com** `extrato_id`
  (map camel↔snake correto em `gdp-api.js:151,164`).
- Cadeia do sintoma: `extratoId` some → `atualizarExtratoStats()` calcula `ext.total = 0`
  (filtra por `extratoId`) → `renderConciliacao()` filtra detalhe por `extratoId` → vazio →
  early-return esconde detalhe + resumo "0/0".

### Causa-raiz arquitetural (DUPLA FONTE)

Conciliação tem **duas fontes cloud concorrentes**:

| Fonte | Caminho | Carrega `extratoId`? |
|-------|---------|----------------------|
| **(A) Tabela `conciliacoes`** | `gdpApi.conciliacoes` + merge em `gdp-init.js:3185-3219` | **SIM** (correto) |
| **(B) Blob legado `sync_data`** | `syncToCloud`/`syncFromCloud` key `gdp.conciliacao.v1` (`gdp-core.js:405-460, 583-617`) | **NÃO** (blob antigo) |

`gdp-core.js:160` declara a intenção certa — *"Entidades com tabela Supabase real — NÃO
sincronizar via sync_data"* — e define `_SUPABASE_TABLE_KEYS` (linha 161) **incluindo
`gdp.conciliacao.v1` e `gdp.extratos.v1`**. **Mas esse Set quase nunca é usado:**
`syncToCloud` (linha 585) itera `GDP_SYNC_KEYS` **sem excluir** `_SUPABASE_TABLE_KEYS`, e
`syncFromCloud` (linha 405+) escreve o blob por cima do localStorage.

Os guards existentes (`gdp-core.js:591` anti-array, `:602` anti-menos-itens) **não pegam
perda de CAMPO**: um blob com 346 itens wrapped, porém sem `extratoId`, passa nos dois e
sobrescreve o bom → **race** (um render no meio da janela vê 0/0).

## Decisão

**1. Conciliação e Extratos = FONTE ÚNICA = tabelas Supabase (`conciliacoes`, `extratos`)
   via `gdpApi`.** O blob `sync_data` legado para `gdp.conciliacao.v1` e `gdp.extratos.v1`
   é **aposentado** — honrar `_SUPABASE_TABLE_KEYS` de fato.

**2. Parar de PUBLICAR o blob legado** (`syncToCloud`): pular `key` que esteja em
   `_SUPABASE_TABLE_KEYS` (o `gdpApi` já persiste cada item na tabela em `saveConciliacao`/
   `saveExtratos`). Elimina a re-geração do blob stale.

**3. Parar de CONSUMIR o blob legado** (`syncFromCloud`): pular `row.key` em
   `_SUPABASE_TABLE_KEYS`. O merge correto já acontece em `gdp-init.js:3185` (Supabase-First),
   que lê da tabela COM `extratoId`. Remove o vetor de sobrescrita.

**4. Auto-cura defensiva (rede de segurança):** estender o recovery de boot já existente
   (`gdp-core.js:1455-1468`, que re-vincula órfãos) para rodar **também após conciliar**
   (`conciliarLancamento`/`conciliarComBaixa`/`toggleConciliado`), re-hidratando `extratoId`
   a partir de `gdpApi.conciliacoes` (por `id`) **antes** de `renderConciliacao()`. Idempotente.
   Cobre qualquer item legado órfão remanescente.

**5. Anti-eco na conciliação (opcional, defesa em profundidade):** espelhar o anti-eco do
   `scheduleRender` (`gdp-realtime.js:54`) — não reidratar/re-renderizar conciliação enquanto
   há operação de conciliação in-flight.

## Escopo de implementação (mínimo, NÃO redesenhar)

- `gdp-core.js` `syncToCloud` (~585): `if (_SUPABASE_TABLE_KEYS.has(key)) return;` no topo do map.
- `gdp-core.js` `syncFromCloud` (~405): `if (_SUPABASE_TABLE_KEYS.has(row.key)) continue;`.
- `gdp-core.js` nova `autoCurarExtratoIdConciliacao()` reutilizando o padrão de 1455-1468 +
  fonte `gdpApi.conciliacoes`; chamar em `conciliarLancamento`/`conciliarComBaixa`/`toggleConciliado`
  antes de `renderConciliacao()`.
- Bump de versão dos scripts alterados no HTML + `Ctrl+Shift+R`.

## Riscos e mitigação

- **Risco:** alguma tela ainda depender do blob `sync_data` de conciliação. **Mitigação:**
  `gdp-init.js:3185` já carrega da tabela; `saveConciliacao` (gdp-core.js:3215) já grava na
  tabela. O blob é redundante. **@data-engineer valida** que `conciliacoes`/`extratos` cobrem
  todos os campos lidos pelas telas antes de cortar o blob.
- **Risco:** extratos têm `isOpen` (flag de UI) que NÃO está na tabela? Confirmado: schema
  `extratos` TEM `is_open` (gdp-api.js:150). OK.
- **Reversível:** as 3 mudanças são guards de early-return; remover o guard reativa o blob.

## Handoff

- **@data-engineer (Dara):** validar que tabelas `conciliacoes` + `extratos` cobrem 100% dos
  campos consumidos pelas telas (especialmente `extratoId`/`extrato_id`, `isOpen`/`is_open`,
  `vinculadoA`/`vinculado_a`). Confirmar que aposentar o blob não perde nenhum campo.
- **@dev (Dex):** implementar os 3 guards + auto-cura, bump de versão.
- **@qa (Quinn):** validar via Playwright (logado lariucci): conciliar 3x seguidas sem 0/0;
  extratoId persiste; extrato continua aberto.
- **@devops (Gage):** deploy `npx vercel --prod --force --yes`.
```
