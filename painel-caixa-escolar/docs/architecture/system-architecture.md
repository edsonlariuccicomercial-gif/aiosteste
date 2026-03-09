# System Architecture — LicitIA MG (Painel Caixa Escolar)

**Fase:** Brownfield Discovery — Fase 1
**Agente:** @architect (Aria)
**Data:** 2026-03-09
**Versao:** 1.0

---

## 1. Visao Geral

LicitIA MG e uma plataforma de inteligencia e operacao para fornecedores de caixas escolares de Minas Gerais, integrada ao fluxo real do SGD (Sistema de Gestao Descentralizada). O sistema organiza oportunidades, sugere precos competitivos e automatiza o envio de propostas.

### 1.1 Stack Tecnologico

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Frontend | Vanilla JavaScript (sem framework) | ES6+ |
| CSS | Custom CSS com CSS Variables (design tokens) | - |
| Backend Local | Node.js + Express.js | 4.21.2 |
| Serverless | Netlify Functions (esbuild) | - |
| Scheduler | node-cron | 3.0.3 |
| Data Layer | JSON flat files | - |
| Automacao | Playwright (browser scraping) | devDependency |
| Libs Frontend | SheetJS (Excel), PDF.js 3.11.174 | CDN |
| Deploy | Netlify (static + functions) | - |
| Blob Storage | @netlify/blobs | 10.7.0 |

### 1.2 Decisoes Arquiteturais

| Decisao | Justificativa |
|---------|--------------|
| Sem framework frontend | Simplicidade, publico de escolas, zero build step |
| JSON flat files (sem DB) | Deploy facil, sem custo de infra, dados locais |
| Playwright para scraping | SGD renderiza client-side, precisa browser real |
| Netlify Functions | Serverless barato, bypass CORS do SGD |
| Multi-SRE via networkId | Cada regional tem ID diferente na API SGD |
| Fuzzy matching de itens | IDs nem sempre disponiveis, match por nome |

---

## 2. Arquitetura de Camadas

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Browser)                     │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │index.html│ │gdp-*.html│ │login.html│ │entregador   │ │
│  │ (main)   │ │(4 pages) │ │(SHA-256) │ │(PWA mobile) │ │
│  └────┬─────┘ └────┬─────┘ └──────────┘ └─────────────┘ │
│       │             │                                     │
│  ┌────┴─────────────┴────────────────────────────────┐   │
│  │              app.js (2546 linhas, 94.8 KB)         │   │
│  │  6 tabs: Orcamentos | Pre-Orc | Banco | SGD |     │   │
│  │          Portal | Entregador                       │   │
│  │  State: localStorage + sessionStorage              │   │
│  └────────────────────┬──────────────────────────────┘   │
└───────────────────────┼──────────────────────────────────┘
                        │ HTTP
┌───────────────────────┼──────────────────────────────────┐
│              BACKEND / SERVERLESS                          │
│  ┌────────────────────┴──────────────────────────────┐   │
│  │         Express Server (localhost:8082)             │   │
│  │  Routes:                                           │   │
│  │  GET  /api/sgd/status     → health check           │   │
│  │  POST /api/sgd/scan       → varredura SGD          │   │
│  │  POST /api/sgd/submit     → enviar proposta        │   │
│  │  POST /api/olist/order    → criar pedido Tiny      │   │
│  │  Cron: 20h diario (node-cron)                      │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │         Netlify Functions (producao)                │   │
│  │  sgd-proxy.js      → CORS bypass para SGD API      │   │
│  │  olist-order.js    → adapter Tiny API               │   │
│  │  send-order-email  → notificacoes                   │   │
│  │  sync-entregas.js  → sync entregas                  │   │
│  │  sync-pedidos.js   → sync pedidos                   │   │
│  └───────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                  INTEGRACOES EXTERNAS                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │   SGD API     │ │  Tiny API     │ │  PNCP (precos)   │  │
│  │ caixaescolar  │ │ tiny.com.br   │ │  governo federal │  │
│  │ .educacao     │ │ pedido.incluir│ │  fetch-pncp      │  │
│  │ .mg.gov.br    │ │              │ │  -prices.js      │  │
│  └──────────────┘ └──────────────┘ └──────────────────┘  │
└──────────────────────────────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                    DATA LAYER (JSON)                       │
│  dashboard/data/                                          │
│  ├── orcamentos.json        → Orcamentos SGD coletados    │
│  ├── pre-orcamentos.json    → Pre-cotacoes locais         │
│  ├── sre-uberaba.json       → Cadastro escolas (92)       │
│  ├── banco-precos.json      → Catalogo de precos (12+)    │
│  ├── lariucci-arp-2025.json → ARP vigente (343 itens)     │
│  ├── quotes.json            → Historico de cotacoes        │
│  ├── olist-orders.json      → Pedidos sincronizados        │
│  ├── sgd-scan-log.json      → Metadados de varredura       │
│  ├── sgd-collect-meta.json  → Metadados de coleta          │
│  ├── sgd-prequote-*.json    → Payloads de pre-cotacao      │
│  ├── escolas-credentials.json → Credenciais escolas        │
│  └── perfil.json            → Perfil do usuario            │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Frontend

### 3.1 Paginas (7 HTML)

| Pagina | Tamanho | Funcao |
|--------|---------|--------|
| `index.html` | 15.6 KB | Dashboard principal (6 tabs) |
| `login.html` | 3.5 KB | Login SHA-256 |
| `gdp-dashboard.html` | 25.4 KB | Gestao de Pedidos Pos-Licitacao |
| `gdp-contratos.html` | 78.9 KB | Gerenciamento de contratos |
| `gdp-gestao.html` | 26 KB | Painel administrativo |
| `gdp-portal.html` | 42.3 KB | Portal para escolas fazerem pedidos |
| `gdp-entregador.html` | 21 KB | App de entregas (PWA mobile) |

### 3.2 Arquitetura do app.js (Monolito Frontend)

```
app.js (2546 linhas)
├── Estado Global
│   ├── orcamentos[]           → Lista de orcamentos SGD
│   ├── preOrcamentos{}        → Pre-cotacoes locais
│   ├── bancoPrecos{}          → Catalogo de precos
│   ├── selectedOrcIds Set()   → Selecao em lote
│   └── sgdAvailable bool      → Conectividade SGD
│
├── Cache de DOM (100+ elementos)
│
├── Tab: Orcamentos
│   ├── KPI Dashboard (5 metricas)
│   ├── Filtros (escola, municipio, grupo, status, texto)
│   ├── Tabela com selecao em lote
│   └── Export CSV (SheetJS)
│
├── Tab: Pre-Orcamentos
│   ├── Geracao individual e em lote
│   └── Auto-save localStorage
│
├── Tab: Banco de Precos
│   ├── CRUD de itens
│   ├── Import Excel (XLSX)
│   └── Faixa sugerida (piso/alvo/teto)
│
├── Tab: SGD
│   ├── Listagem via proxy Netlify
│   ├── Envio de propostas
│   └── Painel de inteligencia (analytics)
│
├── Tab: Portal
│   └── Gestao de pedidos pos-licitacao
│
└── Tab: Entregador
    └── Dashboard de entregas (mobile)
```

### 3.3 Gerenciamento de Estado

- **Persistencia:** `localStorage` para pre-orcamentos, banco de precos, credenciais
- **Sessao:** `sessionStorage` para auth guard (`ce.auth`)
- **Sync:** Auto-save em cada edicao
- **Nao ha:** State management library, reactive bindings, virtual DOM

---

## 4. Backend

### 4.1 Express Server (server.js — 14.5 KB)

**Porta:** 8082 (configuravel via `PORT` env)

| Rota | Metodo | Funcao |
|------|--------|--------|
| `/api/sgd/status` | GET | Health check + timestamp ultima varredura |
| `/api/sgd/scan` | POST | Varredura completa SGD (filtro SRE Uberaba) |
| `/api/sgd/submit` | POST | Enviar proposta ao SGD |
| `/api/olist/order` | POST | Criar pedido no Tiny/Olist |
| `/*` | GET | Arquivos estaticos do dashboard |

### 4.2 Cron Job

```javascript
// Varredura diaria as 20h UTC
cron.schedule("0 20 * * *", async () => {
  await executeSgdScan();
});
```

### 4.3 Algoritmo de Varredura SGD

```
1. Login via SgdClient (CNPJ + senha)
2. Buscar orcamentos com status "NAEN" (Nao Enviada)
3. Carregar lista de escolas SRE Uberaba (sre-uberaba.json)
4. Filtrar por nome normalizado (remove acentos, uppercase)
5. Para cada orcamento:
   a. Buscar detalhe (objeto, datas, valores, eixo)
   b. Buscar itens (SKU, unidades, quantidades)
6. Merge com orcamentos.json existente (preservar status local)
7. Salvar lista atualizada + log de varredura
```

---

## 5. SGD API Client (sgd-client.js — 5.2 KB)

**Classe:** `SgdClient(cnpj, password)`
**Base URL:** `https://api.caixaescolar.educacao.mg.gov.br`

| Metodo | Endpoint | Funcao |
|--------|----------|--------|
| `login()` | POST /auth/login | Autentica, extrai sessionToken |
| `getUser()` | GET /auth/user | Resolve networkId |
| `listBudgets()` | GET /budget-proposal/summary-by-supplier-profile | Lista orcamentos (paginado 50/pg) |
| `getBudgetDetail()` | GET /budget/by-subprogram/.../by-school/.../by-budget/... | Detalhe do orcamento |
| `getBudgetItems()` | GET /budget-item/by-subprogram/.../by-school/.../by-budget/... | Itens do orcamento |
| `sendProposal()` | POST /budget-proposal/send-proposal/... | Envia proposta |
| `scanAllBudgets()` | Loop paginado | Varredura completa |

**Multi-SRE:** Cada orcamento pode pertencer a uma SRE diferente. O client troca `networkId` via header `x-network-being-managed-id`.

---

## 6. Netlify Functions (Serverless)

| Funcao | Tamanho | Proposito |
|--------|---------|-----------|
| `sgd-proxy.js` | 4.2 KB | Bypass CORS para SGD API (acoes: login, list-budgets, budget-detail, budget-items, send-proposal) |
| `olist-order.js` | 4.3 KB | Adapter para Tiny API com idempotencia (`portal-order:{orderId}`) |
| `send-order-email.js` | 6.2 KB | Notificacoes por email de pedidos |
| `sync-entregas.js` | 2.7 KB | Sincronizacao de entregas |
| `sync-pedidos.js` | 2.6 KB | Sincronizacao de pedidos |

---

## 7. Data Layer

### 7.1 Modelo de Dados (JSON Flat Files)

**Nao ha banco de dados relacional.** Toda persistencia usa arquivos JSON em `dashboard/data/`.

#### Entidade Principal: Orcamento SGD

```json
{
  "id": "string",
  "idBudget": "number",
  "ano": "number",
  "escola": "string",
  "municipio": "string",
  "sre": "string",
  "grupo": "string",
  "subPrograma": "string",
  "objeto": "string",
  "prazo": "string (ISO date)",
  "prazoEntrega": "string",
  "status": "string (NAEN, ENVI, etc.)",
  "participantes": "number",
  "itens": "array",
  "idAxis": "string",
  "idNetwork": "string",
  "valorEstimado": "number",
  "expenseGroupId": "string",
  "idSchool": "string",
  "idSubprogram": "string"
}
```

#### Entidade: Item de Preco

```json
{
  "id": "string",
  "grupo": "string",
  "item": "string",
  "unidade": "string",
  "custoBase": "number",
  "margemPadrao": "number",
  "precoReferencia": "number",
  "ultimaCotacao": "string (ISO date)",
  "fonte": "string"
}
```

### 7.2 Volumes de Dados

| Arquivo | Registros | Tamanho |
|---------|-----------|---------|
| sre-uberaba.json | 92 escolas / 25 municipios | 5.2 KB |
| banco-precos.json | 12 itens | 3.8 KB |
| lariucci-arp-2025.json | 32 escolas x 343 itens | 34.5 KB |
| quotes.json | Historico | 30.3 KB |
| orcamentos.json | Variavel (varredura diaria) | Variavel |

---

## 8. Scripts Operacionais (34 scripts)

### 8.1 Categorias

| Categoria | Scripts | Funcao |
|-----------|---------|--------|
| SGD Integration | 5 | Coleta, payload, envio, PNCP |
| Olist/Tiny Sync | 3 | Sync pedidos, adapter, teste |
| Operational Reports | 8 | Snapshot diario, handoff, trend, alertas |
| SKU/Territory Audit | 4 | Cobertura SKU, territorio, CSV |
| Price History | 3 | Historico, resumo, validacao |
| Discovery | 5 | Entrevistas, validacao, sprint |
| Commercial | 3 | Status executivo, kit, onboarding |

### 8.2 Scripts npm (package.json raiz — 43+ comandos)

```
ops:daily          → Pipeline diaria completa
ops:health         → Health check GO/NO-GO
ops:start-day      → Abertura do dia
ops:end-day        → Fechamento do dia
ops:monitor        → Monitoramento proativo
ops:trend          → Tendencia semanal KPI
discovery:cycle    → Workflow completo discovery
commercial:kit     → Pacote comercial
exec:status        → Visao executiva consolidada
orders:sync:olist  → Sincronizacao Olist
```

---

## 9. Seguranca

### 9.1 Pontos Fortes

| Aspecto | Implementacao |
|---------|--------------|
| SGD Auth | Session tokens com 24h de validade |
| Multi-SRE | networkId isolado por regional |
| Idempotencia | Chave unica por pedido no Tiny |
| Credenciais SGD | Armazenadas em .env (nao commitado) |

### 9.2 Debitos de Seguranca Identificados

| ID | Debito | Severidade | Impacto |
|----|--------|-----------|---------|
| SEC-1 | Login client-side com SHA-256 hardcoded (auth.js) | CRITICO | Credenciais expostas no codigo-fonte |
| SEC-2 | localStorage armazena dados sensiveis (pre-cotacoes, credenciais) | ALTO | Dados acessiveis via DevTools |
| SEC-3 | Netlify Functions sem autenticacao (apenas CORS) | ALTO | Qualquer cliente pode chamar as funcoes |
| SEC-4 | CNPJ/senha em plaintext no .env | MEDIO | Risco se .env vazar |
| SEC-5 | escolas-credentials.json com credenciais de escolas | CRITICO | Credenciais de terceiros no repo |
| SEC-6 | Sem rate limiting nas APIs | MEDIO | Vulneravel a abuso |
| SEC-7 | Sem validacao de input nas propostas | MEDIO | Dados malformados podem chegar ao SGD |

---

## 10. Performance

| Metrica | Valor Atual | Observacao |
|---------|-------------|-----------|
| Bundle JS principal | 94.8 KB (app.js) | Monolito, sem code splitting |
| Paginas HTML | 3.5 - 78.9 KB | gdp-contratos.html e maior |
| CSS | 18.8 KB | Arquivo unico |
| Libs externas | SheetJS + PDF.js via CDN | Carregamento lazy |
| Cache DOM | 100+ refs | Boa pratica, evita re-query |
| API Pagination | 50 items/page | Adequado |
| Cron | 1x/dia (20h) | Baixa carga |

---

## 11. Deploy

### 11.1 Local

```bash
cd squads/caixa-escolar && npm start
# http://localhost:8082
```

### 11.2 Producao (Netlify)

- **URL:** https://painel-caixa-escolar.netlify.app
- **Build:** Sem build step (static files)
- **Functions:** 5 funcoes serverless (esbuild)
- **Redirects:** `/api/*` → `/.netlify/functions/*`

---

## 12. Fluxos de Dados

### 12.1 Coleta SGD → Dashboard

```
Playwright Script (collect-sgd-orcamentos.js)
  └→ Login browser automatizado
     └→ SGD API (paginado, 50/pg)
        └→ Filtro SRE Uberaba
           └→ Enrich (detalhe + itens)
              └→ Merge orcamentos.json
                 └→ Dashboard renderiza
```

### 12.2 Proposta → SGD

```
Dashboard UI (formulario/lote)
  └→ Build payload (items, precos, marcas)
     └→ POST /api/sgd/submit (Express)
        └→ SgdClient.sendProposal()
           └→ SGD API aceita proposta
              └→ Salvar report + status
```

### 12.3 Pedido → Tiny/Olist

```
Portal GDP (escola seleciona itens)
  └→ POST /api/olist/order
     └→ olist-order.js (Netlify Function)
        └→ Build Tiny payload
           └→ POST api.tiny.com.br (idempotente)
              └→ Retorna Tiny order ID
```

---

## 13. Debitos Tecnicos Identificados (Nivel Sistema)

| ID | Debito | Area | Severidade | Esforco Est. |
|----|--------|------|-----------|-------------|
| SYS-1 | app.js monolito (2546 linhas) | Frontend | ALTO | 16-24h |
| SYS-2 | Sem testes automatizados | Qualidade | ALTO | 24-40h |
| SYS-3 | HTML duplicado (7 paginas com logica inline) | Frontend | MEDIO | 8-16h |
| SYS-4 | JSON flat files sem validacao de schema | Data | MEDIO | 8-12h |
| SYS-5 | Sem error handling padronizado | Backend | MEDIO | 4-8h |
| SYS-6 | Sem logging estruturado | Ops | MEDIO | 4-8h |
| SYS-7 | Dependencias sem lock de versao (CDN) | Frontend | BAIXO | 2-4h |
| SYS-8 | Sem CI/CD pipeline | DevOps | ALTO | 8-16h |
| SYS-9 | Sem health monitoring em producao | Ops | MEDIO | 4-8h |
| SYS-10 | PWA entregador sem offline-first completo | Frontend | BAIXO | 8-16h |
| SEC-1 | Login hardcoded (auth.js) | Seguranca | CRITICO | 4-8h |
| SEC-2 | localStorage com dados sensiveis | Seguranca | ALTO | 8-12h |
| SEC-3 | Netlify Functions sem auth | Seguranca | ALTO | 4-8h |
| SEC-5 | Credenciais de escolas no repo | Seguranca | CRITICO | 2-4h |

**Total estimado:** 104-184 horas

---

## 14. Proximos Passos (Brownfield Discovery)

- [x] **Fase 1:** Documentacao de Sistema (@architect) ← ESTE DOCUMENTO
- [ ] **Fase 2:** Auditoria de Dados (@data-engineer)
- [ ] **Fase 3:** Especificacao Frontend (@ux-design-expert)
- [ ] **Fase 4:** Consolidacao DRAFT (@architect)
- [ ] **Fases 5-7:** Validacao especialistas
- [ ] **Fase 8:** Assessment final
- [ ] **Fase 9:** Relatorio executivo
- [ ] **Fase 10:** Epic + Stories

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 1*
*Aria, arquitetando o futuro*
