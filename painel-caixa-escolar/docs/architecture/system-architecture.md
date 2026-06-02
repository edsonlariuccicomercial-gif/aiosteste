# System Architecture — GDP Painel Caixa Escolar

**Fase:** Brownfield Discovery — Fase 1
**Agente:** @architect (Aria)
**Data:** 2026-06-02
**Versao:** 2.0 (atualizado — migração Netlify→Vercel, JSON→Supabase concluída)

---

## 1. Visão Geral

GDP (Gestão de Pedidos) é uma plataforma de gestão operacional para fornecedores de caixas escolares de Minas Gerais. O sistema gerencia contratos, pedidos, notas fiscais, entregas, contas a receber/pagar, extratos bancários e conciliação financeira — integrado ao SGD (Sistema de Gestão Descentralizada) e ao SEFAZ para emissão de NF-e.

### 1.1 Stack Tecnológico (Atual)

| Camada | Tecnologia | Detalhes |
|--------|-----------|---------|
| Frontend | Vanilla JavaScript (ES6+, IIFE) | Sem framework, multi-page app |
| CSS | Custom CSS com CSS Variables | Design tokens manuais |
| Backend Serverless | Vercel Functions (Node.js) | 13 endpoints em `/api/` |
| Backend Local | Express.js (squads/caixa-escolar/server.js) | Dev/legacy, porta 8082 |
| Database | Supabase (PostgreSQL) | 19 migrations, RLS ativo |
| Realtime | Supabase Realtime (WebSocket) | 12 canais por empresa |
| Auth | Supabase GoTrue (email+password) | JWT, auto-refresh |
| Cache | localStorage + in-memory fallback | Offline-first pattern |
| NFe/Fiscal | node-forge + xml-crypto + @xmldom | Assinatura A1, SEFAZ |
| Email | Nodemailer | Notificações de pedidos |
| PDF | jsPDF | Geração client-side |
| Excel | SheetJS (CDN) | Import/export XLSX |
| Testes | Vitest + Playwright | 3 test files existentes |
| Deploy | Vercel (prod) | Static + serverless |
| Build | Vite 7.3 | Dev server, sem build em prod |

### 1.2 Decisões Arquiteturais

| Decisão | Justificativa | Status |
|---------|--------------|--------|
| Sem framework frontend | Simplicidade, público de escolas, zero build step | Mantido |
| Supabase como source-of-truth | Substituiu JSON flat files (Story 7.22) | Migrado |
| localStorage como offline cache | Fallback quando Supabase indisponível | Ativo |
| Vercel Functions | Substituiu Netlify Functions | Migrado |
| Multi-tenant via empresa_id | Isolamento por empresa em todas as tabelas | Ativo |
| Anon key + RLS | Seguro expor key no frontend com Row-Level Security | Ativo |
| IIFE pattern | Módulos JS sem bundler, namespace via window.* | Mantido |

---

## 2. Arquitetura de Camadas

```
┌────────────────────────────────────────────────────────────────┐
│                      FRONTEND (Browser)                         │
│                                                                  │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐ │
│  │index.html   │ │gdp-contratos │ │gdp-portal│ │gdp-entrega-│ │
│  │(redirect)   │ │.html (main)  │ │.html     │ │dor.html    │ │
│  └─────────────┘ └──────────────┘ └──────────┘ └────────────┘ │
│  ┌─────────────┐ ┌──────────────┐ ┌──────────┐ ┌────────────┐ │
│  │login.html   │ │gdp-dashboard │ │gdp-gestao│ │restore-    │ │
│  │(Supabase)   │ │.html         │ │.html     │ │conciliacao │ │
│  └─────────────┘ └──────────────┘ └──────────┘ └────────────┘ │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ JS Modules (IIFE, window.* namespace)                      │  │
│  │ supabase-config → supabase-auth → gdp-api → gdp-core     │  │
│  │ gdp-init → gdp-realtime → [feature modules]               │  │
│  │ app-sync → app-state → app-results                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTPS (REST + WebSocket)
┌────────────────────────┼───────────────────────────────────────┐
│                   SUPABASE (Cloud)                               │
│  ┌─────────────────────┴──────────────────────────────────┐    │
│  │  PostgreSQL (mvvsjaudhbglxttxaeop.supabase.co)          │    │
│  │                                                          │    │
│  │  Tabelas (10 entidades):                                 │    │
│  │  contratos | pedidos | notas_fiscais | clientes          │    │
│  │  contas_receber | contas_pagar | entregas                │    │
│  │  extratos | conciliacoes | nf_counter                    │    │
│  │                                                          │    │
│  │  Tabelas auxiliares:                                      │    │
│  │  sync_data | nexedu_sync | resultados_orcamento          │    │
│  │  radar_equivalencias | user_empresa                      │    │
│  │                                                          │    │
│  │  RLS: Ativo (migration 006) — filtra por empresa_id      │    │
│  │  Auth: GoTrue (email+password, JWT)                      │    │
│  │  Realtime: WebSocket (12 canais)                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┼───────────────────────────────────────┐
│              VERCEL FUNCTIONS (Serverless API)                    │
│                                                                   │
│  /api/caixa-proxy.js       → SGD proxy (CORS bypass)            │
│  /api/gdp-integrations.js  → GDP integrations hub                │
│  /api/sync-pedidos.js      → Sync pedidos (Supabase)             │
│  /api/sync-entregas.js     → Sync entregas (Supabase)            │
│  /api/send-order-email.js  → Email notifications                 │
│  /api/ai-parse-price.js    → AI price parsing                    │
│  /api/db-migrate.js        → Database migration handler          │
│  /api/estoque-intel-erp.js → Inventory intelligence              │
│  /api/estoque.js           → Inventory management                │
│  /api/fornecedores.js      → Supplier management                 │
│  /api/pedidos.js           → Order management                    │
│  /api/produtos.js          → Product management                  │
│  /api/movimentacoes.js     → Transaction tracking                │
│                                                                   │
│  Config: maxDuration=60s, rewrites sgd-proxy→caixa-proxy         │
└────────────────────────────────────────────────────────────────┘
                         │
┌────────────────────────┼───────────────────────────────────────┐
│                 INTEGRAÇÕES EXTERNAS                              │
│                                                                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  SGD API      │ │  SEFAZ       │ │  ASAAS               │    │
│  │  caixaescolar │ │  NF-e v4.0   │ │  Payment processor   │    │
│  │  .educacao    │ │  (futuro)    │ │  boleto/pix          │    │
│  │  .mg.gov.br   │ │  27 UFs      │ │  (futuro)            │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐    │
│  │  PNCP        │ │  Tiny/Olist  │ │  Bancos              │    │
│  │  Precos ref. │ │  (legacy)    │ │  (futuro: extratos)  │    │
│  │  gov federal │ │  phasing out │ │                       │    │
│  └──────────────┘ └──────────────┘ └──────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

---

## 3. Frontend

### 3.1 Páginas (11 HTML)

| Página | Função | Contexto |
|--------|--------|----------|
| `index.html` | Redirect → gdp-contratos.html | Entry point |
| `login.html` | Login Supabase (email+senha) | Auth |
| `gdp-contratos.html` | Gestão de contratos (página principal) | Core |
| `gdp-dashboard.html` | Dashboard KPIs e analytics | Analytics |
| `gdp-gestao.html` | Painel administrativo | Admin |
| `gdp-portal.html` | Portal para escolas fazerem pedidos | Escolas |
| `gdp-entregador.html` | App de entregas (PWA mobile) | Logística |
| `gdp-estoque-intel-mobile.html` | Estoque intelligence (mobile) | Estoque |
| `dashboard-home.html` | Home dashboard | Navigation |
| `restore-conciliacao.html` | Restauração de conciliação/extratos | Recovery |

### 3.2 Módulos JavaScript (js/)

| Módulo | Namespace | Responsabilidade |
|--------|-----------|------------------|
| `supabase-config.js` | `window.SUPABASE_CONFIG` | URL + anon key (single source of truth) |
| `supabase-auth.js` | `window.gdpAuth` | signIn, signOut, getSession, requireSession, onAuthChange |
| `gdp-api.js` | `window.gdpApi` | Data access layer (Supabase-first, localStorage cache) |
| `gdp-core.js` | `window.gdpLog/gdpWarn` | Core helpers, cloud sync orchestration, debug |
| `gdp-init.js` | (init) | Bootstrap sequence, dependency loading |
| `gdp-realtime.js` | `window.gdpRealtime` | WebSocket subscriptions, batched rendering |
| `gdp-contratos-module.js` | (module) | Contracts CRUD |
| `gdp-pedidos.js` | (module) | Orders CRUD |
| `gdp-notas-fiscais.js` | (module) | Invoice management, NF-e lifecycle |
| `gdp-entregas.js` | (module) | Delivery management |
| `gdp-estoque-intel.js` | (module) | Inventory intelligence |
| `gdp-usuarios.js` | (module) | User/client management |
| `gdp-banco-produtos.js` | (module) | Product bank |
| `gdp-integrations-client.js` | (module) | Client-side integrations |
| `gdp-pagination.js` | (module) | Pagination utilities |
| `banco-precos-client.js` | (module) | Price bank client |

### 3.3 Módulos de Aplicação (raiz dashboard/)

| Módulo | Responsabilidade |
|--------|------------------|
| `app.js` | Main application (legado, monolito ~2500 linhas) |
| `app-sync.js` | Cloud sync (cloudSave/cloudLoad, empresa context) |
| `app-state.js` | State management (localStorage persistence) |
| `app-results.js` | Results/reports module |
| `app-config.js` | Configuration |
| `app-banco.js` | Banking module |
| `app-import.js` | Data import |
| `app-sgd-client.js` | SGD client (browser-side) |
| `app-sgd-integration.js` | SGD integration |
| `app-utils.js` | Utilities |
| `gdp-api.js` | Supabase data layer (Story 7.22) |
| `radar-matcher.js` | Radar matching algorithm |
| `pricing-engine.js` | Pricing calculation |
| `pricing-intel.js` | Pricing analytics |

### 3.4 Gerenciamento de Estado

| Camada | Mecanismo | Propósito |
|--------|-----------|-----------|
| Source of truth | Supabase (PostgreSQL) | Dados persistentes, multi-device |
| Cache offline | localStorage (wrapped format) | Fallback quando cloud indisponível |
| In-memory | `_memCache` object | Fallback para Safari private mode |
| Sessão | `gdp.auth.session` (localStorage) | JWT access_token + refresh_token |
| Empresa | `nexedu.empresa` (localStorage) | Contexto multi-tenant |
| Debug | `gdp.debug` (localStorage) | Flag de debug logging |

### 3.5 Padrão de Sync (3 camadas)

```
Layer 1: Realtime WebSocket (gdp-realtime.js)
  └→ Supabase channels por tabela + empresa_id
  └→ Debounce 500ms, batched rendering
  └→ Heartbeat + reconnect (exponential backoff)

Layer 2: REST API (gdp-api.js)
  └→ Write: Supabase REST → mirror localStorage
  └→ Read: Supabase → localStorage fallback → sync_data fallback
  └→ Upsert com merge-duplicates

Layer 3: Legacy Sync (app-sync.js)
  └→ cloudSave/cloudLoad via sync_data table
  └→ Candidate resolution: syncUserId → nomeFantasia → nome → CNPJ → LARIUCCI
  └→ Debounce 10s para evitar saturar Supabase
```

---

## 4. Backend

### 4.1 Vercel Functions (Produção)

| Endpoint | maxDuration | Função |
|----------|-------------|--------|
| `/api/caixa-proxy` | 60s | SGD CORS bypass (rewrite de sgd-proxy e b2b-scrape) |
| `/api/gdp-integrations` | 60s | GDP integrations hub |
| `/api/sync-pedidos` | default | Sync pedidos via Supabase |
| `/api/sync-entregas` | default | Sync entregas via Supabase |
| `/api/send-order-email` | 60s | Email via Nodemailer |
| `/api/ai-parse-price` | 60s | AI price parsing |
| `/api/db-migrate` | default | Database migration handler |
| `/api/estoque-intel-erp` | default | Inventory intelligence ERP |
| `/api/estoque` | default | Inventory management |
| `/api/fornecedores` | default | Supplier management |
| `/api/pedidos` | default | Order management |
| `/api/produtos` | default | Product management |
| `/api/movimentacoes` | default | Transaction tracking |

### 4.2 Express Server (Dev/Legacy)

- **Arquivo:** `squads/caixa-escolar/server.js` (~21 KB)
- **Porta:** 8082
- **Rotas:** SGD proxy, health check, static files
- **Status:** Legacy — produção usa Vercel Functions

### 4.3 Server Library (server-lib/)

| Arquivo | Tamanho | Função |
|---------|---------|--------|
| `nfe-sefaz-client.js` | ~70 KB (~1568 linhas) | NF-e XML build, assinatura A1, SEFAZ submission |
| `product-utils.js` | ~22 KB | Utilidades de produtos, pricing |
| `asaas-charge-client.js` | ~9 KB | ASAAS payment processor client |
| `bank-provider-config.js` | ~10 KB | Banking provider configuration |
| `ibge-mg.json` | ~21 KB | Dados geográficos IBGE (MG) |

---

## 5. Database (Supabase PostgreSQL)

### 5.1 Modelo de Dados (10 entidades principais)

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  empresas   │────<│  contratos   │────<│   pedidos     │
│  (tenant)   │     │  (licitação) │     │   (orders)    │
└──────┬──────┘     └──────────────┘     └───────┬───────┘
       │                                          │
       │     ┌──────────────┐              ┌──────┴───────┐
       ├────<│  clientes    │              │ notas_fiscais│
       │     │  (escolas)   │              │ (NF-e)       │
       │     └──────────────┘              └──────┬───────┘
       │                                          │
       │     ┌──────────────┐     ┌───────────────┤
       ├────<│ contas_pagar │     │               │
       │     └──────────────┘     │     ┌─────────┴──────┐
       │                          │     │ contas_receber │
       │     ┌──────────────┐     │     └────────────────┘
       ├────<│  entregas    │─────┘
       │     └──────────────┘
       │
       │     ┌──────────────┐     ┌───────────────┐
       ├────<│  extratos    │────<│ conciliacoes  │
       │     └──────────────┘     └───────────────┘
       │
       └────<│  nf_counter  │ (atomic counter por empresa)
             └──────────────┘
```

### 5.2 Migrations (19 arquivos)

| Migration | Propósito |
|-----------|-----------|
| 001 | Tabelas GDP iniciais |
| 002 | Migração de sync_data |
| 003 | Backup & audit tables |
| 004 | Resultados orçamento |
| 005 | Preço histórico |
| 006 | Enable RLS em todas as tabelas |
| 007a | Atomic NF counter |
| 007b | RLS anon read by empresa |
| 008 | Unique NF fix trigger |
| 009 | Auth user-empresa mapping |
| 010 | Financial integrity |
| 011 | Type safety constraints |
| 012 | Retention policy |
| 013 | Preço histórico aggregation |
| 014 | GDP simplification |
| 015 | Contratos escola_cliente_id |
| 016 | Clientes campos faltantes |
| 017 | Disk I/O optimization |
| 018 | Extratos & conciliações |

### 5.3 Multi-Tenant

- **Isolamento:** `empresa_id` em todas as tabelas
- **RLS:** Row-Level Security ativo (migration 006)
- **Auth:** Supabase GoTrue com `user_empresa` mapping
- **Anon key:** Seguro com RLS — filtra por empresa_id automaticamente

---

## 6. Autenticação

### 6.1 Fluxo de Auth

```
1. login.html → email + password
2. POST /auth/v1/token?grant_type=password → access_token + refresh_token
3. Salva em localStorage: gdp.auth.session { access_token, refresh_token, expires_at, user }
4. Auto-refresh: setInterval 60s, renova 5min antes de expirar
5. Authorization header: Bearer {access_token}
6. Unauthenticated → redirect login.html
```

### 6.2 Contexto Multi-Tenant

```
1. Login → resolve empresa_id (syncUserId | nomeFantasia | nome | cnpj | LARIUCCI)
2. Salva em localStorage: nexedu.empresa { syncUserId, nomeFantasia, cnpj, ... }
3. Todas as queries filtram por empresa_id
4. Portal escolar: empresa_id = escola.id (do escolas-credentials.json)
```

---

## 7. Integrações

### 7.1 SGD (Sistema de Gestão Descentralizada)

- **API:** `https://api.caixaescolar.educacao.mg.gov.br`
- **Auth:** CNPJ + password → session token (24h)
- **Operações:** Login, list budgets, budget detail/items, send proposal
- **Multi-SRE:** networkId por regional (header `x-network-being-managed-id`)
- **Proxy:** Vercel `/api/caixa-proxy` para bypass CORS

### 7.2 SEFAZ (NF-e)

- **Módulo:** `nfe-sefaz-client.js` (~1568 linhas, 31 exports)
- **Funcionalidades:**
  - Build XML NF-e (v4.0)
  - Assinatura digital A1 (node-forge + xml-crypto)
  - Grupo UB (IBS/CBS/IS) — NT 2025.002 (Reforma Tributária)
  - Validação certificado A1 (expiração, CNPJ match)
  - Consulta protocolo (27 UFs)
  - Validação CRT (4 regimes: Simples, Excesso, Normal, MEI)
- **Status:** Build + sign implementado, submission SEFAZ parcial

### 7.3 ASAAS (Pagamentos)

- **Módulo:** `asaas-charge-client.js`
- **Funcionalidades:** Boleto, Pix, TED
- **Status:** Client implementado, integração futura

### 7.4 Tiny/Olist (Legacy)

- **Status:** Being phased out
- **Endpoint:** `/api/olist/order` (Netlify archive)

### 7.5 PNCP (Preços de Referência)

- **Script:** `fetch-pncp-prices.js`
- **Funcionalidade:** Busca preços de referência do governo federal

---

## 8. Deploy

### 8.1 Produção (Vercel)

- **Projeto:** `painel-caixa-escolar`
- **Root:** `painel-caixa-escolar/`
- **URL:** `painel-caixa-escolar.vercel.app`
- **Redirect:** `/` → `/squads/caixa-escolar/dashboard/gdp-contratos.html`
- **Headers:** HTML no-cache, JS must-revalidate
- **Functions:** 13 serverless endpoints
- **Build:** Sem build step (static files servidos diretamente)

### 8.2 Comando de Deploy

```bash
cd painel-caixa-escolar && npx vercel --prod
# Forçado (sem cache): npx vercel --prod --force
```

---

## 9. Scripts Operacionais

### 9.1 npm scripts (63+ comandos)

| Categoria | Comandos | Função |
|-----------|----------|--------|
| `ops:*` | daily, health, start-day, end-day, monitor, trend, close-shift | Pipeline operacional |
| `discovery:*` | summary, validate, status, plan, day, next, go-check, cycle | Discovery workflow |
| `dashboard:*` | collect, audit:territory, audit:sku, validate:sku, snapshot:daily | Dados e auditoria |
| `backup:*` | fiscal, fiscal:restore, fiscal:restore:date | Backup fiscal |
| `orders:*` | sync:olist | Sincronização Olist |
| `commercial:*` | kit | Kit comercial |
| `exec:*` | status | Status executivo |

---

## 10. Segurança

### 10.1 Pontos Fortes

| Aspecto | Implementação |
|---------|--------------|
| Auth | Supabase GoTrue (JWT, auto-refresh) |
| Multi-tenant | RLS por empresa_id em todas as tabelas |
| Anon key | Seguro com RLS ativo |
| Token refresh | Auto 5min antes de expirar |
| Offline fallback | Graceful degradation sem dados sensíveis expostos |

### 10.2 Débitos de Segurança

| ID | Débito | Severidade |
|----|--------|-----------|
| SEC-1 | escolas-credentials.json com logins de escolas no repo | CRÍTICO |
| SEC-2 | Vercel Functions sem auth middleware (dependem apenas de RLS) | ALTO |
| SEC-3 | Certificados A1 (PFX) armazenados como base64 em config_fiscal | ALTO |
| SEC-4 | CNPJ/senha SGD em .env (aceitável, mas sem rotação) | MÉDIO |
| SEC-5 | Sem rate limiting nas APIs serverless | MÉDIO |
| SEC-6 | Sem CSP headers configurados | MÉDIO |

---

## 11. Performance

| Métrica | Valor | Observação |
|---------|-------|-----------|
| Bundle JS (app.js) | ~95 KB | Monolito legado, sem code splitting |
| gdp-contratos.html | ~79 KB | Página mais pesada (lógica inline) |
| nfe-sefaz-client.js | ~70 KB | Server-lib, não carrega no browser |
| Libs CDN | SheetJS, PDF.js | Lazy loading |
| Realtime debounce | 500ms | Batched rendering |
| Sync debounce | 10s | Evitar saturar Supabase |
| Serverless timeout | 60s max | Funções críticas configuradas |
| Cache HTML | no-cache | Garante versão mais recente |

---

## 12. Fluxos de Dados Principais

### 12.1 Pedido → NF-e → Cobrança

```
Portal escola (gdp-portal.html)
  └→ gdpApi.pedidos.save() → Supabase (tabela pedidos)
     └→ Dashboard gestor visualiza (realtime WebSocket)
        └→ Gerar NF-e (nfe-sefaz-client.js)
           └→ Assinar XML (certificado A1)
              └→ [futuro] SEFAZ authorize
                 └→ Gerar cobrança (ASAAS)
                    └→ Conta a receber (Supabase)
```

### 12.2 Coleta SGD → Dashboard

```
Script (collect-sgd-orcamentos.js)
  └→ SGD API (paginado, 50/pg)
     └→ Filtro SRE
        └→ Enrich (detalhe + itens)
           └→ Supabase (resultados_orcamento)
              └→ Dashboard renderiza (realtime)
```

### 12.3 Sync Cross-Browser

```
Browser A → gdpApi.save() → Supabase
  └→ Realtime WebSocket notifica Browser B
     └→ Browser B renderiza (debounce 500ms)
```

---

## 13. Débitos Técnicos Identificados (Nível Sistema)

| ID | Débito | Área | Severidade | Esforço Est. |
|----|--------|------|-----------|-------------|
| SYS-1 | app.js monolito (~2500 linhas) | Frontend | ALTO | 16-24h |
| SYS-2 | HTML com lógica inline (gdp-contratos 79KB) | Frontend | ALTO | 16-24h |
| SYS-3 | Apenas 3 test files (cors, health, nf-counter) | Qualidade | ALTO | 24-40h |
| SYS-4 | Módulo system duplo (IIFE window.* + CommonJS) | Arquitetura | MÉDIO | 8-16h |
| SYS-5 | Sem error handling padronizado nas APIs | Backend | MÉDIO | 4-8h |
| SYS-6 | Sem logging estruturado (apenas console.log/warn) | Ops | MÉDIO | 4-8h |
| SYS-7 | Dependências CDN sem lock de versão | Frontend | BAIXO | 2-4h |
| SYS-8 | Sem CI/CD pipeline (deploy manual) | DevOps | ALTO | 8-16h |
| SYS-9 | Express server legado coexiste com Vercel | Arquitetura | BAIXO | 4-8h |
| SYS-10 | Duas sync layers sobrepostas (gdp-api + app-sync) | Arquitetura | MÉDIO | 8-16h |
| SYS-11 | TypeScript definitions (database.ts) mas código é JS | Qualidade | BAIXO | - |
| SYS-12 | Legacy Netlify functions em _archive/ | Cleanup | BAIXO | 1-2h |
| SEC-1 | Credenciais de escolas no repo | Segurança | CRÍTICO | 2-4h |
| SEC-2 | APIs sem auth middleware | Segurança | ALTO | 4-8h |
| SEC-3 | Certificados A1 em config_fiscal | Segurança | ALTO | 8-12h |

**Total estimado:** 105-192 horas

---

## 14. Próximos Passos (Brownfield Discovery)

- [x] **Fase 1:** System Architecture (@architect) ← ESTE DOCUMENTO
- [ ] **Fase 2:** Schema + DB Audit (@data-engineer)
- [ ] **Fase 3:** Frontend Spec (@ux-design-expert)
- [ ] **Fase 4:** Technical Debt DRAFT (@architect)
- [ ] **Fases 5-7:** Specialist Reviews + QA Gate
- [ ] **Fase 8:** Technical Debt Assessment (final)
- [ ] **Fase 9:** Executive Report (@analyst)
- [ ] **Fase 10:** Epic + Stories (@pm)

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 1 v2.0*
*Aria, arquitetando o futuro 🏗️*
