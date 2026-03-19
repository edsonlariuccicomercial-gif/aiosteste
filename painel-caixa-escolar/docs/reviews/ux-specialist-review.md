# Validacao de Especialista — UX/Frontend

**Fase:** Brownfield Discovery — Fase 6
**Agente:** @ux-design-expert (Uma)
**Data:** 2026-03-09
**Documento revisado:** `docs/prd/technical-debt-DRAFT.md`

---

## 1. Validacao dos Debitos de UX

### 1.1 Debitos Confirmados

| ID DRAFT | Veredicto | Ajuste | Justificativa |
|----------|-----------|--------|---------------|
| UX-01 (Auth insegura client-side) | **CONFIRMADO** | Mantido CRITICO | Hash SHA-256 hardcoded com senha em comentario. Seguranca zero. |
| UX-02 (Dois design systems) | **CONFIRMADO** | Mantido ALTO | Painel verde/escuro vs GDP azul/slate. Tokens diferentes, componentes incompativeis. Experiencia de usuario completamente fragmentada. |
| UX-03 (7 paginas sem layout) | **CONFIRMADO** | Mantido ALTO | Cada pagina GDP tem 200-400 linhas de CSS inline. Nao ha shell compartilhado, topbar duplicado, navegacao inconsistente. |
| UX-04 (Zero a11y) | **CONFIRMADO** | Severidade elevada: ALTO → CRITICO | Sistema educacional publico de Minas Gerais — **obrigacao legal** de acessibilidade (Lei 13.146/2015 — Estatuto da Pessoa com Deficiencia + Decreto 5.296/2004). Ausencia total de aria-*, roles, focus management. |
| UX-05 (app.js monolito) | **CONFIRMADO** | Mantido ALTO | 2546 linhas, funcoes globais, renderizacao imperativa via innerHTML. Impossivel testar ou manter. |
| UX-06 (innerHTML XSS) | **CONFIRMADO** | Severidade elevada: MEDIO → ALTO | escapeHtml existe mas uso e inconsistente. Dados do SGD (nomes de escolas, objetos) sao injetados sem sanitizacao em varios pontos. |
| UX-07 (Sem loading states) | **CONFIRMADO** | Mantido MEDIO | Operacoes SGD (scan, submit) levam segundos. Sem feedback, usuario clica multiplas vezes. |
| UX-08 (Sem error boundaries) | **CONFIRMADO** | Mantido MEDIO | alert() para erros criticos, console.warn para outros. Sem fallback visual. |
| UX-09 (PWA incompleta) | **CONFIRMADO** | Mantido MEDIO | manifest-entregador.json referenciado mas nao existe. SW nao registrado. Icons ausentes. |
| UX-10 (Dados demo hardcoded) | **CONFIRMADO** | Mantido BAIXO | gdp-entregador.html tem pedidos de demonstracao inline. Menor impacto. |
| UX-11 (Sem paginacao) | **CONFIRMADO** | Mantido MEDIO | Tabelas renderizam todos os registros. Problema real com >100 linhas. |
| UX-12 (localStorage unico storage) | **CONFIRMADO** | Mantido ALTO | Pre-orcamentos, banco de precos, credenciais SGD — tudo em localStorage. Limpeza de cache = perda total. |
| UX-13 (Credenciais SGD localStorage) | **CONFIRMADO** | Mantido ALTO | CNPJ e senha SGD armazenados em plain text. Qualquer extensao do browser pode ler. |
| UX-14 (prompt() credenciais) | **CONFIRMADO** | Mantido BAIXO | UX primitiva mas funcional. |
| UX-15 (Sem animacoes transicao) | **CONFIRMADO** | Mantido BAIXO | display:none → display:block e abrupto. |
| UX-16 (Feedback insuficiente) | **CONFIRMADO** | Mantido BAIXO | Apenas toast. Falta confirmacao antes de acoes destrutivas. |
| UX-17 (Sem undo/redo) | **CONFIRMADO** | Mantido MEDIO | "Recusar" e "Limpar Banco" sao irreversiveis. |
| UX-18 (Emoji como icones) | **CONFIRMADO** | Mantido BAIXO | Renderizacao varia entre Windows, Mac, Android. |

### 1.2 Debitos Removidos

Nenhum debito removido. Todos os 18 debitos UX sao validos.

### 1.3 Debitos Adicionados

| ID | Debito | Severidade | Esforco | Justificativa |
|----|--------|-----------|---------|---------------|
| UX-19 | **Sem internacionalizacao (i18n)** — textos hardcoded em portugues misturado com ingles (labels em PT, variaveis em EN, status em EN) | BAIXO | 12h | Nao e urgente mas dificulta manutencao e eventual expansao. |
| UX-20 | **Sem modo de alto contraste** — tema escuro com cores de baixo contraste (muted: #9bb7a8 sobre bg: #0d1412) | MEDIO | 4h | Contraste ratio de ~5.8:1 no texto muted — marginal para WCAG AA (4.5:1). Texto menor pode falhar AA. |
| UX-21 | **Tabelas sem responsividade** — dependem de overflow-x: auto em todas as paginas | MEDIO | 6h | Em dispositivos moveis, tabelas ficam ilegíveis. Necessita card view alternativo para mobile. |
| UX-22 | **Sem feedback háptico/visual na PWA do entregador** — acoes criticas (confirmar entrega, assinar) sem confirmacao visual robusta | MEDIO | 3h | Em campo, entregador precisa de feedback claro. Vibration API + confirmacao visual. |
| UX-23 | **Navegacao nao persistente entre paginas GDP** — cada pagina recarrega completamente, sem estado de navegacao | ALTO | 8h | Usuario perde contexto ao navegar. Nao ha breadcrumbs, back funciona de forma imprevisivel. |
| UX-24 | **Formularios sem validacao em tempo real** — validacao so ocorre no submit, sem feedback inline | MEDIO | 4h | Usuario so descobre erros ao enviar. Falta indicadores visuais de campos obrigatorios e formato. |

---

## 2. Estimativas de Horas por Debito

| ID | Debito (resumo) | Horas | Complexidade | Notas |
|----|-----------------|-------|-------------|-------|
| UX-01 | Auth segura (requer backend) | 16h | Alta | Depende de implementacao backend (Supabase Auth recomendado) |
| UX-02 | Unificar design system | 20h | Alta | Criar design-tokens.css unificado, migrar 7 paginas |
| UX-03 | Layout compartilhado | 24h | Alta | Extrair shell, topbar, sidebar como componentes reutilizaveis |
| UX-04 | Acessibilidade basica WCAG AA | 20h | Alta | aria-*, roles, focus management, labels, alt text em todas as paginas |
| UX-05 | Modularizar app.js | 20h | Alta | Separar em modulos ES: state, render, sgd, banco, preorcamento, utils |
| UX-06 | Sanitizacao innerHTML consistente | 8h | Media | Auditar todos os pontos de innerHTML, aplicar escapeHtml ou migrar para DOM API |
| UX-07 | Loading states globais | 3h | Baixa | Spinner/skeleton overlay durante operacoes async |
| UX-08 | Error boundaries visuais | 4h | Media | Error state UI para falhas de rede, API, parsing |
| UX-09 | PWA completa entregador | 6h | Media | Criar manifest, icons, registrar SW, testar install prompt |
| UX-10 | Remover dados demo | 1h | Trivial | Substituir por fetch de API ou estado vazio |
| UX-11 | Paginacao de tabelas | 6h | Media | Virtual scroll ou paginacao classica com controles |
| UX-12 | IndexedDB como backup de localStorage | 8h | Media | Adicionar camada de persistencia com fallback |
| UX-13 | Proteger credenciais SGD | 4h | Media | Mover para session com httpOnly cookie ou Supabase Auth |
| UX-14 | Modal para credenciais SGD | 3h | Baixa | Substituir prompt() por modal customizado |
| UX-15 | Animacoes de transicao | 2h | Baixa | CSS transitions entre abas |
| UX-16 | Dialogo de confirmacao | 3h | Baixa | Modal "Tem certeza?" antes de acoes destrutivas |
| UX-17 | Undo basico | 6h | Media | Stack de undo para ultimas 5 acoes com timer de 10s |
| UX-18 | Icon library (Lucide) | 3h | Baixa | Substituir emojis por icones SVG consistentes |
| UX-19 | Preparacao i18n | 12h | Alta | Extrair strings, criar estrutura de locale |
| UX-20 | Modo alto contraste | 4h | Baixa | Ajustar tokens de cor, testar com ferramentas |
| UX-21 | Tabelas responsivas | 6h | Media | Card view alternativo em breakpoint mobile |
| UX-22 | Feedback PWA entregador | 3h | Baixa | Vibration API + confirmacao visual |
| UX-23 | Navegacao persistente GDP | 8h | Media | Shell compartilhado com estado de navegacao |
| UX-24 | Validacao inline formularios | 4h | Media | Validacao em tempo real com feedback visual |

**Total estimado (UX):** ~194 horas

---

## 3. Priorizacao da Perspectiva UX

### 3.1 Top 5 — Maior Impacto na Experiencia do Usuario

1. **UX-04 (Acessibilidade)** — Obrigacao legal + inclusao. Sistema educacional publico DEVE ser acessivel.
2. **UX-02 (Design system unificado)** — Maior impacto visual. Unificar elimina confusao e profissionaliza.
3. **UX-01 (Autenticacao segura)** — Fundacao de confianca. Sem auth real, todo o sistema e fragil.
4. **UX-03/UX-23 (Layout + navegacao)** — Experiencia coesa. Elimina sensacao de "paginas soltas".
5. **UX-05 (Modularizacao app.js)** — Fundacao tecnica. Sem isso, qualquer melhoria UX e arriscada.

### 3.2 Ordem Recomendada de Resolucao

**Sprint 1 — Fundacao Visual (Semana 1-2)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 1 | UX-02 | Design system unificado | 20h | Fundacao para todas as melhorias visuais |
| 2 | UX-18 | Icon library (Lucide) | 3h | Quick win visual significativo |
| 3 | UX-20 | Ajustar contraste | 4h | Quick win a11y |
| **Subtotal** | | | **27h** | |

**Sprint 2 — Acessibilidade + Layout (Semana 3-4)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 4 | UX-04 | Acessibilidade WCAG AA | 20h | Obrigacao legal |
| 5 | UX-03 + UX-23 | Layout compartilhado + navegacao | 32h | Experiencia coesa |
| **Subtotal** | | | **52h** | |

**Sprint 3 — Modularizacao + Qualidade (Semana 5-6)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 6 | UX-05 | Modularizar app.js | 20h | Fundacao tecnica |
| 7 | UX-06 | Sanitizacao innerHTML | 8h | Seguranca |
| 8 | UX-07 | Loading states | 3h | Quick win UX |
| 9 | UX-08 | Error boundaries | 4h | Resiliencia |
| **Subtotal** | | | **35h** | |

**Sprint 4 — Autenticacao + Storage (Semana 7-8)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 10 | UX-01 | Auth segura (Supabase) | 16h | Fundacao de confianca |
| 11 | UX-13 | Proteger credenciais SGD | 4h | Complemento de auth |
| 12 | UX-12 | IndexedDB fallback | 8h | Resiliencia de dados |
| **Subtotal** | | | **28h** | |

**Sprint 5 — Polish + PWA (Semana 9-10)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 13 | UX-09 | PWA completa | 6h | App instalavel |
| 14 | UX-22 | Feedback PWA entregador | 3h | UX campo |
| 15 | UX-11 + UX-21 | Paginacao + tabelas responsivas | 12h | Performance mobile |
| 16 | UX-24 | Validacao inline | 4h | Formularios |
| 17 | UX-16 | Confirmacao acoes | 3h | Seguranca UX |
| 18 | UX-17 | Undo basico | 6h | Recuperacao erros |
| **Subtotal** | | | **34h** | |

**Sprint 6 — Nice-to-have (Semana 11-12)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 19 | UX-14 | Modal credenciais SGD | 3h | UX menor |
| 20 | UX-15 | Animacoes transicao | 2h | Polish |
| 21 | UX-10 | Remover dados demo | 1h | Limpeza |
| 22 | UX-19 | Preparacao i18n | 12h | Futuro |
| **Subtotal** | | | **18h** | |

---

## 4. Recomendacoes de Design

### 4.1 Design System Unificado — Direcao Recomendada

**Recomendacao: Migrar para tema Azul/Slate (GDP) como base unica.**

| Aspecto | Decisao | Justificativa |
|---------|---------|---------------|
| Tema base | Azul/Slate (dark) | Mais profissional, melhor contraste, alinhado com identidade gov |
| Accent color | Azul (#3b82f6) principal + Verde (#22c55e) para sucesso | Azul transmite confianca institucional |
| Tokens | CSS custom properties unificados em `design-tokens.css` | Single source of truth |
| Tipografia | Inter como primaria, system-ui como fallback | Inter ja e usada no painel, boa legibilidade |
| Espacamento | Scale de 4px (4, 8, 12, 16, 20, 24, 32, 40, 48, 64) | Consistencia matematica |
| Border radius | 8px padrao, 4px para inputs, 12px para cards | Moderno mas nao excessivo |
| Shadows | Sem box-shadow pesado. Usar border sutil + background difference | Tema escuro funciona melhor com bordas que sombras |

### 4.2 Framework Frontend — Recomendacao

**Recomendacao: Manter Vanilla JS + Web Components nativos.**

| Opcao | Pros | Contras | Veredicto |
|-------|------|---------|-----------|
| Manter Vanilla JS | Zero overhead, equipe ja conhece | Dificil escalar, sem componentizacao | NAO (sozinho) |
| Vanilla JS + Web Components | Nativo, sem dependencia, encapsulamento | API verbose, IE11 (irrelevante) | **SIM** |
| Lit (Web Components) | DX melhor, template literals, reactivo | Dependencia extra, build step | CONSIDERAR |
| Preact | Leve (3KB), JSX, ecossistema React | Build step, mudanca de paradigma | FUTURO |
| Svelte | Performance otima, DX excelente | Build step, mudanca de paradigma | FUTURO |

**Justificativa:** Web Components nativos permitem componentizacao (Shadow DOM, slots, custom elements) sem introduzir build step ou dependencia. Se a equipe sentir necessidade de DX melhor, Lit e o proximo passo natural (adiciona apenas 5KB e usa Web Components por baixo).

### 4.3 Acessibilidade — Nivel Recomendado

**WCAG 2.1 Nivel AA — Obrigatorio.**

Justificativa legal:
- **Lei 13.146/2015** (Estatuto da Pessoa com Deficiencia) — Art. 63: obrigatoriedade de acessibilidade em sites governamentais e de servico publico
- **Decreto 5.296/2004** — regulamenta acessibilidade web para orgaos publicos
- **eMAG 3.1** (Modelo de Acessibilidade em Governo Eletronico) — padrao brasileiro baseado em WCAG 2.0 AA

Checklist minimo imediato:
1. `role` semanticos em todos os componentes customizados
2. `aria-label`/`aria-labelledby` em todos os controles interativos
3. Focus management em modals e navegacao por teclado
4. Contraste minimo 4.5:1 para texto, 3:1 para texto grande
5. Alt text em todas as imagens e icones informativos
6. Skip links para conteudo principal

### 4.4 PWA do Entregador — Recomendacao

**Recomendacao: Completar PWA nativa (nao migrar para React Native/Flutter).**

| Fator | PWA | React Native | Flutter |
|-------|-----|-------------|---------|
| Custo | Baixo (6h) | Alto (80h+) | Alto (80h+) |
| Manutencao | Unica codebase | iOS + Android | iOS + Android |
| Camera | API nativa ok | Nativo | Nativo |
| Assinatura | Canvas touch ok | Expo-signature | CustomPainter |
| Offline | Service Worker | AsyncStorage | SharedPrefs |
| Instalacao | Prompt do browser | App stores | App stores |

Para o escopo atual (foto + assinatura + lista de entregas), PWA e suficiente e 10x mais barato.

### 4.5 Componentizacao — Roadmap Sugerido

```
Fase 1: Extrair CSS em design-tokens.css (compartilhado)
         → Todas as paginas importam os mesmos tokens

Fase 2: Criar Web Components basicos:
         → <ce-topbar> (navegacao unificada)
         → <ce-badge status="aberto">
         → <ce-toast message="Salvo!">
         → <ce-modal title="Confirmar">
         → <ce-data-table columns="..." rows="...">

Fase 3: Migrar paginas para usar componentes:
         → index.html usa <ce-topbar>, <ce-data-table>, <ce-modal>
         → GDP pages usam mesmos componentes

Fase 4: Extrair logica de app.js em modulos:
         → state.js (gerenciamento de estado)
         → api.js (chamadas SGD, Tiny)
         → render.js (funcoes de renderizacao)
         → banco.js (banco de precos)
         → preorcamento.js (pre-orcamentos)
```

---

## 5. Respostas as Perguntas do Architect

### Pergunta 1: Tema escuro ou neutro?
**Resposta:** Manter tema escuro, unificar na base azul/slate (GDP). Tema escuro e preferencia atual dos usuarios e reduz fadiga visual em uso prolongado. Ver secao 4.1.

### Pergunta 2: Framework frontend?
**Resposta:** Manter Vanilla JS + Web Components nativos. Sem build step, sem dependencia. Se precisar mais DX, Lit como proximo passo. Ver secao 4.2.

### Pergunta 3: Nivel WCAG?
**Resposta:** WCAG 2.1 AA — obrigatorio legalmente para sistema educacional publico brasileiro. Ver secao 4.3.

### Pergunta 4: PWA vs app nativo?
**Resposta:** Completar PWA. Custo 10x menor, escopo atual nao justifica app nativo. Ver secao 4.4.

### Pergunta 5: Web Components nativos ou Lit/Stencil?
**Resposta:** Web Components nativos primeiro. Lit como upgrade se necessario. Stencil e overkill. Ver secao 4.2.

### Pergunta 6: Top 5 debitos UX com maior impacto?
**Resposta:** (1) UX-04 Acessibilidade, (2) UX-02 Design system, (3) UX-01 Auth, (4) UX-03+UX-23 Layout+navegacao, (5) UX-05 Modularizacao. Ver secao 3.1.

---

*Validado por @ux-design-expert (Uma) — Brownfield Discovery Fase 6*
*Uma, design com proposito*
