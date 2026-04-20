# Frontend Specification — Painel Caixa Escolar (Licit-AIX)

**Gerado em:** 2026-04-20
**Fase:** Brownfield Discovery - Phase 3 (UX/Frontend)
**Autor:** @ux-design-expert (Uma)

---

## 1. Visao Geral da Interface

O sistema **Licit-AIX** (anteriormente "LicitIA MG") e um painel operacional voltado para **fornecedores de caixas escolares do estado de Minas Gerais**. O objetivo principal e auxiliar o fornecedor a:

- Monitorar oportunidades de licitacao (orcamentos abertos no SGD)
- Precificar itens de forma competitiva com inteligencia de dados
- Gerar pre-orcamentos e enviar propostas ao SGD
- Gerenciar contratos pos-licitacao (GDP - Gestao de Pedidos)
- Acompanhar entregas e estoque

**Usuarios-alvo:**
- Fornecedor principal (admin): Gerencia precos, propostas e contratos
- Operadores: Auxiliam na precificacao e envio de propostas
- Entregadores (mobile): Visualizam rotas e confirmam entregas
- Escolas (portal): Acompanham status de pedidos e fazem solicitacoes

**Stack tecnologica:** Vanilla JavaScript (sem framework), HTML5, CSS3 custom properties, comunicacao via JSON/fetch com APIs Netlify Functions.

---

## 2. Inventario de Telas

O projeto possui **duas versoes** do frontend coexistindo:

### 2.1 Dashboard Legacy (`painel-caixa-escolar/dashboard/`)

| Arquivo | Proposito |
|---------|-----------|
| `index.html` | Dashboard operacional unico (Single Page) com KPIs, filtros, simulador de preco e tabela de cotacoes |

**Nota:** Esta versao e um SPA monolitico com um unico arquivo `app.js` (~1734 linhas). Nao possui sistema de autenticacao, sidebar ou navegacao entre modulos.

### 2.2 Dashboard Atual (`painel-caixa-escolar/squads/caixa-escolar/dashboard/`)

| Arquivo | Proposito |
|---------|-----------|
| `login.html` | Tela de autenticacao (SHA-256 client-side) |
| `dashboard-home.html` | Home com KPIs consolidados e globo interativo de SREs |
| `index.html` | Painel principal multi-modulo (Radar, Intel Precos, GDP) |
| `gdp-contratos.html` | GDP - Contratos pos-licitacao com gestao completa |
| `gdp-dashboard.html` | Dashboard geral do GDP com KPIs e visao executiva |
| `gdp-gestao.html` | Workflow de gestao de pedido individual |
| `gdp-entregador.html` | App mobile (PWA) para entregadores |
| `gdp-estoque-intel-mobile.html` | App mobile (PWA) para gestao de estoque inteligente |
| `gdp-portal.html` | Portal escolar - interface para escolas acompanharem pedidos |

**Total: 9 paginas HTML no dashboard ativo + 1 pagina no legacy.**

---

## 3. Componentes UI

### 3.1 KPI Cards

**Presentes em praticamente todas as telas.** Padroes identificados:

- **Legacy:** `<article class="card kpi">` com `<p>` label + `<strong>` valor
- **Atual:** `.pricing-kpi-card`, `.kpi-card`, `.intel-card` — multiplas classes sem padrao unico
- **GDP:** `.kpi` com `.kpi-label`, `.kpi-value`, `.kpi-sub`

KPIs exibidos incluem: cotacoes abertas, prazo urgente, margem media, receita potencial, pedidos sincronizados, faturamento, taxa de conversao, etc.

### 3.2 Tabelas

Componente mais recorrente do sistema. Todas utilizam `<table>` nativo com:

- Headers `<thead>` com `<th>` estilizados
- Corpos `<tbody>` renderizados via `innerHTML` (string templates)
- Overflow horizontal via `.table-wrap` wrapper
- Nenhuma biblioteca de grid/table (ex: DataTables)

Tabelas identificadas: orcamentos, pre-orcamento, banco de precos, SGD fila, historico, rentabilidade, contratos, usuarios, itens mestres, timeline de precos, fornecedores ranking.

### 3.3 Formularios

- **Filtros:** Selects (`<select>`) e inputs de texto para busca, combinados em grids (`.filters`, `.control-grid`, `.filters-8col`)
- **Pre-orcamento:** Inputs numericos inline em tabelas para edicao de precos
- **Configuracoes:** Formularios completos com labels, inputs de texto/numero, selects, textareas e checkboxes
- **Modal de item:** Formulario de cadastro/edicao com campos de texto, numero e select
- **Validacao:** Praticamente inexistente no HTML; feita de forma imperativa no JS

### 3.4 Modais (Overlays)

Modais identificados no `index.html` do dashboard ativo:

| Modal ID | Proposito |
|----------|-----------|
| `modal-import` | Importacao de mapas de preco (Excel, PDF, imagem, DOCX) |
| `modal-banco` | Cadastro/edicao de item no banco de precos |
| `modal-resultado` | Registrar resultado (ganho/perdido) de proposta |
| `modal-contrato` | Detalhes de contrato |
| `modal-fontes` | Fontes de preco B2B |
| `modal-mestres` | Itens mestres do banco de precos |
| `modal-timeline` | Historico de precos de um item |
| `modal-b2b` | Importacao de precos de sites de fornecedores |
| `modal-vincular-produto` | Vincular produto do orcamento a item do banco |

Padrao: `.modal-overlay` (backdrop) + `.modal.card` (container) + `.modal-actions` (botoes).

### 3.5 Filtros e Quick Actions

- **Quick Actions (Legacy):** Botoes de filtro rapido (Tudo, Prioridade Alta, Prazo 48h, Baixa Confianca) com classe `.active`
- **Filtros (Atual):** Grid de selects + inputs combinados (SRE, escola, municipio, grupo, status, periodo, texto livre)
- **Batch Bar:** Barra de acoes em lote para itens selecionados (pre-orcar, exportar, descartar)

### 3.6 Charts/Graficos

Nao utiliza nenhuma biblioteca de graficos (Chart.js, D3, etc.). Os "graficos" sao renderizados via:

- Barras horizontais com CSS (divs com width proporcional)
- KPI cards com valores numericos
- Chips/badges com metricas
- Overview chips horizontais scrollaveis para categorias

### 3.7 Navegacao

**Dashboard ativo:**
- **Sidebar:** Fixa a esquerda (`220px`), com items de navegacao por modulo (Radar, Intel Precos, GDP, Config)
- **Tabs:** Navegacao secundaria dentro de modulos (`.tabs` com `.tab` buttons)
- **Sub-tabs:** Dentro de tabs, ex: rentabilidade (por escola/produto/grupo)
- **Topbar:** Header fixo com titulo, indicador de modo, pills e botoes de acao

**Legacy:** Sem navegacao — pagina unica scroll vertical.

### 3.8 Badges e Indicators

- `.badge` com variantes: `.badge-blue`, `.badge-green`, `.badge-yellow`, `.badge-red`, `.badge-purple`
- `.pill` para status (Legacy)
- `.sync-badge` com status: ok, pending, queue, sent, failed
- `.prequote-status` com variantes: draft, approved
- `.overview-chip` para categorias com contagem
- `.alert-badge` para prazos

### 3.9 Simulador de Preco

**Legacy:** Grid de inputs (custo, frete, opex, imposto, margem) com resultado calculado em tempo real.

**Atual:** Simulador de cenarios com cards (Conservador 35%, Moderado 25%, Agressivo 15%, Otimo) e slider de margem global com preview interativo.

---

## 4. Estado da Aplicacao

### 4.1 Variaveis Globais (Legacy `app.js`)

```javascript
let quotes = [];             // Cotacoes do SGD
let syncStatus = {};         // Status de sincronizacao
let quickMode = "all";       // Filtro rapido ativo
let skuCosts = {};           // Custos por SKU
let objectSkuRules = {};     // Regras de classificacao
let priceHistorySummary = {};// Historico de precos
let opsDailyReport = {};     // Relatorio operacional
let opsAlertsReport = {};    // Alertas
let opsTrendHistory = {};    // Tendencia semanal
let internalOrders = [];     // Pedidos internos
let prequoteState = {};      // Estado de pre-cotacoes
let expandedGroups = new Set(); // Grupos expandidos na UI
```

### 4.2 Estado (Dashboard Atual `app-state.js`)

```javascript
let orcamentos = [];         // Orcamentos do SGD
let bancoPrecos = {};        // Banco de precos local
let preOrcamentos = {};      // Pre-orcamentos salvos
let descartados = new Set(); // IDs descartados
let selectedOrcIds = new Set(); // Selecao em lote
let activePreOrcamentoId = null; // Pre-orcamento ativo
```

### 4.3 Persistencia

| Mecanismo | Uso |
|-----------|-----|
| `localStorage` | Estado primario — pre-orcamentos, banco de precos, descartados, configuracoes, itens mestres, orcamentos em cache, autenticacao, modulos ativos |
| `sessionStorage` | Token de autenticacao (hash SHA-256) |
| Fetch JSON | Dados estaticos do servidor (`./data/*.json`) |
| Netlify Functions API | Sincronizacao cloud, scraping SGD, PNCP |

**Riscos identificados:**
- `localStorage` como storage primario (limite ~5-10MB, sem backup automatico real)
- Dados criticos (pre-orcamentos, banco de precos) sem versionamento server-side robusto
- Sem mecanismo de conflito de sessao (multiplas abas)
- Autenticacao client-side com hash fixo (inseguro)

---

## 5. Padroes de Interacao

### 5.1 Renderizacao

Todas as telas usam **renderizacao imperativa via innerHTML**:

```javascript
el.container.innerHTML = items.map(item => `<div>...</div>`).join("");
```

Nao ha Virtual DOM, diffing, ou reconciliacao. Cada mudanca de estado re-renderiza a secao inteira.

### 5.2 Event Handling

- **Event delegation** em containers (ex: `el.prequoteOrders.addEventListener("click", ...)`)
- **Direct binding** em elementos individuais (`el.sre.addEventListener("change", ...)`)
- **Inline handlers** em HTML (`onclick="window.location.href='...'")` — inconsistente
- **Debounce** para inputs de texto (300ms)

### 5.3 Fluxos Principais

1. **Radar:** Carrega orcamentos SGD -> Filtra -> Visualiza por grupo/objeto -> Seleciona -> Pre-orca
2. **Pre-Orcamento:** Seleciona orcamento -> Auto-preenche banco -> Ajusta precos -> Aprova
3. **SGD:** Lista aprovados -> Gera payload/PDF -> Envia ao SGD (manual ou automatico)
4. **Resultado:** Registra ganho/perda -> Atualiza historico -> Alimenta inteligencia de precos
5. **GDP:** Contrato ativo -> Pedido separado -> Nota fiscal -> Entrega

### 5.4 Auto-refresh

**Legacy:** Timer de 60s com `setInterval` + countdown ticker + botao manual.

**Atual:** Sem auto-refresh; dados carregados no boot e persistidos localmente.

---

## 6. Comunicacao com API

### 6.1 Endpoints (Dashboard Legacy)

Comunicacao via `fetch()` com arquivos JSON estaticos no servidor:

| Endpoint | Dados |
|----------|-------|
| `./data/quotes.json` | Cotacoes do SGD |
| `./data/sync-status.json` | Status de sincronizacao |
| `./data/sku-costs.json` | Custos por SKU |
| `./data/object-sku-rules.json` | Regras de classificacao objeto->SKU |
| `./data/internal-orders.json` | Pedidos internos |
| `./data/price-history-summary.json` | Historico de precos |
| `./data/ops-daily-run-report.json` | Relatorio operacional |
| `./data/ops-trend-history.json` | Tendencia semanal |
| `./data/ops-alerts.json` | Alertas operacionais |

### 6.2 Endpoints (Dashboard Atual)

| Endpoint | Tipo | Proposito |
|----------|------|-----------|
| `data/sre-*.json` | Static | Dados por SRE |
| Netlify Functions | Dynamic | SGD scraping, PNCP, cloud sync |
| `app-sgd-client.js` | Client | Comunicacao direta com SGD |

### 6.3 Estrategia de Cache

**Legacy:**
- `cachedFetch()` com TTL de 5 min (default) ou 15 min (heavy)
- Cache em `Map` (`_fetchCache`)
- Invalidacao completa no refresh (`invalidateAllCaches()`)
- Memoizacao de calculos caros (`memo()`)

**Atual:**
- Cache primario em `localStorage`
- Carga de dados locais no boot (sem network hit)
- Sync cloud em background (`schedulCloudSync()`)
- Data versioning para invalidar cache antigo

---

## 7. Design System Atual

### 7.1 Paleta de Cores

**Tema principal (Dashboard Ativo):**

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0d1412` | Fundo principal |
| `--bg-soft` | `#131f1a` | Fundo secundario |
| `--card` | `rgba(21, 34, 28, 0.84)` | Background de cards |
| `--line` | `rgba(143, 197, 157, 0.2)` | Bordas e divisores |
| `--text` | `#e6f3ec` | Texto principal |
| `--muted` | `#9bb7a8` | Texto secundario |
| `--accent` | `#4ec98a` | Cor de destaque (verde) |
| `--warning` | `#f4b942` | Alertas (amarelo) |
| `--danger` | `#ff6f6f` | Erros/urgencia (vermelho) |

**Tema GDP (paginas independentes):**

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0f172a` | Fundo (azul escuro) |
| `--surface` | `#1e293b` | Cards |
| `--accent` | `#3b82f6` | Destaque (azul) |
| `--success` | `#22c55e` | Sucesso (verde) |
| `--warning` | `#f59e0b` | Alerta (amarelo) |
| `--danger` | `#ef4444` | Erro (vermelho) |

**Problema:** Ha dois sistemas de cores (verde-escuro vs azul-escuro) que nao compartilham tokens.

### 7.2 Tipografia

- **Fonte principal:** `"Inter", "Segoe UI", system-ui, -apple-system, sans-serif`
- **Fallback (Legacy):** `"Segoe UI", "Trebuchet MS", sans-serif`
- **Tamanho base:** `14px` (html font-size)
- **Titulos:** `clamp(1.5rem, 3vw, 2.2rem)` para h1, `1.05rem` para h2
- **Labels:** `12px` com `text-transform: uppercase; letter-spacing: 0.08em`
- **Body text:** `13px` em tabelas, `12px` em meta info

### 7.3 Espacamento

- **Gap padrao:** `14px` (var `--gap`)
- **Padding de cards:** `14px`
- **Border-radius:** `10px` (var `--radius`), `14px` em cards, `999px` em pills
- **Layout grid gap:** `14px` entre cards, `12px` entre KPIs

### 7.4 Layout

- **Main layout:** CSS Grid de coluna unica
- **KPIs:** Grid responsivo (`repeat(5, minmax(0, 1fr))` no legacy, `repeat(auto-fit, minmax(200px, 1fr))` no atual)
- **Sidebar + Main:** Layout com sidebar fixa (220px) + main area com margem esquerda
- **Cards:** Background semitransparente com blur, bordas sutis

---

## 8. Responsividade

### 8.1 Breakpoints

| Breakpoint | Aplicacao |
|------------|-----------|
| `max-width: 1000px` | KPIs 5col -> 2col, formularios 4col -> 2col |
| `max-width: 768px` | KPI home 3col -> 1col, sidebar colapsavel |
| `max-width: 640px` | Topbar empilha, KPIs 1col, tabelas font menor |

### 8.2 Padroes Responsivos

- **Sidebar:** Colapsavel em mobile via overlay (`.sidebar-overlay`)
- **Topbar:** `flex-direction: column` em mobile
- **Tabelas:** `overflow-x: auto` via `.table-wrap`
- **KPIs:** Grid adaptativo com `minmax()`
- **Modais:** `max-width: 90vw` para mobile

### 8.3 PWA (Mobile)

Duas paginas sao configuradas como PWA com manifest e service workers:
- `gdp-entregador.html` — App de entregador com `manifest-entregador.json` e `sw-entregador.js`
- `gdp-estoque-intel-mobile.html` — Estoque inteligente com `manifest-estoque-intel.json` e `sw-estoque-intel.js`

Ambas possuem `user-scalable=no`, `apple-mobile-web-app-capable`, e icones dedicados.

---

## 9. Acessibilidade

### 9.1 Status Atual

**Nivel: BAIXO.** Problemas identificados:

| Aspecto | Status | Detalhes |
|---------|--------|----------|
| Semantic HTML | Parcial | Usa `<article>`, `<section>`, `<header>`, `<nav>`, `<main>` em parte |
| ARIA roles | Ausente | Nenhum `role`, `aria-label`, `aria-describedby` nos componentes |
| Focus management | Ausente | Modais nao capturam foco, nao ha focus trap |
| Keyboard navigation | Ausente | Grupos expanciveis, tabs e modais sem suporte a teclado |
| Alt text | N/A | Sem imagens (usa emojis como icones) |
| Color contrast | Parcial | Texto `--muted` (#9bb7a8) sobre `--bg` (#0d1412) tem contraste aceitavel (~5.2:1) |
| Screen reader | Ausente | Atualizacoes dinamicas sem `aria-live`, tabelas sem `scope` |
| Form labels | Parcial | Labels existem mas nao usam `for` em todos os casos |
| Skip links | Ausente | Sem skip navigation |

### 9.2 Pontos Positivos

- `<html lang="pt-BR">` presente em todas as paginas
- `<meta viewport>` configurado
- Uso de `<label>` em formularios (wrapping pattern)
- `title` em botoes da sidebar

---

## 10. Bibliotecas Externas

### 10.1 CDN Dependencies (Dashboard Ativo)

| Biblioteca | Versao | CDN | Uso |
|-----------|--------|-----|-----|
| SheetJS (XLSX) | 0.20.3 | cdn.sheetjs.com | Import/export Excel |
| PDF.js | 3.11.174 | cdnjs.cloudflare.com | Leitura de PDFs |
| Mammoth.js | 1.6.0 | cdnjs.cloudflare.com | Leitura de DOCX |
| Tesseract.js | 5.x | cdn.jsdelivr.net | OCR em imagens |
| jsPDF | 2.5.1 | cdnjs.cloudflare.com | Geracao de PDF |
| jsPDF-AutoTable | 3.8.4 | cdnjs.cloudflare.com | Tabelas em PDF |
| JSZip | 3.10.1 | cdn.jsdelivr.net | Compactacao ZIP (GDP) |

### 10.2 Scripts Locais (Dashboard Ativo)

| Arquivo | Proposito |
|---------|-----------|
| `auth.js` | Autenticacao e controle de sessao |
| `app-state.js` | Definicoes de estado, constantes, helpers |
| `app-sync.js` | Sincronizacao cloud/local |
| `app-sgd-client.js` | Comunicacao com SGD via API |
| `app-utils.js` | Funcoes utilitarias |
| `app-config.js` | Configuracoes (empresa, fiscal, banco) |
| `app-banco.js` | Banco de precos — CRUD, import/export |
| `app-import.js` | Importacao multi-formato |
| `app-sgd-integration.js` | Integracao com SGD (envio/coleta) |
| `app-results.js` | Registro de resultados (ganho/perdido) |
| `radar-matcher.js` | Matching radar de oportunidades |
| `app.js` | Orquestrador principal, boot, renderizacao |
| `pricing-intel.js` | Inteligencia de precos, dashboard analitico |
| `js/banco-precos-client.js` | Client para banco de precos inteligente |

### 10.3 Zero Framework

O frontend NAO utiliza:
- React, Vue, Angular, Svelte, ou qualquer framework SPA
- Bundler (Webpack, Vite, Rollup, esbuild)
- Transpilador (Babel, TypeScript)
- CSS preprocessor (Sass, Less)
- Package manager para frontend (npm no browser)
- Component library (Material UI, Ant Design, etc.)

---

## 11. Problemas de UX Identificados

### 11.1 Arquitetura Monolitica

- **`app.js` legacy com 1734 linhas** — impossivel manter, testar ou reusar
- **Dashboard ativo com 14+ scripts** — melhor separacao mas sem modularidade real (ES Modules, import/export)
- **Nenhum build process** — sem tree-shaking, minificacao ou code splitting
- **Duplicacao de logica** entre legacy e ativo (ambos coexistem)

### 11.2 Ausencia de Component Architecture

- Componentes renderizados via string concatenation (`innerHTML`)
- Sem lifecycle, sem cleanup de event listeners
- Sem reusabilidade — KPI cards, tabelas, modais sao todos inline
- Cada pagina GDP (gdp-gestao, gdp-entregador, gdp-portal) duplica CSS inteiro inline

### 11.3 State Management Fragil

- Estado global em variaveis `let` no escopo de window
- `localStorage` como banco de dados primario (risco de perda)
- Sem observable/reactive pattern — renderizacao manual em cada mutacao
- Sem undo/redo ou historico de acoes

### 11.4 Performance

- Re-renderizacao completa de secoes via innerHTML a cada interacao
- Memoizacao manual (`memo()`) — propenso a bugs de invalidacao
- Paginacao implementada (50 items/page) mas apenas para a view de objetos
- Debounce apenas em inputs de texto (300ms)
- Sem lazy loading de modulos ou code splitting
- CDN libraries carregadas todas no head (blocking render)

### 11.5 Seguranca

- Autenticacao client-side com hash SHA-256 fixo (trivial de bypassar)
- Credenciais hardcoded no HTML (`AUTH_CONFIG.passHash`)
- `sessionStorage` para token (perdido ao fechar aba)
- Sem CSRF, rate limiting, ou protecao contra XSS
- `escapeHtml()` existe mas nao e usado universalmente

### 11.6 Inconsistencia de Design

- Dois sistemas de cores (verde-escuro no Radar/Intel, azul-escuro no GDP)
- CSS inline massivo em paginas GDP (nao usa stylesheet compartilhado)
- Multiplas variantes de componentes iguais (`.card` com estilos diferentes)
- Nomenclatura inconsistente (`.pricing-kpi-card` vs `.kpi-card` vs `.intel-card`)

### 11.7 Acessibilidade

- Nenhum suporte ARIA para widgets interativos
- Emojis como icones (sem alternativa textual)
- Foco nao gerenciado em modais
- Tabs customizadas sem keyboard navigation

### 11.8 Experiencia do Usuario

- Navegacao confusa entre dashboard-home, index.html, e paginas GDP individuais
- Sidebar inconsistente (presente em algumas paginas, ausente em outras)
- Modais excessivos (9+ modais em uma unica pagina)
- Feedback visual limitado em acoes assincronas
- Sem onboarding ou guia para novos usuarios
- Impressao e exportacao PDF funcional mas sem preview

---

## 12. Recomendacoes

### Prioridade Alta (Impacto critico)

| # | Recomendacao | Justificativa |
|---|-------------|---------------|
| 1 | **Migrar autenticacao para server-side** | Seguranca: auth client-side e trivialmente bypassavel |
| 2 | **Unificar design system** | Dois temas divergentes geram confusao visual e manutencao duplicada |
| 3 | **Implementar backup server-side do estado** | `localStorage` como storage primario e fragil — limpar browser perde tudo |
| 4 | **Eliminar dashboard legacy** | Coexistencia gera confusao; migrar funcionalidades restantes para o ativo |

### Prioridade Media (Qualidade e manutencao)

| # | Recomendacao | Justificativa |
|---|-------------|---------------|
| 5 | **Adotar modularizacao ES Modules** | Permite tree-shaking, lazy loading, testabilidade |
| 6 | **Implementar component library basica** | Eliminar duplicacao de KPI cards, tabelas, modais, badges |
| 7 | **Extrair CSS das paginas GDP para stylesheet compartilhado** | Cada pagina GDP tem ~200 linhas de CSS inline identico |
| 8 | **Adicionar build step minimo** (bundler) | Concatenacao, minificacao, source maps |
| 9 | **Implementar reactive state** | Substituir renderizacao manual por binding reativo simples |

### Prioridade Baixa (UX e acessibilidade)

| # | Recomendacao | Justificativa |
|---|-------------|---------------|
| 10 | **Implementar ARIA em componentes interativos** | Tabs, modais, accordions precisam de suporte keyboard + screen reader |
| 11 | **Substituir emojis por icones SVG** | Renderizacao consistente, acessivel, escalavel |
| 12 | **Unificar navegacao** | Sidebar unica em todas as paginas com roteamento consistente |
| 13 | **Adicionar skeleton/loading states** | Feedback visual durante carregamento de dados |
| 14 | **Implementar error boundaries** | Erros de rede nao devem quebrar toda a UI |
| 15 | **Consolidar paginas GDP em SPA** | 5 paginas HTML separadas poderiam ser um modulo com routing |

---

## Apendice A — Metricas de Tamanho

| Metrica | Valor |
|---------|-------|
| Total de paginas HTML | 10 |
| Total de arquivos JS (dashboard ativo) | 14 |
| Linhas de JS (legacy app.js) | ~1.734 |
| Linhas de CSS (styles.css ativo) | ~800+ |
| Bibliotecas CDN | 7 |
| Modais em uma pagina | 9 |
| Custom Properties (CSS vars) | ~12 tokens |
| Breakpoints responsivos | 3 |

## Apendice B — URLs SGD Integradas

| URL | Uso |
|-----|-----|
| `https://caixaescolar.educacao.mg.gov.br/compras/orcamentos` | Link "Validar no SGD" nos grupos de cotacao |

---

*Documento gerado automaticamente pela fase Brownfield Discovery do AIOX.*
