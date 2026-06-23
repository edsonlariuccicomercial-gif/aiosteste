# QA Gate — ARCH-sync Frontend (Passos 1 e 3)

**Revisor:** Quinn (@qa)
**Data:** 2026-06-23
**Escopo:** Passo 1 (anti-carimbão) + Passo 3 (NF atômica) — handoff do @dev
**Tipo de revisão:** Análise estática de código + validação independente do banco (testes de comportamento pendem de deploy)

---

## DECISÃO DE GATE: ✅ PASS (código) — validação de comportamento PENDENTE pós-deploy

**Atualização 2026-06-23 (re-review):** CONCERN-1 RESOLVIDO. O @dev aplicou o bloqueio de NF offline conforme decisão do stakeholder. Re-revisado o diff real:
- `consumirProximoNumeroNf()` retorna `null` quando a RPC falha (sem fallback client-side). ✅
- Ponto de consumo (linha 1547-1552) trata `null` → mensagem clara + `return` ANTES de `saveNotasFiscais`/`setIntegrationState`. Sem estado órfão. ✅
- Único ponto de consumo real protegido (`getProximoNumeroNf` é dead code). ✅
- `node --check` OK; versão bumpada v40. ✅

Código APROVADO para deploy. Os 4 testes de comportamento em produção permanecem pendentes (exigem deploy) — gate só vira PASS DEFINITIVO após o teste 1 (anti-carimbão) e teste 3 (concorrência NF) passarem em prod.

---

## Histórico — DECISÃO ORIGINAL: ✅ CONCERNS (aprovado com ressalvas)

Aprovo o avanço para deploy, MAS com 1 decisão de stakeholder pendente (CONCERN-1) e 2 itens a validar pós-deploy. Nada bloqueante encontrado no código.

---

## O que foi revisado (código real, não o resumo do handoff)

| Arquivo | Veredito | Notas |
|---------|----------|-------|
| `gdp-api.js` (nfCounterApi.next) | ✅ PASS | Padrão de timeout/AbortController consistente; trata erro→null; valida número. Limpo. |
| `js/gdp-core.js` (gdpIsBooting + saves) | ✅ PASS | Reusa flag existente (não duplica); lógica de 3 ramos correta (changedId / boot / normal). |
| `js/gdp-notas-fiscais.js` (consumirProximoNumeroNf) | ⚠️ CONCERNS | RPC primária correta; fallback offline tem risco fiscal (ver CONCERN-1). |
| `gdp-contratos.html` (bump versão) | ✅ PASS | v20/v40/v39 — anti-cache correto. |

## Validação independente do banco (produção, via REST)

- ✅ `nf_counter.counter` = 1598; RPC `next_nf_number` retornou 1599, HTTP 200. Atômica e viva.
- ✅ Confirmado: a RPC incrementa corretamente (server-authoritative).

---

## CONCERN-1 (HIGH — decisão de stakeholder) — Fallback offline pode duplicar NF

**Onde:** `gdp-notas-fiscais.js` `consumirProximoNumeroNf()`, ramo de fallback.
**Análise:** Quando a RPC falha (timeout/offline), o código cai no cálculo client-side de "primeiro número livre" (baseado só nas notas autorizadas locais). Esse caminho NÃO é atômico e pode atribuir um número que outra máquina também atribuiu — reintroduzindo o risco fiscal que a RPC eliminou, justamente na janela de rede instável (que foi quando boletos órfãos ocorreram, ver CLAUDE.md).
**Trade-off:** A alternativa seria BLOQUEAR a emissão quando a RPC falha (não emitir sem rede). Isso é mais seguro fiscalmente, mas impede emissão offline.
**Recomendação:** decisão consciente do stakeholder — manter fallback (emite sempre, risco baixo de duplicação) OU bloquear emissão sem RPC (zero risco de duplicação, mas exige rede). NÃO deixar como efeito colateral silencioso.

**✅ DECISÃO DO STAKEHOLDER (2026-06-23): BLOQUEAR emissão sem internet.** Fix solicitado ao @dev em `handoff-qa-to-dev-nf-block-offline-20260623.yaml` — remover fallback client-side, abortar transmissão com mensagem clara se a RPC falhar. Gate só vira PASS após esse fix + validação pós-deploy.

## CONCERN-2 (MEDIUM — observar pós-deploy) — Auto-fix de status no boot fica local-only

**Onde:** `gdp-init.js:3071` — `if (_nfFixed > 0) saveNotasFiscais()` durante o boot.
**Análise:** O auto-fix que corrige status de NF (cStat 100/150 → autorizada) agora roda dentro da janela de boot → vira local-only (não propaga ao Supabase). Isso é o COMPORTAMENTO CORRETO (propagar no boot = carimbão), e o fix é idempotente (cada navegador converge sozinho). Mas a correção só chega ao Supabase quando há uma ação de usuário na NF. Aceitável; registrar para observação.

---

## Testes de comportamento (EXECUTADOS pós-deploy 2026-06-23 17:13)

| # | Teste | Status |
|---|-------|--------|
| 1 | Abrir sistema NÃO reescreve pedidos/NFs em massa (anti-carimbão) | ⚠️ **PARCIAL — pedidos OK, NFs FAIL** |
| 2 | Editar em navegador A reflete em B sem reverter (sync) | ⏳ bloqueado por #1 |
| 3 | 2 emissões simultâneas de NF não duplicam número (UI) | ⏳ banco OK; UI pendente |
| 4 | Fallback offline emite com cálculo local | N/A (decisão: bloquear, não fallback) |

### ❌ TESTE 1 FALHOU PARA NFs — bug de timing descoberto

**Evidência (Playwright + Supabase, prod):**
- Pedidos: `updated_at` ANTES `16:58:52` = DEPOIS `16:58:52` → **INALTERADO ✅** (anti-carimbão OK p/ pedidos)
- NFs: `updated_at` ANTES `16:53:00` → DEPOIS `17:13:08` (= momento que abri o sistema) → **168 NFs REESCRITAS EM MASSA ❌**

**Causa-raiz (alta confiança):** RACE DE TIMING.
- Console: `[GDP] deferred-sanitize: 3651ms @ gdp-init.js:3071`.
- A flag `_gdpBootInProgress` desliga em `gdp-init.js:3085` com `setTimeout(..., 3000)`.
- O `deferred-sanitize` roda em `setTimeout(200ms)` e DEMORA 3651ms → termina em ~3851ms.
- Logo o `saveNotasFiscais()` da linha `gdp-init.js:3071` (auto-fix de NF cStat 100/150) roda em ~3851ms, **DEPOIS** da flag já ter desligado (3000ms) → cai no ramo "fora do boot → persiste TODAS" → carimbão.

**Por que só NFs e não pedidos:** o auto-fix em massa (`saveNotasFiscais()` sem changedId) está no deferred-sanitize (3071); os pedidos ali são persistidos só em localStorage (linha 3075, `localStorage.setItem` direto, não via savePedidos→Supabase). Por isso pedidos escaparam e NFs não.

**Fix necessário (@dev):** a janela de boot precisa cobrir o `deferred-sanitize`. Opções:
- (a) Mover o desligamento da flag (`gdp-init.js:3085`) para DENTRO do callback do deferred-sanitize, APÓS o `console.timeEnd('deferred-sanitize')` (linha 3072) — assim a flag só desliga quando o sanitize realmente termina; OU
- (b) O auto-fix de NF (linha 3071) usar persistência por-id (changedId) em vez de `saveNotasFiscais()` sem arg.
Recomendação: (a) é mais robusta (cobre qualquer save tardio do sanitize), mas validar que o deferred-sanitize não fica pendurado (timeout de segurança).

**GATE: FAIL (parcial)** — anti-carimbão incompleto. Não encerrar o ciclo até o re-deploy + re-validação do teste 1 para NFs.

---

### ⚠️ RE-REVIEW do fix (2026-06-23 17:40) — FAIL: bug de interação no FIX-B

Re-revisei o fix FIX-A+FIX-B do @dev (gdp-init.js). FIX-A (timing) está correto. MAS o FIX-B tem um **bug de interação que ANULA a correção**:

**Cadeia do defeito:**
1. FIX-B salva só as NFs corrigidas via `gdpApi.notas_fiscais.save(nf)` por id ✅
2. MAS usa `saveWrappedArray('gdp.notas-fiscais.v1', ...)` (gdp-init.js:3092) para o localStorage.
3. `saveWrappedArray` DURANTE o boot ENFILEIRA a chave em `_pendingBootSaves` (gdp-core.js:1161).
4. FIX-A chama `_gdpEndBootWindow()` → `_flushPendingBootSaves()` (gdp-core.js:1180) → `_pushNetworkSave('gdp.notas-fiscais.v1', ...)` (gdp-core.js:1191).
5. `_pushNetworkSave` faz `gdpApi.notas_fiscais.saveAll(items)` da LISTA INTEIRA (gdp-core.js:1169) → **CARIMBÃO DE VOLTA**.

Confirmado: `gdp.notas-fiscais.v1` está em `_LS_TO_TABLE` (gdp-core.js:1032), então o flush faz saveAll dela.

**Fix necessário (@dev):** no FIX-B (gdp-init.js:3092), NÃO usar `saveWrappedArray` (que enfileira para o flush). Escrever o localStorage DIRETAMENTE via `localStorage.setItem('gdp.notas-fiscais.v1', JSON.stringify({_v:1, updatedAt:..., items: lightNfs}))`. Assim a chave NÃO entra em `_pendingBootSaves`, o flush não a reenvia, e só os `gdpApi.notas_fiscais.save(nf)` por id (já presentes) vão ao Supabase.

**GATE: FAIL** — re-fix necessário antes de re-deploy.

---

### ✅ RE-REVIEW #3 do fix (2026-06-23 17:58) — PASS (código) condicional

Re-revisei a troca `saveWrappedArray` → `localStorage.setItem` direto. Análise de cadeia COMPLETA:

**2 pontos corrigidos (ambos verificados):**
- gdp-init.js:3097-3099 (auto-fix NF): `localStorage.setItem` direto. NÃO enfileira. ✅
- gdp-core.js:1226 (GC de quota no boot): `localStorage.setItem` direto. NÃO enfileira. ✅ (pegada extra do @dev — eu não havia pedido este, mas era um carimbão latente real.)

**Varredura de todos os `saveWrappedArray(INVOICES_KEY/ORDERS_KEY)`:**
- 1593 (savePedidos), 1658/1666/1675 (saveNotasFiscais): essas funções só são chamadas por AÇÃO DE USUÁRIO (emitir/faturar/autorizar). Durante o boot puro (sem interação), NÃO são chamadas → não enfileiram NF/pedidos em massa.
- Confirmado o contrato de design (gdp-core.js:1152-1154): "sync/sanitize usa localStorage.setItem direto, NÃO saveWrappedArray". O fix do @dev está ALINHADO com esse contrato.

**Distinção-chave:** o carimbão = reescrever a lista INTEIRA com dados carregados (potencialmente velhos) no boot. O flush de um save de USUÁRIO reenvia o estado correto que o usuário acabou de produzir — isso é legítimo, não carimbão. O fix fecha o caminho do carimbão (boot/sanitize em massa) sem quebrar saves reais.

**GATE: PASS (código) — RE-VALIDAÇÃO EM PROD OBRIGATÓRIA.** A análise estática aprova, mas o teste 1 (NFs) FALHOU antes em prod; só vira PASS DEFINITIVO após confirmar empiricamente que abrir o sistema NÃO altera updated_at das NFs.

**Protocolo de validação pós-deploy (teste 1, o mais importante):**
1. Anotar `updated_at` de 3-5 pedidos no Supabase.
2. Abrir o sistema num navegador, Ctrl+Shift+R, NÃO editar nada, aguardar 10s.
3. Reconsultar os `updated_at` — devem estar INALTERADOS. Se mudaram → carimbão ainda existe (FAIL).

---

## Limitações desta revisão (transparência)

- **CodeRabbit não executou** (WSL sem distribuição Linux instalada). Revisão feita por análise manual.
- **Testes 1-4 não puderam rodar** — produção ainda serve o código antigo. Só validáveis após o deploy do @devops.

---

## Recomendação ao fluxo

1. Stakeholder decide CONCERN-1 (fallback offline: manter ou bloquear).
2. @devops faz commit + push + `vercel --prod --force`.
3. @qa (ou stakeholder) roda os 4 testes pós-deploy, com foco no teste 1 e no teste 3 (fiscal).
4. Se teste 1 ou 3 falhar → rollback disponível (migrations 035/036/037 + reverter frontend).
