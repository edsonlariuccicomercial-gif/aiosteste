# Arquitetura — EPIC-22 Fase 2: Separação dos 3 Produtos + API do Núcleo Comum

> Documento de arquitetura brownfield por **@architect (Aria)** — 2026-06-21.
> Contexto: discovery `DISCOVERY-EPIC22-MODULOS-POR-CLIENTE.md`; Fase 1 (toggle de módulos) já em produção (Story 22.1).

## 1. Objetivo de negócio (stakeholder — Edson)

- **Vender o GDP isoladamente** (já viabilizado pela Fase 1 — toggle de módulos por cliente).
- Tratar **Radar** e **Intel Preços** como **produtos separados**, a serem **redesenvolvidos** ("não ficaram bons").
- **Integração** futura GDP ↔ Radar/Intel **via API** (ex.: Radar vence licitação → cria contrato no GDP).

## 2. Achado central (evidência de código)

O sistema **já possui arquitetura core/shell**. Os arquivos `-core.browser.js` são **lógica 100% pura** (sem DOM, localStorage ou rede) e **rodam em Node.js sem alteração**:

| Arquivo | Linhas | Natureza | Pronto p/ servidor |
|---------|--------|----------|--------------------|
| `server-lib/radar-matcher-core.browser.js` | 388 | Pura (matching NCM, normalização, preço-ref, marcas) | ✅ hoje |
| `server-lib/product-store-core.browser.js` | 245 | Pura (modelo canônico de produto, merge/dedupe) | ✅ hoje |
| `product-store.js` | 205 | Shell (localStorage + sync) | 🔶 refatorar |
| `radar-matcher.js` | 259 | Shell (cache + Supabase `radar_equivalencias`) | 🔶 refatorar |

**Desacoplamento já existente:** o GDP **nunca chama o core diretamente** — só o wrapper `RadarMatcher.match()`. Isso permite trocar o motor (browser → HTTP) **sem alterar a lógica de negócio do GDP**.

## 3. Mapa de acoplamento (AS-IS)

```
                ┌─────────────────────────────────────────────┐
                │  NÚCLEO PURO (633 linhas, roda em Node hoje) │
                │  radar-matcher-core · product-store-core     │
                └─────────────────────────────────────────────┘
                   ▲ (via wrapper)   ▲              ▲
        ┌──────────┴───┐   ┌─────────┴────┐  ┌──────┴────────┐
        │     GDP      │   │    RADAR     │  │ INTEL PREÇOS  │
        │ contratos,   │   │ equivalências│  │ catálogo,     │
        │ pedidos, NF, │   │ orçamentos   │  │ pré-orçamento,│
        │ financeiro   │   │ SGD          │  │ rentabilidade │
        └──────┬───────┘   └──────┬───────┘  └──────┬────────┘
               └──────────┬───────┴─────────┬───────┘
                          ▼                 ▼
              ┌────────────────────┐ ┌──────────────────┐
              │ Supabase (1 BD)    │ │ tabela `produtos`│
              │ tabelas por produto│ │ = catálogo comum │
              └────────────────────┘ └──────────────────┘
```

### Fronteiras de dados (já limpas)
- **GDP:** `contratos`, `pedidos`, `notas_fiscais`, `clientes`, `contas_receber`, `contas_pagar`, `entregas`, `extratos`, `conciliacoes`, `nf_counter`, `lancamentos_cliente/itens`.
- **Radar:** `radar_equivalencias`, `resultados_orcamento`, `sync_data`.
- **Intel:** estoque (in-memory + `produtos`), `movimentacoes`, `fornecedores`.
- **Compartilhado:** **`produtos`** (catálogo) — único dado genuinamente comum.

### APIs serverless (11) — classificação
- **GDP:** `gdp-integrations` (NFe/SEFAZ), `bank-charge` (boletos), `send-order-email`.
- **Intel:** `estoque`, `estoque-intel-erp`, `fornecedores`, `pedidos`, `movimentacoes`.
- **Intel/Radar:** `ai-parse-price` (OpenAI).
- **Compartilhado:** `caixa-proxy` (federação SGD/SEFAZ/PNCP), `produtos`.

### Deploy atual
Projeto **único** Vercel (`painel-caixa-escolar`), 1 domínio, root → `gdp-contratos.html`. Supabase único (`mvvsjaudhbglxttxaeop`), RLS ativo, tudo filtrado por `empresa_id`.

## 4. Recomendação: escada evolutiva (NÃO big-bang)

Princípio: *progressive complexity*. O GDP já vende — não pará-lo por uma separação especulativa. Cada degrau entrega valor isolado e é reversível.

### Degrau 1 — Núcleo vira pacote/lib versionado `@licit/core`
- Extrair `radar-matcher-core` + `product-store-core` (já puros) para um pacote único versionado.
- Os 3 produtos importam a lib; o wrapper `RadarMatcher` passa a consumir a lib.
- **Sem servidor novo, sem mudar deploy.** Elimina duplicação, cria fronteira limpa.
- **Risco: BAIXO.** Pré-requisito de todo o resto. GDP funciona idêntico.

### Degrau 2 — Núcleo vira API HTTP
- Expor o core como serviço HTTP. Contrato já mapeado:
  - `POST /api/match` `{itemName, cache?, produtos?}` → `{status, score, sku, nomeBanco, matchLayer}`
  - `POST /api/extract-price` `{text}` → `{valor, raw, fonte}|null`
  - `POST /api/extract-brands` `{text}` → `{marcas[], raw}|null`
  - `GET /api/validate-brand` `{marca, required[]}` → `{compliant}`
  - `POST /api/merge-products` `{bases}` → `{itens[], stats}`
  - `GET|POST /api/products`
  - `GET /api/equivalencias` · `POST /api/equivalencias/:key/confirm` · `DELETE /api/equivalencias/:key`
- GDP troca o wrapper `RadarMatcher` de "browser" para "cliente HTTP" — **sem mudar lógica do GDP**.
- Nasce a "ponte" de integração (Radar → contrato no GDP).
- **Risco: MÉDIO.** **Gatilho:** quando refazer o Radar/Intel (o novo produto já nasce consumindo a API).

### Degrau 3 — Deploys separados (condicional)
- Cada produto vira deploy/domínio próprio (`gdp.app`, `radar.app`, `intel.app`) + API do núcleo no centro.
- **Risco: ALTO. Só se houver razão comercial:** cliente que não pode receber o código dos outros produtos, ou ciclos de release conflitantes.
- **Honestidade arquitetural:** muitos negócios nunca precisam deste degrau. Toggle (Fase 1) + API (degrau 2) já cobrem "vender separado" e "integrar". Não pagar o custo antes da dor.

## 5. Riscos transversais (qualquer separação precisa resolver)

| Risco | AS-IS | Decisão de design |
|-------|-------|-------------------|
| **`empresa_id`** | Resolvido no frontend (`nexedu.empresa` localStorage) | Centralizar como header da API ou claim do JWT — a API precisa saber de quem são os dados. |
| **Auth duplo** | `auth.js` (SHA-256 hardcoded "lariucci2026") + `supabase-auth.js` (GoTrue JWT) coexistem | **Consolidar em Supabase Auth ANTES de separar.** `api/lib/auth.js` (validação JWT) já existe mas está desabilitado. |
| **Tabela `produtos`** | Compartilhada | RLS: todos os produtos LEEM; só Intel ESCREVE. |
| **Realtime** | `gdp-realtime.js` assina TODAS as tabelas | Filtrar a assinatura por produto (cada app só ouve suas tabelas + `produtos`). |
| **`caixa-proxy`** | Federação central (SGD/SEFAZ/PNCP) | Permanece na camada compartilhada ou roteia por produto. |

## 6. Sequência recomendada (roadmap)

1. **Pré-requisito (independente):** consolidar auth em Supabase (aposentar `auth.js`) e centralizar `empresa_id`. Reduz risco de todos os degraus.
2. **Degrau 1** (lib `@licit/core`) — quando a Fase 2 entrar no roadmap.
3. **Degrau 2** (API HTTP) — junto com o redesenho do Radar/Intel (decisão "refazer do zero vs aproveitar" fica para esse momento — não bloqueia agora).
4. **Degrau 3** — só sob demanda comercial.

## 6.5. Multi-Tenant & Entitlement (controle de módulos por cliente) — gatilho da Fase 2

> Levantado pelo stakeholder (Edson) em 2026-06-21: "hoje libero/restrinjo módulos para mim mesma dentro do meu usuário; onde faço isso por cliente, ao vender assinaturas, sem mexer no meu uso individual?"

### Problema (evidência de código)
A config de módulos da Fase 1 (`nexedu.modulos.acesso`, `modulos-acesso.js`) é salva no **localStorage do navegador** + sync por **`empresa_id`** (`nexedu.empresa`, hoje hardcoded `'LARIUCCI'` no frontend — ver `gdp-realtime.js:64-65`). Ou seja, **"cliente" e "minha conta" são a mesma coisa**: é uma **preferência do usuário**, não uma **trava de licenciamento**. Num SaaS multi-tenant, o cliente poderia se auto-liberar módulos que não pagou (abrir Configurações → Módulos e marcar tudo).

### Distinção arquitetural (separar 2 conceitos hoje fundidos)
| Conceito | O que é | Quem controla | Onde mora |
|----------|---------|---------------|-----------|
| **Entitlement (licença)** | "Cliente X comprou GDP + Intel" | O dono do SaaS (Edson) | Servidor/Supabase — cliente NÃO altera (RLS) |
| **Preferência (visão)** | "Hoje quero ver só o GDP" | O usuário | localStorage (o toggle atual da Fase 1) |

**Regra:** o usuário só liga/desliga (preferência) **dentro** do que o entitlement permite. Módulo não-licenciado nem aparece como opção.

```
ENTITLEMENT (tenant, servidor) ── limita ──▶ PREFERÊNCIA (usuário, local = toggle Fase 1)
```

### Onde Edson vai liberar/restringir por cliente (opções)
1. **Tabela `tenants` no Supabase** (recomendado p/ início): 1 linha por cliente, coluna `modulos_liberados` (ex.: `["gdp","intel"]`), protegida por RLS (cliente não lê/escreve). Edson edita à mão. Esforço BAIXO.
2. **Painel admin interno** (só do dono) que escreve nessa tabela. Esforço MÉDIO. Quando houver vários clientes.
3. **Billing automático** (Stripe/etc.) → webhook libera módulo. Esforço ALTO. Self-service em escala.

### Conexão com a Fase 2 (o multi-tenant É o gatilho)
- `empresa_id` (hoje `'LARIUCCI'` hardcoded) → vira o **tenant_id**, resolvido no **login (claim do JWT Supabase)** — exatamente o pré-requisito "auth + empresa_id" da §6.
- O entitlement por tenant é a "fonte de verdade no servidor" que a Fase 2 prevê.
- `aplicarAcessoSidebar()` (já criado na Fase 1) passa a ler **2 níveis**: entitlement do tenant (servidor) **interseccionado com** preferência do usuário (local). O trabalho da Fase 1 vira a camada de preferência — **não foi desperdiçado**.

### ⚠️ Relação com o EPIC-18 (Multi-Tenant SaaS) — escopos ORTOGONAIS

O stakeholder já tem o **EPIC-18-MULTI-TENANT-SAAS** pronto (`docs/stories/EPIC-18-MULTI-TENANT-SAAS.md`, arquitetura `docs/architecture/FASE-0-MULTI-TENANT-AUTH-RLS.md`). **Atenção: EPIC-18 ≠ entitlement de módulos.** São duas camadas ortogonais — ambas necessárias para vender assinaturas por plano:

| Camada | Garante | Onde |
|--------|---------|------|
| **Isolamento de dados** (EPIC-18) | Cliente A não vê os DADOS do cliente B | Supabase Auth + RLS por `empresa_id` (foco total do EPIC-18) |
| **Entitlement de módulos** (esta extensão) | Cliente A que pagou só GDP nem VÊ o Radar | Coluna `modulos_liberados` na tabela `empresas` + interseção no `getAcessoModulos()` |

O EPIC-18 (objetivo, linha 13) cobre "todos os módulos" **com dados isolados** — ele **assume que todo tenant acessa todos os módulos**. Não tem o conceito "este cliente assinou só o GDP". Esse conceito é o **entitlement**, que **estende** o EPIC-18 (não o substitui).

**Por que encaixa barato no EPIC-18:** a fundação já entrega o necessário —
- tabela `empresas` (migration 001) → adicionar coluna `modulos_liberados` (ex.: `["gdp","intel"]`);
- `user_empresa` + `get_user_empresa_id()` (migration 009) → resolve o tenant do logado;
- Supabase Auth (Story 18.2) → identidade confiável.

**Onde Edson libera/restringe por cliente:** editando `empresas.modulos_liberados` da linha do cliente (protegida por RLS — cliente não altera). O uso individual de Edson não muda: o tenant dela tem todos os módulos liberados.

### Decisão do stakeholder (2026-06-21)
**Adiado** — tratar o entitlement de módulos como **pequena extensão do EPIC-18**, quando o EPIC-18 entrar em execução. Por ora, foco no GDP; o uso individual atual (Edson configura para si via toggle da Fase 1) permanece funcionando.

### Quando retomar (mini-roadmap do entitlement, sobre o EPIC-18)
1. **Pré-req = EPIC-18** Stories 18.2 (Supabase Auth) + 18.4 (RLS) — identidade confiável e isolamento.
2. Coluna `empresas.modulos_liberados` + RLS (cliente lê o próprio, não escreve) — **@data-engineer/Dara** (encaixa junto com 18.4/18.7).
3. No login, carregar `modulos_liberados` do tenant junto com a sessão.
4. `getAcessoModulos()` passa a retornar: **entitlement do tenant (servidor) ∩ preferência do usuário (local/toggle Fase 1)**.
5. (Opcional) painel admin para editar planos → billing automático (Stripe/webhook).

> **Nota de roadmap:** o entitlement NÃO precisa de épico próprio — é ~1-2 stories anexadas ao EPIC-18 (provavelmente perto da 18.4/18.6). A Fase 2 (separação de produtos) é independente disto: dá para ter entitlement de módulos no monolito atual, sem separar os produtos.

## 7. O que NÃO fazer

- ❌ Big-bang: separar tudo de uma vez parando o GDP.
- ❌ Construir a API HTTP antes de ter um consumidor real (Radar/Intel novos) — seria especulativo.
- ❌ Deploys separados (degrau 3) sem razão comercial concreta.
- ❌ Duplicar o core por produto (perde a fonte única, reintroduz divergência — o oposto do que a Fase 1 corrigiu).

## 8. Decisões em aberto (do stakeholder, para o momento da Fase 2)

- **Refazer Radar/Intel do zero vs aproveitar o atual** — adiado (não bloqueia o desenho do núcleo). Recomendação preliminar: dado "não ficaram bons", **refazer do zero consumindo a API** tende a ser mais limpo, mas decidir com o roadmap em mãos.
- **Até onde subir a escada** (degrau 2 ou 3) — depende do modelo de venda do Radar/Intel.

## 9. Esforço estimado (alto nível)

| Degrau | Esforço | Pré-condições |
|--------|---------|---------------|
| Auth + empresa_id (pré-req) | M | — |
| Degrau 1 (lib) | S–M | core já é puro |
| Degrau 2 (API HTTP) | M–L | degrau 1 + auth/empresa_id |
| Degrau 3 (deploys) | L | degrau 2 + razão comercial |

---

*Arquitetura por Aria (@architect) — 2026-06-21. Próximo: quando a Fase 2 entrar no roadmap, @pm transforma o degrau escolhido em épico/stories; @data-engineer (Dara) detalha RLS de `produtos` e centralização de `empresa_id`.*
