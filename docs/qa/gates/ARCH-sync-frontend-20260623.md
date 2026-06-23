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

## Testes de comportamento (PENDENTES — exigem deploy)

| # | Teste | Status |
|---|-------|--------|
| 1 | Abrir sistema NÃO reescreve pedidos/NFs em massa (anti-carimbão) | ⏳ pós-deploy |
| 2 | Editar em navegador A reflete em B sem reverter (sync) | ⏳ pós-deploy |
| 3 | 2 emissões simultâneas de NF não duplicam número (UI) | ⏳ pós-deploy |
| 4 | Fallback offline emite com cálculo local | ⏳ pós-deploy |

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
