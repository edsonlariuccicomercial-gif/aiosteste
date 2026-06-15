# Project Brief — Ciclo Financeiro Completo via API Bancária (DDA + Emissão de Boletos)

> **Autor:** Atlas (@analyst) · **Data:** 2026-06-14 · **Status:** Draft para @architect/@dev
> **Epic alvo:** EPIC-20 (Ajustes Financeiro GDP) ou novo EPIC dedicado
> **Sistema:** Painel Caixa Escolar / GDP · `painel-caixa-escolar/`
>
> **Escopo:** duas trilhas complementares no mesmo projeto —
> **(A) PAGAR** — DDA → `contas_pagar` (ingestão de boletos de terceiros, automática)
> **(B) RECEBER** — API de Cobrança (Inter + C6) → `contas_receber` (emissão de boletos pelo sistema)
> **Arquitetura:** multi-banco (Inter **e** C6).

---

## 1. Problema

Hoje os boletos a pagar do CNPJ aparecem na lista **DDA (Débito Direto Autorizado)** do
internet banking, mas são **copiados/digitados manualmente** para o módulo **Contas a Pagar**
do GDP. Isso gera: retrabalho, risco de erro de digitação, esquecimento de vencimentos e
nenhuma rastreabilidade entre o boleto-origem e o lançamento.

**Objetivo:** boleto emitido contra o CNPJ → aparece automaticamente em `contas_pagar`,
sem digitação, idealmente em tempo quase real.

## 2. Contexto técnico atual (verificado no código)

- Tabela `contas_pagar` (Supabase). Campos atuais (`gdp-api.js:99`):
  `id, empresa_id, descricao, valor, status, forma, categoria, vencimento, fornecedor,
  audit, deleted_at, created_at, updated_at`
- API genérica `createEntityApi('contas_pagar')` (`gdp-api.js:494`) — mesmo padrão CRUD das
  demais entidades (list/save/remove), com soft-delete (`deleted_at`, migration 030) e
  sincronização via Supabase Realtime.
- **Lacuna estrutural:** não existe campo de identidade de boleto
  (linha digitável / código de barras / id da transação no banco). Sem isso **não há como
  deduplicar** uma ingestão automática (o mesmo boleto entraria N vezes a cada sync).

## 3. Decisão pendente #1 — Fonte de dados (BLOQUEANTE)

> **Ver o DDA no app do banco ≠ ter API do DDA.** É preciso uma ponte programática.

| Opção | O que é | Prós | Contras |
|---|---|---|---|
| **A. API DDA do próprio banco** | Endpoint Open Finance / API PJ do banco do cliente | Sem intermediário; custo menor | Poucos bancos têm self-service; exige contrato + homologação; 1 integração por banco |
| **B. Agregador Open Finance** (Pluggy, Belvo, Asaas, Iniciador) | SaaS que já homologou DDA com vários bancos e entrega via REST + webhook | Rápido; multi-banco; webhook pronto; sandbox | Custo recorrente (por conta/consulta); dependência de terceiro; LGPD/consentimento |
| **C. RPA / scraping do internet banking** | Robô que loga e lê a lista DDA | Funciona mesmo sem API | Frágil (quebra a cada mudança de layout); risco contratual/segurança; **NÃO recomendado** |

**Recomendação Atlas:** para um sistema do porte do GDP, **Opção B (agregador)** é o melhor
custo-benefício de time-to-value. Confirmar **qual é o banco do cliente** para checar se a
Opção A é viável sem agregador.

→ **Ação:** definir o banco e validar disponibilidade de API DDA antes da Fase 1.

## 3b. Decisão pendente #2 — Multi-banco (Inter + C6)

O cliente já tem conta PJ no **Inter** e no **C6**, e ambos oferecem API de Cobrança
self-service (geração de credenciais no próprio internet banking). Comparativo verificado
(jun/2026):

| Critério | **Banco Inter** | **C6 Bank** |
|---|---|---|
| API de Cobrança (emitir boleto) | ✅ Self-service no IB PJ | ✅ Existe (gera chave no Web Banking PJ) |
| Bolepix (boleto + Pix no mesmo doc) | ✅ Nativo | ✅ Pix Cobrança (QR dinâmico/estático) |
| Consulta de DDA (trilha A) | — (usar Open Finance/agregador) | ✅ Cobre DDA na MESMA API |
| Sandbox para testes | ✅ Sim | ⚠️ Não confirmado |
| Registro instantâneo (sem D+1) | ✅ Sim | — não confirmado |
| Atrito de liberação | Baixo (self-service) | ⚠️ Médio — relatos públicos de demora/homologação |
| Auth | OAuth v2 + certificado (mTLS) | OAuth + chave (CNPJ informado na liberação) |

Fontes: developers.inter.co/references/cobranca-bolepix ; c6bank.com.br/apis-integracao

**Recomendação Atlas:**
- **Emissão (trilha B):** começar pelo **Inter** (menor atrito, Bolepix, sandbox, registro
  instantâneo). C6 como segundo provedor.
- **DDA (trilha A):** o **C6** é candidato natural por cobrir DDA na própria API de cobrança,
  evitando agregador para esse banco específico.
- **Arquitetura multi-banco:** abstrair um **adapter por banco** atrás de uma interface única
  (`BoletoProvider`), para que `contas_receber`/`contas_pagar` não conheçam o banco concreto.

## 4. Escopo proposto

### Fase 0 — Schema (pré-requisito, @data-engineer)
Migration aditiva (padrão das migrations 029/030 — idempotente, zero-downtime):
```
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS linha_digitavel  TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS codigo_barras    TEXT;
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS origem           TEXT DEFAULT 'manual'; -- 'manual' | 'dda'
ALTER TABLE contas_pagar ADD COLUMN IF NOT EXISTS origem_ref       TEXT;  -- id do boleto no provedor
-- Dedup: índice único parcial por linha digitável dentro da empresa
CREATE UNIQUE INDEX IF NOT EXISTS uq_contas_pagar_linha_digitavel
  ON contas_pagar (empresa_id, linha_digitavel)
  WHERE linha_digitavel IS NOT NULL AND deleted_at IS NULL;
```

### Fase 1 — Conector de ingestão (@dev + @architect)
- Endpoint serverless em `painel-caixa-escolar/api/` (ex.: `api/dda-webhook.js`) que recebe
  os boletos do provedor (webhook) **ou** um job agendado que faz polling da API DDA.
- Mapeia o payload do provedor → schema `contas_pagar`
  (`valor, vencimento, fornecedor (cedente), linha_digitavel, codigo_barras, origem='dda'`).
- **Upsert idempotente** por `(empresa_id, linha_digitavel)` — reusa o índice único da Fase 0.
- Grava via mesma camada `contas_pagar` → Realtime propaga para todos os PCs automaticamente.

### Fase 2 — UX no Contas a Pagar (@dev + @ux-design-expert)
- Badge visual de **origem** (🏦 DDA vs ✍️ Manual) na listagem.
- (Opcional) Modo "revisão" antes de efetivar — mesmo o cliente querendo 100% automático,
  vale um toggle de quarentena para os primeiros dias de operação.

### Fase 3 — (Futuro) Pagamento via Open Finance
- Iniciação de pagamento do boleto a partir do próprio GDP (trilha "Open Finance Pagamentos").
- Fora do escopo desta entrega; registrado como evolução.

---

## TRILHA B — Emissão de boletos (API Cobrança → `contas_receber`)

### Contexto técnico (verificado no código)
- Tabela `contas_receber` (`gdp-api.js:98`). Campos:
  `id, empresa_id, pedido_id, origem_id, descricao, valor, status, forma, categoria,
  vencimento, cliente, cobranca, automacao, audit, deleted_at, created_at, updated_at`
- ⚠️ **Achado relevante:** já existem os campos **`cobranca`** e **`automacao`** — indício de que
  cobrança automatizada já foi antecipada no design. **@architect/@dev devem inspecionar o uso
  atual desses campos e REUSAR** em vez de criar estrutura nova.
- Mesmo padrão `createEntityApi('contas_receber')` + soft-delete (migration 029) + Realtime.

### Fase B0 — Schema (se necessário, @data-engineer)
Provável reuso de `cobranca` (JSON) para guardar dados do boleto emitido. Se for adicionar
colunas dedicadas, seguir padrão idempotente:
```
-- linha_digitavel / codigo_barras / pix_copia_cola / nosso_numero / banco_emissor / boleto_url
-- (avaliar se cabem dentro do JSON `cobranca` antes de criar colunas)
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS banco_emissor TEXT; -- 'inter' | 'c6'
```

### Fase B1 — Adapter multi-banco (@architect + @dev)
- Interface única `BoletoProvider` com `emitir()`, `consultar()`, `cancelar()`, `webhookBaixa()`.
- Implementações: `InterBoletoProvider`, `C6BoletoProvider` (cada uma trata OAuth + certificado
  + endpoints do seu banco). Seleção por config/`empresa_id`.
- Endpoints serverless em `painel-caixa-escolar/api/` (ex.: `api/boleto-emitir.js`).
- Credenciais e certificados **fora do código** (env vars Vercel; certificado mTLS do Inter
  exige cuidado especial de armazenamento).

### Fase B2 — Fluxo de emissão no GDP (@dev + @ux-design-expert)
- A partir de um lançamento de `contas_receber` (ou de um pedido), botão **"Emitir boleto"**.
- Chama o adapter → recebe linha digitável + Pix (Bolepix) + URL do PDF → grava em `cobranca`.
- Exibe/baixa o boleto; envia ao cliente (e-mail/portal escolar já existente).

### Fase B3 — Conciliação automática (baixa) (@dev)
- Webhook do banco notifica pagamento → atualiza `status` do `contas_receber` para `pago`.
- Idempotente por `nosso_numero`/`txid`. Fecha o ciclo: emitido → pago → conciliado, sem digitação.

## 5. Requisitos não-funcionais
- **Idempotência:** reprocessar o mesmo webhook não duplica lançamento (índice único).
- **LGPD/Consentimento:** Open Finance exige consentimento explícito do titular da conta;
  o fluxo de consent do agregador precisa ser tratado e renovado.
- **Segurança:** credenciais do provedor fora do código (env vars Vercel), nunca no front.
- **Sincronização:** sem regressão no padrão soft-delete + Realtime já validado.

## 6. Riscos
- **R1 (alto):** banco pode não ter API DDA self-service → força agregador (custo recorrente).
- **R2 (médio):** consentimento/credencial Open Finance expira → precisa renovação.
- **R3 (médio):** divergência fornecedor/cedente (nome no boleto ≠ cadastro GDP) → normalização.
- **R4 (baixo):** boleto cancelado pelo emissor após ingerido → precisa status `cancelado`.
- **R5 (médio, trilha B):** certificado mTLS do Inter exige armazenamento seguro e renovação;
  vazamento = emissão indevida de boletos em nome do CNPJ.
- **R6 (médio, trilha B):** liberação da API do C6 pode demorar (homologação) → não bloquear o
  Inter por causa do C6; entregar Inter primeiro.
- **R7 (baixo):** tarifa por boleto emitido varia por banco/contrato → confirmar custo unitário
  antes de escalar volume (NÃO assumido neste brief).

## 7. Próximos passos
1. **[Cliente/Atlas]** Confirmar contas PJ ativas no Inter e C6 e gerar credenciais de sandbox.
2. **[Atlas → @analyst]** (se necessário) `*create-competitor-analysis` de agregadores para o DDA
   do banco que não tiver API própria.
3. **[@architect]** Decidir: DDA via banco vs agregador (decisão #1) + desenhar interface
   `BoletoProvider` multi-banco (decisão #2).
4. **[@dev]** Inspecionar uso atual dos campos `cobranca` e `automacao` em `contas_receber`.
5. **[@data-engineer]** Migrations das Fases 0 / B0 (só o que não couber nos JSONs existentes).
6. **[@dev]** Implementar trilha B (emissão Inter) como primeira entrega de valor; depois DDA e C6.

---
*Gerado por Atlas (@analyst) — investigando a verdade 🔎*
