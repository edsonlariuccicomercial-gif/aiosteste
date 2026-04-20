# UX Specialist Review — Painel Caixa Escolar (Licit-AIX)

**Projeto:** Painel Caixa Escolar (GDP / LicitIA MG / Licit-AIX)
**Data:** 2026-04-20
**Autor:** @ux-design-expert (Uma) — Brownfield Discovery Phase 6
**Documento base:** `technical-debt-DRAFT.md` (Phase 4, @architect)
**Referencia cruzada:** `frontend-spec.md` (Phase 3, @ux-design-expert)

---

## 1. Parecer do Especialista

Apos analise detalhada do draft de divida tecnica e validacao cruzada com o codigo-fonte do frontend ativo em `painel-caixa-escolar/squads/caixa-escolar/dashboard/`, **confirmo que o assessment da @architect esta substancialmente correto e bem fundamentado** no que diz respeito aos debitos de frontend e experiencia do usuario.

O sistema apresenta uma **dualidade visual nao-resolvida** (tema verde-escuro no Radar vs tema azul-escuro no GDP) que nao e apenas um problema estetico — ela sinaliza ao usuario final que ele esta usando **dois produtos diferentes**, quando na verdade e um unico painel integrado. Essa fragmentacao reduz a confianca do usuario e aumenta a carga cognitiva de navegacao.

Do ponto de vista de impacto no usuario final (fornecedores de caixas escolares de MG), os problemas mais graves sao:

1. **Perda de dados de trabalho** — Pre-orcamentos e banco de precos armazenados exclusivamente em `localStorage` podem ser perdidos ao limpar o browser, trocar de maquina ou por politicas corporativas de limpeza de cache.
2. **Ausencia de feedback em operacoes criticas** — Envio de propostas ao SGD e emissao de NF-e sem confirmacao visual adequada de sucesso/falha.
3. **Inconsistencia de navegacao** — O usuario precisa aprender dois modelos mentais diferentes (sidebar no Radar vs paginas independentes no GDP).
4. **Exclusao de usuarios com deficiencia** — Nivel de acessibilidade BAIXO viola a Lei 13.146/2015 e exclui potenciais operadores.

---

## 2. Validacao de Severidades

### Concordancia com o Draft

| TD ID | Descricao | Severidade Draft | Meu Parecer | Justificativa |
|-------|-----------|------------------|-------------|---------------|
| TD-008 | Frontend monolitico sem framework (`app.js` 2623 linhas) | HIGH | **CONCORDO** | Impacto direto na velocidade de evolucao e estabilidade. Cada feature nova e um risco de regressao. |
| TD-010 | Sem build system | HIGH | **CONCORDO** | 7 scripts CDN no `<head>` bloqueando render. Em escolas rurais de MG com conexao 3G/4G lenta, o First Contentful Paint pode exceder 8-10s. |
| TD-029 | Sem testes automatizados | HIGH | **CONCORDO** | Impossivel refatorar CSS ou JS com confianca. Cada mudanca visual e uma roleta russa. |
| TD-030 | Dois sistemas de design inconsistentes | MEDIUM | **DISCORDO — deveria ser HIGH** | A inconsistencia visual nao e apenas cosmetica. Paginas GDP (`gdp-contratos.html`, `gdp-dashboard.html`, `gdp-portal.html`, `gdp-entregador.html`) definem ~200+ linhas de CSS inline com `:root` proprio que sobrescreve completamente o `styles.css` compartilhado. Isso cria uma percepcao de "sistema instavel" para o usuario. |
| TD-031 | CSS inline massivo em paginas GDP | MEDIUM | **DISCORDO — deveria ser HIGH** | Verificado no codigo: `gdp-contratos.html` tem 167 linhas de CSS inline. `gdp-dashboard.html`, `gdp-portal.html` e `gdp-entregador.html` repetem o mesmo padrao. Manutencao e sincronizacao sao impossiveis na pratica. Qualquer ajuste visual precisa ser replicado em 5+ arquivos manualmente. |
| TD-032 | Renderizacao via innerHTML sem diffing | MEDIUM | **CONCORDO** | Impacto perceptivel em listas longas (100+ orcamentos), mas mitigado pela paginacao existente (50 itens/pagina). |
| TD-033 | Acessibilidade nivel BAIXO | MEDIUM | **DISCORDO — deveria ser HIGH** | A Lei Brasileira de Inclusao (13.146/2015) e a Lei de Licitacoes (14.133/2021) exigem acessibilidade em sistemas que interagem com o setor publico. Fornecedores com deficiencia visual sao legalmente excluidos do sistema. Risco juridico real. |
| TD-034 | 9 modais sem reuso | LOW | **CONCORDO** | Problema de manutencao, nao de experiencia direta do usuario. |
| TD-035 | CDN dependencies bloqueando render | LOW | **DISCORDO — deveria ser MEDIUM** | Para o publico-alvo (fornecedores operando de cidades pequenas de MG), a performance de carregamento inicial e critica. Bloquear render com 7 scripts CDN no `<head>` pode causar "tela branca" por 5-10s em conexoes lentas. |
| TD-036 | Emojis como icones | LOW | **CONCORDO** | Impacto menor, mas contribui para a aparencia "nao-profissional" e inconsistencia entre plataformas. |

### Resumo de Discordancias

| TD | De | Para | Razao |
|----|----|------|-------|
| TD-030 | MEDIUM | **HIGH** | Fragmentacao visual = perda de confianca do usuario + manutencao impossivel |
| TD-031 | MEDIUM | **HIGH** | CSS duplicado em 5+ arquivos; impossivel manter sincronizado |
| TD-033 | MEDIUM | **HIGH** | Risco juridico (Lei 13.146) + exclusao de usuarios no contexto de licitacao publica |
| TD-035 | LOW | **MEDIUM** | Performance de carga e critica para o perfil demografico do usuario |

---

## 3. Riscos Adicionais Nao Mapeados

A @architect fez um levantamento abrangente, mas identifiquei os seguintes riscos de frontend/UX que nao estao cobertos no draft:

### TD-UX-001 — Ausencia de Onboarding e Ajuda Contextual

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Descricao** | O sistema nao possui nenhum fluxo de onboarding, tooltips explicativas, tour guiado ou secao de ajuda. Um fornecedor novo precisa descobrir sozinho como precificar, enviar propostas e gerenciar contratos. |
| **Impacto** | Curva de aprendizado elevada (estimada em 2-4 horas para dominio basico); dependencia de suporte humano; abandono por usuarios menos tecnicos. |
| **Esforco** | M |

### TD-UX-002 — Sem Undo/Redo em Operacoes Destrutivas

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Descricao** | Acoes como "descartar orcamento", "excluir item do banco de precos", "aprovar pre-orcamento" sao irreversiveis sem confirmacao adequada ou possibilidade de desfazer. |
| **Impacto** | Erros operacionais permanentes; usuario perde trabalho; necessidade de intervencao manual no banco para reverter. |
| **Esforco** | M |

### TD-UX-003 — Navegacao Fragmentada entre Paginas GDP

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Descricao** | O modulo GDP esta distribuido em 5 paginas HTML separadas (`gdp-contratos.html`, `gdp-dashboard.html`, `gdp-gestao.html`, `gdp-entregador.html`, `gdp-portal.html`). Cada uma carrega seus proprios assets CSS/JS independentemente, com sidebar duplicada manualmente em cada arquivo. |
| **Impacto** | Transicoes entre paginas causam reload completo (perda de scroll, estado de formularios, contexto visual); sidebar pode ficar dessincronizada entre paginas. |
| **Esforco** | L |

### TD-UX-004 — Ausencia de Estados Vazios Significativos

| Campo | Valor |
|-------|-------|
| **Severidade** | LOW |
| **Descricao** | Quando nao ha dados (zero contratos, zero orcamentos, primeira utilizacao), o sistema mostra apenas um espaco vazio ou texto generico. Nao ha orientacao sobre "proximo passo" ou call-to-action. |
| **Impacto** | Usuario novo nao sabe o que fazer; percepcao de "sistema quebrado". |
| **Esforco** | S |

### TD-UX-005 — Sem Notificacoes Push ou Alertas Proativos

| Campo | Valor |
|-------|-------|
| **Severidade** | LOW |
| **Descricao** | Orcamentos com prazo de 48h nao geram notificacao proativa. O usuario precisa acessar o sistema para descobrir urgencias. A PWA de entregador nao usa Push API. |
| **Impacto** | Perda de oportunidades de licitacao por nao-ciencia de prazo; entregas atrasadas por falta de alerta. |
| **Esforco** | M |

### TD-UX-006 — Feedback Visual Insuficiente em Operacoes Assincronas

| Campo | Valor |
|-------|-------|
| **Severidade** | MEDIUM |
| **Descricao** | Operacoes como "Varrer SGD", "Enviar proposta", "Sincronizar banco" nao possuem skeleton loaders, progress bars ou estados intermediarios adequados. O usuario nao sabe se a acao esta em progresso, concluida ou falhou. |
| **Impacto** | Cliques duplicados por impaciencia; percepcao de lentidao; envio duplicado de propostas ao SGD. |
| **Esforco** | S |

---

## 4. Analise de Experiencia do Usuario

### 4.1 Usabilidade

| Dimensao | Nota (1-5) | Observacoes |
|----------|------------|-------------|
| Eficiencia de tarefas | 3.5/5 | O fluxo Radar -> Pre-orcamento -> Envio SGD e bem estruturado e logico. A pipeline de 4 camadas de matching funciona. |
| Previsibilidade | 2.5/5 | Dois temas visuais, navegacao inconsistente (sidebar vs paginas avulsas), modais sem padrao unico. |
| Recuperacao de erros | 1.5/5 | Sem undo, sem confirmacoes robustas, sem fallback visual em caso de falha de rede. |
| Aprendibilidade | 2.0/5 | Sem onboarding, sem tooltips, sem documentacao de ajuda in-app. Sistema especializado com jargao (SRE, SGD, ARP, GDP). |
| Satisfacao | 3.0/5 | Visual moderno (dark mode, cards, badges) compensa parcialmente os problemas funcionais. |

**Nota global de usabilidade: 2.5/5**

### 4.2 Consistencia Visual

| Aspecto | Status | Impacto |
|---------|--------|---------|
| Paleta de cores | INCONSISTENTE | Duas paletas distintas (verde #4ec98a no Radar vs azul #3b82f6 no GDP) sem transicao ou justificativa. |
| Tipografia | PARCIALMENTE CONSISTENTE | Inter no Radar, Segoe UI no GDP. Tamanhos base similares (14px). |
| Espacamento | INCONSISTENTE | `--gap: 14px` no Radar vs `gap: 1rem` hardcoded no GDP. Paddings variam. |
| Componentes | INCONSISTENTE | KPI cards com 3 variantes diferentes (`.intel-card`, `.kpi`, `.kpi-card`). Botoes com estilos divergentes entre temas. |
| Icones | NAO PADRONIZADO | Emojis Unicode usados como icones (renderizacao varia entre Windows, Mac, Android). |
| Nomenclatura CSS | INCONSISTENTE | BEM parcial no Radar (`.intel-card`, `.intel-label`), utility-first no GDP (`.text-right`, `.nowrap`). |

**Nota de consistencia: 2.0/5**

### 4.3 Performance Percebida

| Metrica | Estimativa | Nota |
|---------|-----------|------|
| First Contentful Paint (FCP) | 3-8s (depende da conexao; 7 CDN scripts bloqueantes) | 2.0/5 |
| Time to Interactive (TTI) | 5-12s (boot carrega localStorage + processa dados) | 2.5/5 |
| Transicao entre modulos | Instantanea (tabs no Radar); Reload completo (paginas GDP) | 3.0/5 |
| Resposta a interacoes | Rapida (<100ms para maioria das acoes em listas pequenas) | 4.0/5 |
| Feedback de carregamento | Quase inexistente (sem skeleton, sem progress) | 1.5/5 |

**Nota de performance percebida: 2.6/5**

### 4.4 Curva de Aprendizado

| Perfil de Usuario | Tempo Estimado para Produtividade | Dificuldades Previstas |
|-------------------|----------------------------------|------------------------|
| Fornecedor tech-savvy | 1-2 horas | Entender jargao (SRE, ARP, SGD); localizar funcionalidades no GDP |
| Fornecedor basico | 4-8 horas | Navegar entre modulos; entender pre-orcamento vs proposta; configurar banco de precos |
| Operador auxiliar | 2-4 horas | Precificar itens; interpretar simulador de cenarios |
| Entregador (mobile) | 30 min | Interface simplificada; fluxo intuitivo |
| Escola (portal) | 1-2 horas | Interface mais simples; login e acompanhamento basico |

**Fatores que aumentam a curva de aprendizado:**
- Jargao especializado sem glossario (SRE, ARP, SGD, PNCP, NF-e)
- Dois modelos visuais diferentes no mesmo sistema
- Navegacao nao-linear entre dashboard-home, index.html e paginas GDP
- Ausencia total de onboarding ou tour guiado
- 9 modais em uma unica pagina sem hierarquia clara

---

## 5. Design System Emergente

Apesar da ausencia de um design system formalizado, existem **padroes consistentes que ja funcionam como primitivas reutilizaveis**. Estes podem servir de base para um design system futuro:

### 5.1 Tokens ja Estabelecidos (Tema Radar — `styles.css`)

```css
/* Estes ja funcionam como design tokens */
--bg: #0d1412;
--bg-soft: #131f1a;
--card: rgba(21, 34, 28, 0.84);
--line: rgba(143, 197, 157, 0.2);
--text: #e6f3ec;
--muted: #9bb7a8;
--accent: #4ec98a;
--warning: #f4b942;
--danger: #ff6f6f;
--radius: 10px;
--gap: 14px;
```

### 5.2 Componentes Primitivos Reutilizaveis

| Componente | Onde existe | Nivel de maturidade | Reutilizavel? |
|-----------|------------|--------------------|----|
| **Card** (`.card`) | `styles.css` | Alto | Sim — background semi-transparente + blur + borda sutil |
| **Sidebar** (`.sidebar`) | `styles.css` + 5 paginas GDP | Medio | Sim, mas duplicado manualmente |
| **Badge** (`.badge-*`) | `gdp-contratos.html` inline | Alto | Sim — sistema de cores consistente com variantes |
| **KPI Card** (`.kpi`) | GDP inline | Alto | Sim — layout de label/valor/sub bem definido |
| **Table** (`table` + `.table-wrap`) | `styles.css` + GDP inline | Alto | Sim — headers sticky, hover, overflow |
| **Button** (`.btn`, `.btn-*`) | Ambos os temas | Medio | Parcialmente — estilos divergem entre temas |
| **Pill/Badge** (`.pill`) | `styles.css` | Alto | Sim |
| **Modal** (`.modal-overlay` + `.modal.card`) | `index.html` | Medio | Nao — 9 instancias inline sem componente extraido |
| **Progress Bar** (`.progress` + `.progress-fill`) | GDP inline | Alto | Sim |
| **Sync Indicator** (`.sync-indicator`) | GDP inline | Alto | Sim — estados visuais bem definidos (cloud/syncing/pending/offline) |
| **Form inputs** (`select`, `input`) | Ambos | Medio | Parcialmente — estilos similares mas nao identicos |

### 5.3 Padroes de Layout

| Padrao | Uso | Status |
|--------|-----|--------|
| Sidebar + Main Area | Dashboard ativo | Consolidado |
| KPI Grid (auto-fit, minmax) | Todas as paginas | Consolidado (com variantes) |
| Card Grid (auto-fill, minmax) | Contratos, fornecedores | Consolidado |
| Topbar (flex, space-between) | Todas as paginas | Consolidado (com variacoes) |
| Table com overflow wrapper | Todas as paginas com dados | Consolidado |

### 5.4 Padroes de Interacao

| Padrao | Status |
|--------|--------|
| Tabs com conteudo condicional (`display: none/block`) | Consolidado |
| Modal com overlay + fade in | Consolidado (mas nao componentizado) |
| Batch selection com barra de acoes | Consolidado |
| Filtros em grid de selects | Consolidado |
| Expandable cards/groups | Consolidado |
| Debounce em inputs de texto | Consolidado (300ms) |

### 5.5 Avaliacao de Prontidao para Design System

**Existe materia-prima suficiente** para extrair um design system. Os tokens de cor, espacamento e tipografia ja estao definidos (ainda que duplicados). Os componentes primitivos (card, badge, button, table, kpi) possuem padroes claros que podem ser formalizados em um arquivo CSS compartilhado.

**Lacunas para formalizacao:**
- Unificacao das duas paletas em uma unica com variantes (ou tema claro/escuro)
- Documentacao de uso de cada componente
- Nomenclatura unificada (BEM, utility-first ou hybrid)
- Componentes de formulario padronizados
- Sistema de icones (substituir emojis)
- Motion/animation tokens

---

## 6. Roadmap de Modernizacao Frontend

### Phase A: Quick Fixes (sem mudanca de arquitetura)

**Duracao estimada:** 1-2 semanas
**Prerequisitos:** Nenhum
**Objetivo:** Melhorar percepcivelmente a experiencia sem alterar a estrutura do codigo.

| # | Acao | TD Ref | Impacto no Usuario | Esforco |
|---|------|--------|-------------------|---------|
| A.1 | Mover 7 scripts CDN de `<head>` para antes de `</body>` com atributo `defer` | TD-035 | FCP melhora 1-3s; usuario ve a interface mais rapido | 2h |
| A.2 | Adicionar loading spinner/skeleton no boot da aplicacao | TD-UX-006 | Usuario sabe que o sistema esta carregando | 3h |
| A.3 | Adicionar confirmacao em acoes destrutivas (descartar, excluir) | TD-UX-002 | Previne erros irreversiveis | 4h |
| A.4 | Adicionar `aria-label` nos botoes da sidebar e modais | TD-033 | Melhoria imediata para screen readers | 3h |
| A.5 | Unificar fonte para Inter em todas as paginas (remover fallback para Segoe UI) | TD-030 | Consistencia tipografica basica | 1h |
| A.6 | Adicionar `<title>` e `role="dialog"` nos modais existentes | TD-033 | Acessibilidade basica de modais | 2h |
| A.7 | Implementar focus trap basico nos modais (Tab cycling) | TD-033 | Keyboard navigation funcional em modais | 4h |
| A.8 | Adicionar toast notifications para operacoes async (sucesso/erro) | TD-UX-006 | Feedback visual em envio SGD, sync, etc. | 4h |

**Total Phase A:** ~23h de trabalho (~3 dias uteis)

---

### Phase B: Extracao de Componentes

**Duracao estimada:** 3-4 semanas
**Prerequisitos:** Build system basico (TD-010 — Vite)
**Objetivo:** Eliminar duplicacao CSS, criar base reutilizavel, unificar tema visual.

| # | Acao | TD Ref | Impacto no Usuario | Esforco |
|---|------|--------|-------------------|---------|
| B.1 | Criar `design-tokens.css` unico com paleta unificada (verde como primario, azul como secundario) | TD-030 | Identidade visual coesa em todo o sistema | M |
| B.2 | Extrair CSS inline das 5 paginas GDP para `gdp-shared.css` importado via `<link>` | TD-031 | Zero impacto visual direto; habilita manutencao | M |
| B.3 | Criar componente `Modal` reutilizavel (HTML template + JS class) | TD-034 | Modais com comportamento consistente (focus trap, ESC, overlay click) | M |
| B.4 | Criar componente `KPICard` padronizado com variantes (color, size) | — | Consistencia de KPIs em todas as telas | S |
| B.5 | Criar componente `DataTable` com sort, pagination e empty state | — | Experiencia de tabela unificada | L |
| B.6 | Criar componente `Badge` / `Pill` / `StatusChip` unificado | TD-030 | Consistencia de indicadores visuais | S |
| B.7 | Criar componente `Sidebar` compartilhado via JS include ou Web Component | TD-UX-003 | Navegacao sincronizada entre todas as paginas | M |
| B.8 | Substituir emojis da sidebar por SVG icons (Lucide ou Heroicons) | TD-036 | Icones consistentes cross-platform | S |
| B.9 | Implementar sistema de notificacoes/toasts global | TD-UX-006 | Feedback unificado em todas as operacoes | M |
| B.10 | Adicionar empty states com call-to-action em todas as listas | TD-UX-004 | Orientacao para usuarios novos | S |

**Total Phase B:** ~6-8 semanas de trabalho

---

### Phase C: Adocao de Framework (se recomendado)

**Duracao estimada:** 8-12 semanas (migracao gradual)
**Prerequisitos:** Phase B concluida; build system estavel; testes basicos existentes
**Objetivo:** Reatividade, componentizacao real, testabilidade.

**Recomendacao: Preact + HTM (sem transpilacao obrigatoria)**

Justificativa para Preact sobre React/Vue/Svelte:
- **3KB gzipped** — nao adiciona peso significativo
- **Compativel com React ecosystem** (se quiser migrar depois)
- **HTM** permite templates sem JSX/build step (migracao gradual)
- **Funciona como drop-in** em paginas existentes (nao requer SPA rewrite)
- **O time atual nao tem experiencia com frameworks** — Preact e a menor curva de aprendizado

| # | Acao | Impacto | Esforco |
|---|------|---------|---------|
| C.1 | Instalar Preact + HTM via Vite; criar primeiro componente real (KPICard) | Setup base | S |
| C.2 | Migrar modulo GDP Contratos para Preact (componentes: ContractList, ContractCard, ContractDetail) | Componentes reativos com state management | L |
| C.3 | Migrar modulo Radar para Preact (componentes: OrcamentoList, PreOrcamento, Filtros) | Elimina innerHTML rendering; diffing automatico | XL |
| C.4 | Implementar estado centralizado (Preact Signals ou Zustand) | Elimina variaveis globais; sincronizacao automatica | L |
| C.5 | Implementar client-side routing (preact-router) para unificar paginas GDP em SPA | Elimina reload entre paginas GDP | L |
| C.6 | Migrar persistencia para React Query / TanStack Query pattern (cache + sync) | Elimina localStorage como storage primario; sync automatico | L |

**Alternativa conservadora:** Se a equipe preferir nao adotar framework, a Phase B ja entrega 70% do valor com Web Components nativos (Custom Elements + Shadow DOM). Porem, a testabilidade e reatividade continuarao limitadas.

---

## 7. Estimativa de Esforco

### Resumo por Phase

| Phase | Duracao | Esforco (pessoa-horas) | Impacto UX | Risco de Execucao |
|-------|---------|----------------------|------------|-------------------|
| **A: Quick Fixes** | 1-2 semanas | ~23h | MEDIO (melhora percepcivelmente a performance e feedback) | BAIXO |
| **B: Extracao de Componentes** | 3-4 semanas | ~120-160h | ALTO (unificacao visual, eliminacao de duplicacao) | MEDIO |
| **C: Framework** | 8-12 semanas | ~320-480h | ALTISSIMO (reatividade, testabilidade, escalabilidade) | ALTO |

### Esforco por Tipo de Profissional

| Profissional | Phase A | Phase B | Phase C |
|-------------|---------|---------|---------|
| Frontend Dev | 20h | 100h | 280h |
| UX Designer | 3h | 40h | 80h |
| QA | 0h | 20h | 120h |

### Esforco Acumulado vs Valor Entregue

```
VALOR ENTREGUE (UX)
    100% |                                          ___----C
     80% |                              ___----B---
     60% |                    ___---B---
     40% |         ___---A---B
     20% |    A---
      0% |---
         |-------|----------|---------------|---------->
         Sprint0  Sprint1    Sprint2-3       Sprint4+     TEMPO
              (seguranca) (fundacao)  (componentes)  (framework)
```

### Dependencias com Outras Fases do Plano

| Minha Phase | Depende De | Razao |
|-------------|-----------|-------|
| A (Quick Fixes) | Nenhuma | Pode comecar imediatamente |
| B (Componentes) | TD-010 (Build system — Sprint 1) | Precisa de bundler para importar CSS/JS modular |
| B.7 (Sidebar compartilhada) | TD-009 (Consolidar raizes de deploy) | Sidebar compartilhada so faz sentido com uma unica raiz |
| C (Framework) | Phase B + TD-029 (Testes) | Migracao sem testes e suicidio |

---

## 8. Parecer Final

### Impacto no Usuario se os Debitos Frontend Nao Forem Corrigidos

**Cenario de 6 meses sem acao na camada frontend:**

1. **Perda de produtividade do fornecedor:** A fragmentacao visual e a ausencia de feedback adequado adicionam ~15-20min de tempo improdutivo por sessao de trabalho. Em 6 meses com uso diario, isso equivale a **~50-65 horas de tempo desperdicado** por operador.

2. **Perda de oportunidades comerciais:** Sem notificacoes proativas e com FCP lento, fornecedores em areas rurais (maioria do publico-alvo) podem perder prazos de licitacao. Estimativa: **2-5 licitacoes perdidas por semestre** por lentidao/falta de alerta.

3. **Exclusao de usuarios:** Operadores com deficiencia visual sao completamente excluidos. Em um contexto de licitacao publica, isso pode gerar **questionamento juridico** por parte de orgaos de controle.

4. **Impossibilidade de escalar:** Sem design system, cada nova tela adicionada ao GDP leva 3-5x mais tempo que o necessario (copiar+colar CSS inline, adaptar manualmente). O custo de manutencao cresce linearmente com cada pagina.

5. **Reputacao do produto:** A dualidade visual (verde vs azul) e o uso de emojis como icones comunicam "MVP/prototipo", nao "ferramenta profissional". Isso dificulta a expansao comercial para novos fornecedores.

### Recomendacao Final

**Executar Phase A imediatamente** (23h de trabalho, ROI altissimo) e **iniciar Phase B apos Sprint 1** (quando build system estiver disponivel). Phase C deve ser avaliada apos estabilizacao dos testes (Sprint 2+).

A priorizacao do draft (@architect) esta correta ao colocar seguranca primeiro (Sprint 0). Porem, recomendo que **Phase A (quick fixes UX) seja executada em paralelo** com Sprint 0, pois sao totalmente independentes e melhoram a experiencia do usuario sem risco.

**Veredicto para QA Gate (Phase 7):**
- Frontend/UX debt items: **CORRETAMENTE MAPEADOS** (com 4 ajustes de severidade)
- Riscos adicionais identificados: **6 novos items** (TD-UX-001 a TD-UX-006)
- Plano de remediacao: **ADEQUADO**, com sugestao de paralelizar Phase A com Sprint 0

---

*Documento gerado por @ux-design-expert (Uma) — Brownfield Discovery Phase 6*
*Pendente: @qa (Phase 7) para QA Gate final*
