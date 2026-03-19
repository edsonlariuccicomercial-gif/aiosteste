# Frontend Specification — Caixa Escolar MG / LicitIA

> **Fase:** Brownfield Discovery — Phase 3 (UX/Frontend Assessment)
> **Agente:** @ux-design-expert (Uma)
> **Data:** 2026-03-09
> **Escopo:** `squads/caixa-escolar/dashboard/`

---

## 1. Visao Geral da Arquitetura UI

### 1.1 Stack Tecnologico

| Camada | Tecnologia | Observacoes |
|--------|-----------|-------------|
| **Linguagem** | Vanilla JS (ES2020+) | Sem framework (React, Vue, etc.) |
| **CSS** | CSS puro com custom properties | Sem preprocessador (Sass, Tailwind) |
| **Bundler** | Nenhum | Arquivos servidos diretamente |
| **Libs externas** | SheetJS (xlsx), pdf.js | Carregadas via CDN |
| **Hospedagem** | Netlify (Functions + Static) | Proxy SGD via Netlify Functions |
| **Persistencia** | localStorage + sessionStorage | Sem banco de dados client-side (IndexedDB) |

### 1.2 Mapa de Paginas

O sistema possui **7 paginas HTML independentes**, cada uma com CSS inline (exceto index.html que usa styles.css externo):

| Pagina | Arquivo | Funcao | Auth |
|--------|---------|--------|------|
| Login Fornecedor | `login.html` | Autenticacao SHA-256 client-side | Publico |
| Painel Fornecedor | `index.html` | Dashboard principal (orcamentos, pre-orcamentos, banco precos, SGD) | sessionStorage |
| GDP Dashboard | `gdp-dashboard.html` | Gestao de Pedidos pos-licitacao — visao fornecedor | Proprio |
| GDP Contratos | `gdp-contratos.html` | Upload de atas, parser de contratos, gestao de itens | Proprio |
| GDP Gestao | `gdp-gestao.html` | Workflow de pedido (pipeline visual com 7 fases) | Proprio |
| GDP Portal | `gdp-portal.html` | Portal da escola — catalogo, carrinho, pedidos | Login escola |
| GDP Entregador | `gdp-entregador.html` | App mobile de entrega — foto, assinatura, comprovante | Codigo acesso |

### 1.3 Navegacao entre Paginas

```
login.html ──[auth]──> index.html ──[link]──> gdp-dashboard.html
                                                    │
                                         ┌──────────┼──────────┐
                                         v          v          v
                                   gdp-contratos  gdp-gestao  gdp-portal
                                                               │
                                                          gdp-entregador
```

**Problema:** Nao ha navegacao unificada. Cada pagina GDP tem seu proprio topbar com links hardcoded. Nao existe um shell/layout compartilhado.

---

## 2. Inventario de Componentes

### 2.1 Componentes do Painel Fornecedor (index.html)

| Componente | Tipo | Reutilizavel | Descricao |
|------------|------|-------------|-----------|
| Topbar | Layout | Nao | Header com logo, pills info, botoes |
| KPI Cards | Data Display | Nao | 5 cards com metricas (abertos, urgentes, pendentes, faturamento, margem) |
| Intel Panel | Data Display | Nao | Painel colapsavel com graficos de barra (categorias, municipios) |
| Tabs | Navigation | Nao | 4 abas: Orcamentos, Pre-Orcamento, Banco de Precos, SGD |
| Filters | Form | Nao | Grid de filtros (escola, municipio, grupo, status, texto) |
| Batch Bar | Action Bar | Nao | Barra de acoes em lote para selecao multipla |
| Data Table | Data Display | Parcial | Tabelas com thead/tbody, porem renderizadas via innerHTML |
| Badges | Indicator | Sim | Status badges (aberto, vencendo, vencido, pendente, aprovado, recusado, enviado) |
| Modal Banco | Form | Nao | Modal para CRUD de itens do banco de precos |
| Modal Import | Form | Nao | Modal para importacao Excel/PDF com mapeamento de colunas |
| Toast | Feedback | Sim | Notificacoes toast (criadas dinamicamente) |
| Pre-Orcamento Form | Form | Nao | Formulario de pre-orcamento com itens editaveis (custo, margem) |
| SGD Fields | Form | Nao | Campos extras para envio ao SGD (datas, observacoes, garantia) |

### 2.2 Componentes GDP

| Componente | Pagina | Descricao |
|------------|--------|-----------|
| KPI Grid | Dashboard | Cards com metricas de contratos |
| School Cards Grid | Dashboard | Cards de escolas com info de saldo |
| Upload Zone | Contratos | Drag-and-drop para upload de atas (PDF/Excel) |
| Contract Parser | Contratos | Parser automatico de PDF/Excel para extrair itens |
| Progress Bar | Contratos | Barra de progresso de execucao contratual |
| Pipeline Visual | Gestao | Pipeline de 7 fases com icones e animacao pulse |
| Checklist | Gestao | Lista de verificacao com check animado |
| Timeline | Gestao | Timeline vertical de eventos |
| Product Grid | Portal | Grid de cards de produtos com controle de quantidade |
| Cart Float | Portal | Botao flutuante de carrinho |
| Steps Indicator | Portal | Indicador de progresso (4 passos) |
| Order Summary | Portal | Resumo do pedido com totais |
| Delivery Card | Entregador | Card de entrega com status |
| Photo Capture | Entregador | Captura de foto com camera |
| Signature Pad | Entregador | Canvas para assinatura digital |

---

## 3. Design System

### 3.1 Tokens de Cor

O sistema possui **dois design systems distintos** que nao compartilham tokens:

#### Painel Fornecedor (styles.css) — Tema Verde/Escuro

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0d1412` | Fundo principal |
| `--bg-soft` | `#131f1a` | Fundo secundario |
| `--card` | `rgba(21,34,28,0.84)` | Fundo de cards (glassmorphism) |
| `--line` | `rgba(143,197,157,0.2)` | Bordas |
| `--text` | `#e6f3ec` | Texto principal |
| `--muted` | `#9bb7a8` | Texto secundario |
| `--accent` | `#4ec98a` | Cor de destaque (verde) |
| `--warning` | `#f4b942` | Alertas |
| `--danger` | `#ff6f6f` | Erros/perigo |
| `--radius` | `10px` | Border radius padrao |
| `--gap` | `14px` | Gap padrao |

#### Paginas GDP — Tema Azul/Slate

| Token | Valor | Uso |
|-------|-------|-----|
| `--bg` | `#0f172a` | Fundo principal |
| `--surface` / `--s1` | `#1e293b` | Superficie primaria |
| `--surface2` / `--s2` | `#334155` | Superficie secundaria |
| `--border` / `--bdr` | `#475569` | Bordas |
| `--text` / `--txt` | `#f1f5f9` | Texto principal |
| `--accent` / `--blue` | `#3b82f6` | Cor de destaque (azul) |
| `--success` / `--green` | `#22c55e` | Sucesso |
| `--warning` / `--yellow` | `#f59e0b` | Alertas |
| `--danger` / `--red` | `#ef4444` | Erros |

### 3.2 Tipografia

| Propriedade | Painel Fornecedor | GDP |
|-------------|-------------------|-----|
| **Font Family** | Inter, Segoe UI, system-ui | Segoe UI, system-ui |
| **Font Size Base** | 14px | Nao definido (16px browser default) |
| **Heading H1** | clamp(1.2rem, 2.5vw, 1.6rem) | 1.1rem-1.4rem |
| **Body Text** | 0.82rem | 0.85rem |
| **Small/Labels** | 0.72rem-0.78rem | 0.7rem-0.75rem |
| **Monospace** | JetBrains Mono, Fira Code | monospace |

### 3.3 Espacamento

- **Painel:** Usa `--gap: 14px` como unidade base
- **GDP:** Usa valores rem arbitrarios (0.5rem, 1rem, 1.5rem, 2rem)
- **Nao ha scale de espacamento consistente** em nenhum dos dois sistemas

### 3.4 Componentes Visuais Comuns

| Componente | Painel | GDP | Consistente? |
|------------|--------|-----|-------------|
| **Buttons** | `.btn`, `.btn-sm`, `.btn-accent`, `.btn-danger` | `.btn`, `.btn-primary`, `.btn-success`, `.btn-outline` | NAO |
| **Badges** | `.badge-aberto`, `.badge-vencendo`, etc. | `.badge-blue`, `.badge-green`, etc. | NAO |
| **Cards** | `.card` (glassmorphism) | Background solido com border | NAO |
| **Tables** | Custom com hover sutil | Custom com sticky header | NAO |
| **Modals** | `.modal-overlay` + `.modal` | Inline sections | NAO |
| **Inputs** | Background escuro, border accent no focus | Mesmo padrao, tamanhos diferentes | PARCIAL |

---

## 4. Fluxos de Usuario

### 4.1 Fluxo Principal: Login -> Dashboard -> Pre-Orcamento -> Envio SGD

```
1. Usuario acessa login.html
2. Insere usuario/senha (client-side SHA-256)
3. Redirecionado para index.html
4. Dashboard carrega dados (JSON local + localStorage)
5. KPIs e tabela de orcamentos sao exibidos
6. Usuario clica "Pre-Orcar" em um orcamento
   → Troca para aba Pre-Orcamento
   → Auto-preenche itens com dados do banco de precos
7. Usuario ajusta custo, margem, marca de cada item
8. Clica "Aprovar" → salva no localStorage com status "aprovado"
9. Troca para aba SGD → ve fila de envio
10. Clica "Enviar ao SGD" → envia via proxy Netlify ou servidor local
```

### 4.2 Fluxo GDP: Escola faz Pedido

```
1. Escola acessa gdp-portal.html
2. Login com usuario/senha da escola
3. Navega pelo catalogo de produtos (filtro, busca)
4. Adiciona itens ao carrinho (controle quantidade)
5. Revisa pedido (tabela + resumo financeiro)
6. Confirma pedido → gera protocolo
7. Fornecedor ve pedido no gdp-dashboard.html
8. Abre gdp-gestao.html para workflow de 7 fases
9. Entregador acessa gdp-entregador.html
10. Seleciona pedido, tira foto, coleta assinatura
11. Confirma entrega → salva comprovante
```

### 4.3 Fluxo Importacao de Precos

```
1. Na aba "Banco de Precos", clica "Importar Cotacao"
2. Seleciona arquivo (Excel, CSV, PDF ou imagem)
3. Para PDF: usa pdf.js para extrair texto e parsear tabela
4. Para imagem: envia para API de OCR (Netlify Function)
5. Modal exibe preview com mapeamento de colunas
6. Usuario confirma → itens importados ao banco de precos
```

---

## 5. Analise de Design Responsivo

### 5.1 Painel Fornecedor (styles.css)

| Breakpoint | Adaptacoes |
|------------|-----------|
| `<= 900px` | KPIs 3 colunas, filtros 2 colunas, intel grid 1 coluna, intel charts 1 coluna |
| `<= 600px` | Body padding 12px, KPIs 2 colunas, filtros 1 coluna, tabs overflow-x: auto, form-grid 1 coluna, batch-bar flex-wrap |

**Avaliacao:** Basico mas funcional. Faltam ajustes para tabelas (tabelas nao sao responsivas — dependem de `overflow-x: auto`).

### 5.2 Paginas GDP

| Pagina | Responsividade |
|--------|---------------|
| `gdp-dashboard.html` | KPI grid com `auto-fit, minmax(220px, 1fr)` — bom |
| `gdp-contratos.html` | Sem breakpoints explicitosmdash; depende de auto-fit |
| `gdp-gestao.html` | Pipeline overflow-x, sem breakpoints para phases |
| `gdp-portal.html` | 1 breakpoint `@media(max-width:768px)` — bom para catalogo |
| `gdp-entregador.html` | **Sem media queries** — usa viewport e tamanhos relativos |

### 5.3 Problemas Identificados

1. **Tabelas nao sao responsivas** — em telas pequenas, requerem scroll horizontal
2. **gdp-gestao.html** — Pipeline visual nao se adapta bem a mobile (min-width: 160px por step)
3. **gdp-entregador.html** — Apesar de ser um app mobile, nao tem media queries explicitas
4. **Nao ha estrategia mobile-first** — todos os breakpoints sao max-width (desktop-first)

---

## 6. Auditoria de Acessibilidade (a11y)

### 6.1 Problemas Criticos (Severidade Alta)

| # | Problema | Localizacao | WCAG |
|---|---------|-------------|------|
| A1 | **Nenhum atributo `aria-*` em todo o codebase** | Todas as paginas | 4.1.2 |
| A2 | **Nenhum `role` semantico em componentes customizados** | Tabs, modals, toasts | 4.1.2 |
| A3 | **Modals nao tem focus trap** | modal-banco, modal-import | 2.4.3 |
| A4 | **Nenhum atributo `alt` em imagens** (exceto 2 no gdp-contratos) | Todas as paginas | 1.1.1 |
| A5 | **Tabs implementadas com `<button>` sem `role="tab"`** | index.html, GDP pages | 4.1.2 |
| A6 | **Nenhum skip link** | Todas as paginas | 2.4.1 |
| A7 | **`onclick` em `<div>` sem `role="button"` ou `tabindex`** | gdp-entregador delivery cards | 2.1.1 |

### 6.2 Problemas Moderados (Severidade Media)

| # | Problema | Localizacao | WCAG |
|---|---------|-------------|------|
| A8 | **Inputs sem `<label>` associado** em varios formularios | login.html (fornecedor), index.html filtros | 1.3.1 |
| A9 | **Contraste insuficiente** — `--muted: #9bb7a8` sobre `--bg: #0d1412` pode falhar ratio 4.5:1 | Painel fornecedor | 1.4.3 |
| A10 | **`user-select: none`** no gdp-entregador impede selecao de texto | gdp-entregador.html | 1.3.1 |
| A11 | **Canvas de assinatura sem alternativa textual** | gdp-entregador.html | 1.1.1 |
| A12 | **Toast notifications nao usam `role="alert"` ou `aria-live`** | app.js showToast() | 4.1.3 |

### 6.3 Pontos Positivos

- Uso correto de `<header>`, `<section>`, `<nav>`, `<article>` no painel fornecedor
- `autocomplete` nos campos de login
- Labels textuais nos botoes (nao sao icon-only)

---

## 7. Capacidades PWA

### 7.1 GDP Entregador — PWA Implementada

| Recurso | Status | Detalhes |
|---------|--------|---------|
| **Web App Manifest** | Referenciado | `manifest-entregador.json` (arquivo referenciado mas nao encontrado no repo) |
| **Service Worker** | Implementado | `sw-entregador.js` com strategy Network-first, cache fallback |
| **meta apple-mobile-web-app-capable** | Sim | `<meta name="apple-mobile-web-app-capable" content="yes">` |
| **meta theme-color** | Sim | `#3b82f6` |
| **apple-touch-icon** | Referenciado | `icon-entregador-192.png` |
| **Offline Support** | Parcial | Cacheia HTML + manifest + icons, mas nao cacheia dados |
| **Camera Access** | Sim | `capture="environment"` para foto de entrega |
| **Signature Pad** | Sim | Canvas com touch events |

### 7.2 Problemas PWA

| # | Problema | Severidade |
|---|---------|-----------|
| P1 | **Manifest JSON nao encontrado** no repositorio | Alta |
| P2 | **Icons nao encontrados** (192px, 512px) | Alta |
| P3 | **Service Worker nao registrado** no HTML (falta `navigator.serviceWorker.register()`) | Alta |
| P4 | **Sem sincronizacao offline** — dados de entrega podem ser perdidos sem conexao | Media |
| P5 | **Sem push notifications** para novas entregas | Baixa |

### 7.3 Outras Paginas

Nenhuma outra pagina tem capacidades PWA. O painel fornecedor (index.html) e as demais paginas GDP sao aplicacoes web tradicionais.

---

## 8. Gerenciamento de Estado

### 8.1 Painel Fornecedor (app.js — 2546 linhas)

| Variavel | Tipo | Persistencia | Descricao |
|----------|------|-------------|-----------|
| `orcamentos` | Array | localStorage (`caixaescolar.orcamentos`) | Lista de orcamentos do SGD |
| `bancoPrecos` | Object `{updatedAt, itens[]}` | localStorage (`caixaescolar.banco.v1`) | Banco de precos do fornecedor |
| `preOrcamentos` | Object `{id: preOrc}` | localStorage (`caixaescolar.preorcamentos.v1`) | Pre-orcamentos gerados |
| `perfil` | Object | Fetch (`data/perfil.json`) | Perfil do fornecedor (distancias, config) |
| `sreData` | Object | Fetch (`data/sre-uberaba.json`) | Dados da SRE |
| `activePreOrcamentoId` | String/null | In-memory | Pre-orcamento aberto atualmente |
| `selectedOrcIds` | Set | In-memory | IDs selecionados para batch |
| `sgdAvailable` | Boolean | In-memory | Se API SGD esta disponivel |

### 8.2 Padrao de Estado

- **Sem state management library** (Redux, Zustand, etc.)
- **Variaveis globais** no escopo do modulo
- **Renderizacao imperativa:** cada mudanca chama funcoes `render*()` que fazem `innerHTML` completo
- **Persistencia manual:** funcoes `save*()` serializam para localStorage
- **Cache de elementos DOM:** objeto `el` com todos os `getElementById` no boot

### 8.3 Paginas GDP

Cada pagina GDP tem seu proprio estado independente, tambem em variaveis globais:
- `gdp-portal.html`: `cart[]`, `pedidos[]`, `currentSchool`
- `gdp-entregador.html`: `pedidos[]`, `provas[]`, `currentPedido`, `photoData`, `signatureData`
- `gdp-contratos.html`: `contratos[]`, `selectedContrato`
- **Sem compartilhamento de estado entre paginas** (exceto via localStorage)

---

## 9. Debitos de UX Identificados

### 9.1 Debitos Criticos (Severidade Alta)

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| UX-01 | **Autenticacao insegura client-side** — hash SHA-256 hardcoded no HTML, credenciais visiveis no source | Seguranca: qualquer pessoa pode ver usuario/senha | Alto (requer backend) |
| UX-02 | **Dois design systems incompativeis** — painel verde vs GDP azul sem transicao visual | Experiencia fragmentada, parece dois produtos diferentes | Alto |
| UX-03 | **7 paginas HTML independentes sem layout compartilhado** — duplicacao massiva de CSS (cada pagina tem 200-400 linhas de CSS inline) | Manutencao impossivel, inconsistencias visuais crescentes | Alto |
| UX-04 | **Zero acessibilidade (a11y)** — nenhum aria-*, nenhum role, nenhum focus management | Inacessivel para usuarios com deficiencias | Alto |
| UX-05 | **app.js monolitico com 2546 linhas** — toda logica em um unico arquivo | Impossivel testar unitariamente, dificil de manter | Alto |

### 9.2 Debitos Importantes (Severidade Media)

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| UX-06 | **innerHTML para renderizacao** — risco de XSS (mitigado por `escapeHtml`, mas inconsistente) | Seguranca: injeccao HTML se escapeHtml falhar | Medio |
| UX-07 | **Sem loading states** — ao buscar dados do SGD, nao ha indicador de carregamento global | Usuario nao sabe se sistema esta processando | Baixo |
| UX-08 | **Sem error boundaries** — erros de rede mostrados via `console.warn` ou `alert()` | Experiencia ruim em falhas | Medio |
| UX-09 | **PWA incompleta** — manifest e icons ausentes, service worker nao registrado | App entregador nao instalavel | Medio |
| UX-10 | **Dados demo hardcoded** — gdp-entregador.html tem seed data inline | Confusao em producao | Baixo |
| UX-11 | **Sem paginacao** — tabelas renderizam todos os registros de uma vez | Performance em datasets grandes | Medio |
| UX-12 | **localStorage como unico armazenamento** — risco de perda de dados (limpeza de cache) | Perda de pre-orcamentos e banco de precos | Alto |
| UX-13 | **Credenciais SGD armazenadas em localStorage** em plain text | Seguranca: CNPJ e senha do SGD expostos | Alto |

### 9.3 Debitos Menores (Severidade Baixa)

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| UX-14 | **Prompt() para credenciais SGD** — UX primitiva para coleta de CNPJ/senha | Experiencia ruim, nao permite colar, nao tem validacao | Baixo |
| UX-15 | **Sem animacoes de transicao** entre abas no painel fornecedor | Transicao abrupta (display:none → display:block) | Baixo |
| UX-16 | **Feedback visual insuficiente** em acoes (aprovar, recusar, enviar) — apenas toast | Falta confirmacao explicita antes de acoes destrutivas | Baixo |
| UX-17 | **Sem undo/redo** — acoes como "Recusar" ou "Limpar Banco" sao irreversiveis | Risco de erro do usuario | Medio |
| UX-18 | **Emoji como icones** (magnifying glass, truck, box) em vez de icon library | Renderizacao inconsistente entre OS/browsers | Baixo |

---

## 10. Recomendacoes de Melhoria

### 10.1 Curto Prazo (Quick Wins)

| # | Recomendacao | Debitos Resolvidos | Esforco |
|---|-------------|-------------------|---------|
| R1 | Adicionar `role="tab"`, `role="tabpanel"`, `aria-selected` nas abas | UX-04 (parcial) | 2h |
| R2 | Adicionar `role="dialog"`, `aria-modal="true"`, focus trap nos modals | UX-04 (parcial) | 4h |
| R3 | Adicionar `aria-live="polite"` ao toast container | UX-04 (parcial) | 30min |
| R4 | Criar loading spinner global para operacoes SGD | UX-07 | 2h |
| R5 | Substituir `prompt()` por modal customizado para credenciais SGD | UX-14 | 3h |
| R6 | Adicionar confirmacao (dialog) antes de acoes destrutivas | UX-16, UX-17 | 2h |
| R7 | Completar PWA do entregador (manifest, icons, SW registration) | UX-09 | 4h |

### 10.2 Medio Prazo (Refatoracao)

| # | Recomendacao | Debitos Resolvidos | Esforco |
|---|-------------|-------------------|---------|
| R8 | Unificar design system — criar `design-tokens.css` compartilhado | UX-02 | 2-3 dias |
| R9 | Extrair layout compartilhado (topbar, sidebar) como web component ou template | UX-03 | 3-5 dias |
| R10 | Modularizar app.js em modulos ES (state.js, render.js, sgd.js, banco.js) | UX-05 | 3-5 dias |
| R11 | Migrar renderizacao de innerHTML para DOM API ou lit-html | UX-06 | 5-7 dias |
| R12 | Implementar paginacao virtual nas tabelas (>100 linhas) | UX-11 | 2-3 dias |
| R13 | Adicionar IndexedDB como fallback para localStorage | UX-12 | 2-3 dias |

### 10.3 Longo Prazo (Arquitetura)

| # | Recomendacao | Debitos Resolvidos | Esforco |
|---|-------------|-------------------|---------|
| R14 | Migrar autenticacao para backend (Supabase Auth ou similar) | UX-01, UX-13 | 1-2 semanas |
| R15 | Considerar framework leve (Svelte, Preact ou Web Components) para componentizacao | UX-02, UX-03, UX-05, UX-06 | 2-4 semanas |
| R16 | Implementar SPA com router (ou micro-frontends) para unificar navegacao | UX-03 | 2-3 semanas |
| R17 | Implementar testes e2e com Playwright | Validacao geral | 1-2 semanas |
| R18 | Auditoria completa WCAG 2.1 AA com ferramentas automatizadas (axe, Lighthouse) | UX-04 | 1 semana |

---

## 11. Metricas de Qualidade Frontend

| Metrica | Valor Estimado | Meta Ideal |
|---------|---------------|------------|
| **Linhas de JS total** | ~5000+ (app.js 2546 + inline nas 6 GDP pages) | Modularizado |
| **CSS duplicado** | ~70% (cada GDP page redefine tokens e componentes) | <10% |
| **a11y score (Lighthouse)** | Estimado: 30-40/100 | >90/100 |
| **Performance (LCP)** | Bom (paginas leves, sem framework overhead) | <2.5s |
| **Cobertura de testes** | 0% | >80% |
| **Componentes reutilizaveis** | ~3 (badge, toast, table pattern) | >20 |
| **Paginas com PWA** | 1/7 (parcial) | Todas com baseline |

---

## 12. Conclusao

O frontend do Caixa Escolar MG e um **MVP funcional construido com Vanilla JS** que prioriza velocidade de entrega sobre sustentabilidade. Os principais riscos sao:

1. **Seguranca:** Autenticacao client-side e credenciais expostas requerem atencao imediata
2. **Manutencao:** 7 paginas independentes com CSS duplicado e JS monolitico tornam evolucao custosa
3. **Acessibilidade:** Ausencia total de suporte a11y pode ser problema legal em sistema governamental (educacao publica)
4. **Fragmentacao visual:** Dois design systems distintos prejudicam a percepcao de produto unificado

A recomendacao e atacar os **Quick Wins de acessibilidade (R1-R3)** e **seguranca (R14)** imediatamente, seguidos pela **unificacao do design system (R8)** e **modularizacao (R10)** como proximos passos.
