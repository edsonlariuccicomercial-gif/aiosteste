# Follow-up Técnico — Refinamento das cláusulas de `shouldWrite` no sync (OBS-1/OBS-2)

| Campo | Valor |
|-------|-------|
| **ID** | FU-2026-06-19-SYNC-SHOULDWRITE |
| **Tipo** | Débito técnico / Refinamento de lógica de reconciliação |
| **Prioridade** | BAIXA (não bloqueia — pré-existente, sem perda de dados observável) |
| **Origem** | QA review da Story 20.15b (gate `docs/qa/gates/20.15b-sync-calibration.yml`), 2026-06-19 |
| **Status** | Aberto |
| **Registrado por** | @devops (Gage), a pedido do stakeholder |

---

## Contexto

Durante o trace adversarial dos 8 ACs da Story 20.15b (`syncFromCloud` em `js/gdp-core.js`), o @qa identificou **2 comportamentos pré-existentes** (anteriores à 20.15b) na condição `shouldWrite` que divergem levemente do princípio de design "local vence quando `localTime >= cloudTime`". Ambos foram classificados **LOW** e **não são regressões** — a Story 20.15b apenas adicionou a nova cláusula `(cloudIsNewer && cloudHasMoreDeepContent)`, sem alterar estas duas.

## As observações

### OBS-1 — empate de contagem em `isSharedKey` com local mais novo
A cláusula antiga `(isSharedKey && cloudHasMoreContent && cloudHasMoreDeepContent)` permite a **nuvem mais velha** sobrescrever o local quando:
- a chave é compartilhada (`isSharedKey`),
- a contagem empata (`cloudItems >= localItems` com igualdade),
- o conteúdo nested empata ou a nuvem tem mais (`cloudHasMoreDeepContent`),
- **mesmo que `localTime >= cloudTime`** (local é igual ou mais novo).

Conteúdo nested é preservado (a guarda `cloudHasMoreDeepContent` impede perda de `.itens`), mas o conteúdo top-level do local mais novo pode ser substituído por uma versão mais antiga da nuvem.

### OBS-2 — timestamps ambos ausentes/invalidos + empate de contagem
A cláusula `(!localTime && cloudTime === 0)` dispara um write quando **ambos** os timestamps são inválidos/ausentes (`getDataTimestamp` retorna 0) e a contagem empata. Em dados reais (com `updatedAt` preenchido) **não dispara**; é um caminho de borda para dados legados sem timestamp.

## Por que não é urgente
- Pré-existentes (anteriores à 20.15b) — não foram introduzidos por esta story.
- Sem perda de dados observável: as guardas de `.itens` nested (`cloudHasMoreDeepContent`) e a guarda dura AC3 (cloud-zerado) continuam ativas.
- A Story 20.15b já resolveu a divergência crônica real (validada em produção, 2 navegadores convergiram).

## Recomendação (se priorizado)
1. **OBS-1:** condicionar a cláusula `isSharedKey` ao timestamp — só permitir a nuvem vencer por contagem quando ela **não** for mais antiga (`cloudTime >= localTime`), alinhando ao princípio mestre do design.
2. **OBS-2:** quando ambos os timestamps são 0, preferir o lado com mais conteúdo (ou manter o local por padrão) em vez de gravar a nuvem incondicionalmente.
3. Adicionar casos de teste em `tests/app-sync.test.js` cobrindo esses 2 cenários antes de mexer (lógica data-critical).

## Escopo sugerido
- `painel-caixa-escolar/squads/caixa-escolar/dashboard/js/gdp-core.js` — bloco `shouldWrite` em `syncFromCloud` (~L515-525)
- `painel-caixa-escolar/tests/app-sync.test.js` — novos casos

## Referências
- Gate QA: `docs/qa/gates/20.15b-sync-calibration.yml` (seção `issues`)
- Design: `docs/architecture/20.15b-sync-calibration-design.md`
- Story: `docs/stories/20.15b.story.md` (QA Results — OBS-1/OBS-2)
