# ADR — Emissão de Boletos Multi-Banco (Inter + C6) e Ingestão DDA

> **Status:** Proposto · **Autor:** Aria (@architect) · **Data:** 2026-06-14
> **Epic:** EPIC-20 (Ajustes Financeiro GDP) · **Sistema:** `painel-caixa-escolar/`
> **Insumo:** `docs/briefs/brief-ingestao-automatica-boletos-dda.md` (@analyst)
> **Handoff:** `.aiox/handoffs/handoff-analyst-to-architect-boletos-api-20260614.yaml`

---

## Contexto

O cliente quer (A) **receber** emitindo boletos pelo próprio GDP e (B) **pagar** puxando
boletos do DDA automaticamente. Tem conta PJ no **Inter** e no **C6**.

### Descoberta arquitetural (auditoria de código, 2026-06-14)

A premissa do brief — "construir do zero" — **está incorreta**. O sistema **já possui uma
arquitetura de provider bancário multi-banco**, parcialmente implementada:

| Componente existente | Arquivo | Estado |
|---|---|---|
| Allowlist de providers + resolução de credenciais por env | `server-lib/bank-provider-config.js` | ✅ Pronto. **Inter já catalogado** (sandbox/prod, `GDP_BANK_INTER_*`). Asaas, Efi, BB também. |
| Cliente concreto de cobrança (template) | `server-lib/asaas-charge-client.js` | ✅ Completo (Asaas): emitir, sincronizar, webhooks |
| Endpoint de orquestração | `api/gdp-integrations.js` | ✅ `bank-charge-create` / `bank-charge-sync` / `bank-webhook-sync` com **ponto de extensão `if(provider==='asaas'){…} else {não suportado}`** (linhas 461-465, 483-487) |
| Conciliação automática (baixa) | `api/gdp-integrations.js::processAsaasWebhook` | ✅ Webhook dá baixa em `contas_receber` + `notas_fiscais`, idempotente por `providerChargeId` |
| Schema de cobrança no dado | `contas_receber.cobranca` / `.integracoes.bancaria` / `.conciliacao` (JSON) | ✅ Já gravados; sem necessidade de novas colunas para emissão |

**Conclusão:** o esforço é **incremental** — adicionar clientes concretos `inter` e `c6` ao
padrão já existente e plugá-los nos `if/else`. Não há refundação.

## Decisão #1 — DDA (trilha A / pagar)

**Adiar a trilha A.** O `bank-provider-config.js` é orientado a **emissão de cobrança**, não a
consulta DDA. DDA é um fluxo distinto (consultar boletos de terceiros), exige outro contrato de
API e, no C6, depende de homologação. **Entregar primeiro a trilha B (emissão)**, que reusa
~80% do que já existe. DDA vira EPIC/ADR próprio depois — registrado como evolução, não escopo.

## Decisão #2 — Emissão multi-banco (trilha B / receber)

**Estender o padrão de provider existente**, sem inventar abstração nova:

1. **C6 na allowlist** — adicionar entrada `c6` em `ALLOWED_PROVIDERS`
   (`bank-provider-config.js`), espelhando o formato do `inter` (clientId/clientSecret, baseUrls,
   `GDP_BANK_C6_*`).
2. **Cliente concreto Inter** — criar `server-lib/inter-charge-client.js` exportando
   `createInterCharge` / `syncInterCharge`, com a **mesma assinatura** do `asaas-charge-client.js`
   e retornando o **mesmo formato `normalized`** (`providerChargeId`, `linhaDigitavel`,
   `bankSlipUrl`, `pix`, `status`…). Diferença: OAuth v2 + **certificado mTLS** (não API-key).
3. **Cliente concreto C6** — `server-lib/c6-charge-client.js`, mesma assinatura. Implementação
   real condicionada à liberação da API (pode entrar como stub que lança "aguardando homologação"
   sem bloquear o Inter).
4. **Plugar no orquestrador** — em `api/gdp-integrations.js`, trocar o `if(provider==='asaas')`
   por um **dispatch por mapa** `{ asaas, inter, c6 }` em `bank-charge-create` e `bank-charge-sync`.
5. **Conciliação Inter** — `processInterWebhook` (ou polling via `syncInterCharge`) reusando
   `updateReceivableFromAsaasEvent` generalizado para `updateReceivableFromProviderEvent`.

### Contrato `BoletoProvider` (já implícito no código)

```
createCharge({ ambiente, conta, nota }) → { normalized: { provider, providerChargeId,
   status, linhaDigitavel, bankSlipUrl, nossoNumero, pix, dueDate, value, … } }
syncCharge({ ambiente, providerChargeId }) → { normalized: {...} }
```
Os adapters NÃO conhecem Supabase nem `contas_receber` — só falam com o banco e devolvem
`normalized`. O `gdp-integrations.js` é quem persiste. Separação já respeitada pelo Asaas.

## Consequências

**Positivas:** reuso massivo; risco baixo (Asaas em produção como referência viva); Inter pode
ir a produção sem depender do C6; zero migration de schema para emissão (usa JSON `cobranca`).

**Negativas / riscos:**
- **R5 (mTLS Inter):** certificado precisa de armazenamento seguro. **Decisão:** guardar PEM em
  env vars Vercel (`GDP_BANK_INTER_CERT_PEM` / `GDP_BANK_INTER_KEY_PEM`), nunca no front; o
  `inter-charge-client` monta um `https.Agent` com o cert. Adicionar esses campos ao spec do Inter.
- **R6 (C6 homologação):** C6 entra como stub → não bloqueia entrega.
- **Auth divergente:** Asaas=API-key, Inter/C6=OAuth+cert. O `resolveProviderRuntimeConfig` já
  separa `auth` por provider; estender `auth.env` do Inter com `certPem`/`keyPem`.

## Schema (delegado a @data-engineer)

**Emissão (trilha B): nenhuma migration necessária** — `cobranca`/`integracoes.bancaria` (JSON)
já comportam linha digitável, nossoNumero, urls. @data-engineer deve **confirmar** e só agir se
quiser promover `banco_emissor` a coluna indexável para relatórios. **Não criar colunas
especulativas.**

## Sequência de entrega (para @sm/@dev)

1. **[@data-engineer]** Confirmar que `cobranca` JSON cobre emissão Inter → sem migration (gate).
2. **[@dev]** Add `c6` à allowlist + campos cert no spec `inter`.
3. **[@dev]** `inter-charge-client.js` (OAuth+mTLS, createCharge/syncCharge, formato normalized).
4. **[@dev]** Dispatch por mapa em `bank-charge-create`/`bank-charge-sync`.
5. **[@dev]** `c6-charge-client.js` (stub se API não liberada).
6. **[@dev]** Generalizar `processAsaasWebhook` → conciliação Inter.
7. **[@qa]** Gate: idempotência, segredos fora do front, sem regressão Asaas/sync.
8. **[@devops]** Env vars (cert Inter) + deploy `--force`.

---
*— Aria, arquitetando o futuro 🏗️*
