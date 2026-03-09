# Avaliacao de Debito Tecnico — Assessment Final

**Fase:** Brownfield Discovery — Fase 8
**Agente:** @architect (Aria)
**Data:** 2026-03-09
**Status:** FINAL — Validado por @data-engineer, @ux-design-expert, @qa

---

## 1. Sumario Executivo

O sistema LicitIA / Painel Caixa Escolar MG e um **MVP funcional** construido com Vanilla JS, Express.js e JSON flat files, deployado no Netlify. O sistema automatiza a operacao de um fornecedor de caixas escolares na SRE Uberaba — desde a coleta de orcamentos do SGD governamental ate o envio de propostas e gestao de pedidos pos-licitacao.

### Numeros-Chave

| Metrica | Valor |
|---------|-------|
| **Total de debitos identificados** | 55 |
| **Debitos CRITICOS** | 8 |
| **Debitos ALTOS** | 16 |
| **Debitos MEDIOS** | 19 |
| **Debitos BAIXOS** | 12 |
| **Esforco total estimado** | 290-340 horas |
| **Custo estimado (R$150/h)** | R$ 43.500 - R$ 51.000 |
| **Timeline recomendada** | 12 semanas (3 meses) |
| **Areas afetadas** | Seguranca, Dados, Frontend/UX, DevOps, Performance |

### Distribuicao por Area

| Area | Debitos | Horas Est. | % do Total |
|------|---------|-----------|-----------|
| Seguranca | 12 | 55h | 17% |
| Dados/Integridade | 18 | 105h | 33% |
| Frontend/UX | 20 | 110h | 34% |
| DevOps/Ops | 5 | 50h | 16% |
| **Total** | **55** | **320h** | **100%** |

---

## 2. Inventario Completo de Debitos (Validado)

### 2.1 Debitos CRITICOS (8)

Requerem **acao imediata**. Risco ativo de seguranca, conformidade legal ou integridade de dados.

| # | ID | Debito | Area | Horas | Validado Por |
|---|-----|--------|------|-------|-------------|
| 1 | SEC-5/D-01 | **Credenciais de 5 escolas em plain text** commitadas no repositorio (escolas-credentials.json) | Seguranca | 3h | @data-engineer |
| 2 | SEC-1/D-02/UX-01 | **Login SHA-256 hardcoded** + senha `lariucci2026` em comentario no auth.js | Seguranca | 6h | @data-engineer, @ux-design-expert |
| 3 | SEC-3/D-03 | **APIs Express e Netlify Functions sem autenticacao** — qualquer cliente pode enviar propostas ao SGD | Seguranca | 6h | @data-engineer |
| 4 | D-04 | **CNPJ real do fornecedor no .env.example** commitado | Seguranca | 0.5h | @data-engineer (elevado para CRITICO) |
| 5 | D-09 | **Fuzzy match de itens no submit SGD** — pode enviar precos errados ao governo | Dados | 8h | @data-engineer (elevado para CRITICO) |
| 6 | D-19 | **PII de responsaveis de escolas** commitada no repo — violacao LGPD | Conformidade | 6h | @data-engineer (elevado para CRITICO) |
| 7 | UX-04 | **Zero acessibilidade (a11y)** — nenhum aria-*, role, focus management — obrigacao legal | UX | 32h | @ux-design-expert (elevado para CRITICO) |
| 8 | D-25 | **Sem auditoria de acesso** — nenhum log de quem opera no sistema | Seguranca | 6h | @data-engineer (novo) |

### 2.2 Debitos ALTOS (16)

Requerem resolucao nas **proximas 4 semanas**. Risco significativo para operacao e manutencao.

| # | ID | Debito | Area | Horas |
|---|-----|--------|------|-------|
| 9 | D-05 | Sem backup automatico dos JSON files | Dados | 4h |
| 10 | D-06 | Escrita nao-atomica (writeFileSync) — crash corrompe arquivo | Dados | 3h |
| 11 | D-07/SYS-4 | Nenhuma validacao de schema nos dados | Dados | 10h |
| 12 | D-13 | Estimativa de custo ficticia (hash do idBudget) | Dados | 8h |
| 13 | D-21 | Sem transacoes multi-arquivo | Dados | 6h |
| 14 | D-23 | Colisao de concorrencia cron vs endpoint manual | Dados | 3h |
| 15 | SEC-2/UX-13 | Dados sensiveis em localStorage (CNPJ, senha SGD) | Seguranca | 4h |
| 16 | SEC-6 | Sem rate limiting nas APIs | Seguranca | 4h |
| 17 | SYS-1/UX-05 | app.js monolito (2546 linhas) sem modularizacao | Frontend | 20h |
| 18 | SYS-2 | Sem testes automatizados (0% cobertura) | Qualidade | 32h |
| 19 | SYS-8 | Sem CI/CD pipeline | DevOps | 12h |
| 20 | UX-02 | Dois design systems incompativeis (verde vs azul) | UX | 20h |
| 21 | UX-03/UX-23 | 7 paginas independentes sem layout/navegacao compartilhada | UX | 32h |
| 22 | UX-06 | innerHTML sem sanitizacao consistente (risco XSS) | Seguranca/UX | 8h |
| 23 | UX-12 | localStorage como unico storage — risco perda dados | Dados/UX | 8h |
| 24 | SEC-7/SYS-5 | Sem validacao de input e error handling padronizado | Backend | 6h |

### 2.3 Debitos MEDIOS (19)

Requerem resolucao nas **proximas 8 semanas**. Impactam qualidade e experiencia.

| # | ID | Debito | Area | Horas |
|---|-----|--------|------|-------|
| 25 | D-08 | Scan SGD sequencial (5-10 min para 60 budgets) | Performance | 4h |
| 26 | D-10 | Sem versionamento de dados (nenhum updatedAt) | Dados | 4h |
| 27 | D-11 | readFileSync sincrono bloqueia event loop | Performance | 2h |
| 28 | D-12 | Dois mecanismos de coleta duplicados (Playwright + REST) | Ops | 10h |
| 29 | D-14 | Nearest-match expense groups fragil (threshold 30) | Dados | 3h |
| 30 | D-15/UX-11 | Sem paginacao no dashboard | Performance/UX | 6h |
| 31 | D-20 | Emails pessoais em JSON (LGPD menor) | Conformidade | 2h |
| 32 | D-22 | Sem migracao de schema JSON | Dados | 4h |
| 33 | D-24 | Netlify Blobs nao utilizado para dados criticos | Dados | 10h |
| 34 | SYS-6 | Sem logging estruturado | Ops | 6h |
| 35 | SYS-9 | Sem health monitoring em producao | Ops | 6h |
| 36 | UX-07 | Sem loading states globais | UX | 3h |
| 37 | UX-08 | Sem error boundaries visuais | UX | 4h |
| 38 | UX-09/SYS-10 | PWA entregador incompleta | UX | 6h |
| 39 | UX-17 | Sem undo/redo em acoes destrutivas | UX | 6h |
| 40 | UX-20 | Contraste insuficiente em texto muted | UX | 4h |
| 41 | UX-21 | Tabelas nao responsivas em mobile | UX | 6h |
| 42 | UX-22 | Sem feedback haptico/visual na PWA entregador | UX | 3h |
| 43 | UX-24 | Formularios sem validacao em tempo real | UX | 4h |

### 2.4 Debitos BAIXOS (12)

Resolucao em **8-12 semanas**. Melhorias incrementais.

| # | ID | Debito | Area | Horas |
|---|-----|--------|------|-------|
| 44 | D-16 | ARP hardcoded em JSON estatico | Dados | 10h |
| 45 | D-17 | Sem indices/cache para buscas | Performance | 2h |
| 46 | D-18 | Sem rotacao de logs | Ops | 2h |
| 47 | SYS-7 | Dependencias CDN sem versao fixa | Frontend | 3h |
| 48 | UX-10 | Dados demo hardcoded no entregador | UX | 1h |
| 49 | UX-14 | prompt() para credenciais SGD | UX | 3h |
| 50 | UX-15 | Sem animacoes de transicao entre abas | UX | 2h |
| 51 | UX-16 | Feedback visual insuficiente em acoes | UX | 3h |
| 52 | UX-18 | Emoji como icones (inconsistente entre OS) | UX | 3h |
| 53 | UX-19 | Sem internacionalizacao (i18n) | UX | 12h |
| 54 | SEC-4 | CNPJ/senha em plaintext no .env (sem vault) | Seguranca | 4h |
| 55 | G-2 | Sem analise de compatibilidade de browser | QA | 3h |

---

## 3. Matriz de Prioridade Final

### 3.1 Prioridade P0 — IMEDIATO (Semana 1)

| # | Debito | Horas | Dependencias |
|---|--------|-------|-------------|
| 1 | D-04: Substituir CNPJ real no .env.example | 0.5h | Nenhuma |
| 2 | D-01/D-19: Remover credenciais e PII do repo (git-filter-repo) | 6h | Nenhuma |
| 3 | D-02: Remover senha do comentario auth.js | 1h | Nenhuma |
| 4 | D-23: Lock file para concorrencia scan | 3h | Nenhuma |
| **Total P0** | | **10.5h** | |

### 3.2 Prioridade P1 — URGENTE (Semana 2-3)

| # | Debito | Horas | Dependencias |
|---|--------|-------|-------------|
| 5 | D-06: Escrita atomica de JSON | 3h | Nenhuma |
| 6 | SEC-3/D-03: Auth nas APIs Express + Netlify | 6h | D-02 |
| 7 | D-09: Matching deterministico por idBudgetItem | 8h | Nenhuma |
| 8 | D-07: Validacao schema com Zod | 10h | Nenhuma |
| 9 | D-25: Audit log de operacoes | 6h | D-03 |
| 10 | SEC-2/UX-13: Proteger credenciais SGD | 4h | D-03 |
| **Total P1** | | **37h** | |

### 3.3 Prioridade P2 — ALTO (Semana 4-7)

| # | Debito | Horas | Dependencias |
|---|--------|-------|-------------|
| 11 | SYS-8: CI/CD pipeline (GitHub Actions) | 12h | Nenhuma |
| 12 | SYS-2: Testes automatizados (Vitest + Playwright) | 32h | SYS-8 |
| 13 | UX-02: Design system unificado | 20h | Nenhuma |
| 14 | SYS-1/UX-05: Modularizar app.js | 20h | SYS-2 (testes primeiro) |
| 15 | UX-03/UX-23: Layout compartilhado + navegacao | 32h | UX-02 |
| 16 | UX-04: Acessibilidade WCAG AA | 32h | UX-03 |
| 17 | UX-06: Sanitizacao innerHTML | 8h | UX-05 |
| 18 | D-13: Estimativas de custo reais | 8h | D-07 |
| 19 | SEC-1/UX-01: Auth segura (Supabase Auth) | 16h | D-03 |
| 20 | UX-12: IndexedDB como fallback storage | 8h | Nenhuma |
| 21 | D-05: Backup automatico | 4h | D-06 |
| 22 | D-21: Transacoes multi-arquivo | 6h | D-06 |
| 23 | SEC-6: Rate limiting | 4h | D-03 |
| 24 | SEC-7/SYS-5: Validacao input + error handling | 6h | D-07 |
| **Total P2** | | **208h** | |

### 3.4 Prioridade P3 — MEDIO (Semana 8-10)

| # | Debito | Horas | Dependencias |
|---|--------|-------|-------------|
| 25 | D-12: Unificar pipeline coleta | 10h | D-07 |
| 26 | D-22: Sistema migracao schema | 4h | D-07 |
| 27 | D-08: Paralelizar scan SGD | 4h | D-23 |
| 28 | D-10: Versionamento de dados | 4h | D-22 |
| 29 | D-11: readFileSync → async | 2h | Nenhuma |
| 30 | D-14: Cache expense groups | 3h | Nenhuma |
| 31 | D-15/UX-11: Paginacao + tabelas responsivas | 6h | UX-05 |
| 32 | D-24: Migrar para Netlify Blobs/Supabase | 10h | D-07, UX-01 |
| 33 | SYS-6: Logging estruturado | 6h | Nenhuma |
| 34 | SYS-9: Health monitoring | 6h | SYS-8 |
| 35 | UX-07: Loading states | 3h | Nenhuma |
| 36 | UX-08: Error boundaries | 4h | UX-05 |
| 37 | UX-09/SYS-10: PWA completa entregador | 6h | Nenhuma |
| 38 | UX-20: Ajustar contraste | 4h | UX-02 |
| 39 | UX-21: Tabelas responsivas mobile | 6h | UX-02 |
| 40 | UX-22: Feedback PWA entregador | 3h | UX-09 |
| 41 | UX-24: Validacao inline formularios | 4h | UX-05 |
| 42 | D-20: Anonimizar emails pessoais | 2h | Nenhuma |
| 43 | UX-17: Undo basico | 6h | UX-05 |
| **Total P3** | | **97h** | |

### 3.5 Prioridade P4 — BAIXO (Semana 11-12)

| # | Debito | Horas | Dependencias |
|---|--------|-------|-------------|
| 44 | D-16: ARP dinamica (scraping CatalogoMobile) | 10h | Nenhuma |
| 45 | D-17: Indices em memoria | 2h | Nenhuma |
| 46 | D-18: Rotacao de logs | 2h | SYS-6 |
| 47 | SYS-7: Fixar versoes CDN | 3h | SYS-8 |
| 48 | UX-10: Remover dados demo | 1h | Nenhuma |
| 49 | UX-14: Modal credenciais SGD | 3h | UX-01 |
| 50 | UX-15: Animacoes transicao | 2h | UX-02 |
| 51 | UX-16: Confirmacao acoes destrutivas | 3h | Nenhuma |
| 52 | UX-18: Icon library (Lucide) | 3h | UX-02 |
| 53 | UX-19: Preparacao i18n | 12h | UX-05 |
| 54 | SEC-4: Vault para credenciais .env | 4h | Nenhuma |
| 55 | G-2: Browser compatibility testing | 3h | SYS-2 |
| **Total P4** | | **48h** | |

---

## 4. Plano de Resolucao

### 4.1 Timeline de Sprints

```
Semana 1  ┃ Sprint 0: Seguranca Emergencial         ┃  10.5h  ┃ P0
Semana 2  ┃ Sprint 1: Integridade de Dados (1/2)     ┃  20h    ┃ P1
Semana 3  ┃ Sprint 1: Integridade de Dados (2/2)     ┃  17h    ┃ P1
Semana 4  ┃ Sprint 2: Fundacao (CI/CD + Testes)      ┃  22h    ┃ P2
Semana 5  ┃ Sprint 2: Fundacao (Testes + Design)     ┃  22h    ┃ P2
Semana 6  ┃ Sprint 3: Refatoracao Frontend (1/2)     ┃  28h    ┃ P2
Semana 7  ┃ Sprint 3: Refatoracao Frontend (2/2)     ┃  28h    ┃ P2
Semana 8  ┃ Sprint 4: Auth + A11y (1/2)              ┃  28h    ┃ P2
Semana 9  ┃ Sprint 4: Auth + A11y (2/2)              ┃  28h    ┃ P2/P3
Semana 10 ┃ Sprint 5: Consolidacao + Performance     ┃  28h    ┃ P3
Semana 11 ┃ Sprint 6: Polish (1/2)                   ┃  24h    ┃ P3/P4
Semana 12 ┃ Sprint 6: Polish (2/2)                   ┃  24h    ┃ P4
          ┃                                          ┃         ┃
          ┃ TOTAL                                    ┃ ~280h   ┃
```

### 4.2 Detalhamento por Sprint

#### Sprint 0 — Seguranca Emergencial (Semana 1, 10.5h)

**Objetivo:** Eliminar riscos de seguranca ativos.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Substituir CNPJ no .env.example | 0.5h | .env.example com placeholders |
| Remover escolas-credentials.json + PII (git-filter-repo) | 6h | Historico limpo, credenciais em .env |
| Remover comentario com senha de auth.js | 1h | auth.js sem senhas |
| Implementar lock file para concorrencia scan | 3h | Scan thread-safe |

**Criterio de sucesso:** `grep -r "lariucci\|gdp2025\|escola2025" . --include="*.js" --include="*.json"` retorna zero resultados.

#### Sprint 1 — Integridade de Dados (Semana 2-3, 37h)

**Objetivo:** Proteger dados contra corrupcao e acesso nao autorizado.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Escrita atomica de JSON | 3h | write-to-temp + rename |
| Auth middleware Express + Netlify | 6h | APIs protegidas com token/session |
| Matching deterministico SGD items | 8h | Match por idBudgetItem, sem fuzzy |
| Validacao schema Zod | 10h | 5 schemas (Orcamento, Proposta, Pedido, Preco, Escola) |
| Audit log | 6h | Log de todas as operacoes |
| Proteger credenciais SGD (session) | 4h | Credenciais em httpOnly cookie |

**Criterio de sucesso:** Todas as APIs retornam 401 sem auth. Schema rejeita dados invalidos. Matching testado com 10+ cenarios reais.

#### Sprint 2 — Fundacao DevOps + Design (Semana 4-5, 44h)

**Objetivo:** Estabelecer pipeline de qualidade e fundacao visual.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| CI/CD GitHub Actions | 12h | Pipeline: lint, test, build, deploy |
| Testes automatizados (Vitest + Playwright) | 32h | Cobertura >= 60% |

**Em paralelo:**

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Design system unificado (design-tokens.css) | 20h | Tokens, componentes base |
| Estimativas de custo reais (banco-precos) | 8h | Calculo baseado em dados reais |

**Criterio de sucesso:** Pipeline verde em cada commit. Testes e2e para fluxos criticos. Design tokens aplicados em index.html.

#### Sprint 3 — Refatoracao Frontend (Semana 6-7, 56h)

**Objetivo:** Modularizar frontend e unificar experiencia.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Modularizar app.js em ES modules | 20h | 6+ modulos (state, render, sgd, banco, preorcamento, utils) |
| Layout compartilhado + navegacao GDP | 32h | Shell unico, topbar, sidebar, breadcrumbs |
| Sanitizacao innerHTML | 8h | escapeHtml consistente ou DOM API |

**Criterio de sucesso:** Nenhum arquivo JS com mais de 500 linhas. Navegacao consistente entre paginas.

#### Sprint 4 — Autenticacao Segura + Acessibilidade (Semana 8-9, 56h)

**Objetivo:** Implementar autenticacao real e conformidade a11y.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Supabase Auth (fornecedor, escola, admin, entregador) | 16h | 4 roles com login seguro |
| Acessibilidade WCAG 2.1 AA | 32h | aria-*, roles, focus, contraste, labels |
| IndexedDB como fallback storage | 8h | Persistencia resiliente |

**Criterio de sucesso:** Lighthouse a11y >= 90. Login via Supabase Auth. Dados persistem apos limpeza de cache.

#### Sprint 5 — Consolidacao (Semana 10, 28h)

**Objetivo:** Estabilizar e otimizar.

| Tarefa | Horas | Resultado |
|--------|-------|----------|
| Unificar pipeline coleta (eliminar Playwright) | 10h | Pipeline unico REST |
| Paginacao + tabelas responsivas | 6h | Paginacao server-side |
| Logging estruturado | 6h | Logs com nivel, timestamp, contexto |
| Health monitoring | 6h | Alertas de falha, uptime |

#### Sprint 6 — Polish (Semana 11-12, 48h)

**Objetivo:** Melhorias incrementais e finalizacao.

Inclui: PWA completa, loading states, error boundaries, undo, icon library, validacao inline, contraste, ARP dinamica, versoes CDN fixas, rotacao logs, browser testing.

---

## 5. Riscos e Mitigacoes

| # | Risco | Probabilidade | Impacto | Mitigacao |
|---|-------|--------------|---------|-----------|
| R-1 | Migracao auth quebra fluxos existentes | ALTA | ALTO | Feature flag, rollout gradual, auth antiga ativa em paralelo |
| R-2 | Modularizacao app.js causa regressoes | ALTA | ALTO | Testes e2e ANTES de modularizar (Sprint 2 antes de Sprint 3) |
| R-3 | Unificacao CSS quebra layout GDP | MEDIA | MEDIO | Migrar uma pagina por vez, visual regression tests |
| R-4 | Escolas perdem acesso durante rotacao credenciais | ALTA | ALTO | Comunicar 7 dias antes, fornecer novas credenciais por canal seguro |
| R-5 | Propostas SGD com precos errados (D-09) JA ACONTECENDO | ALTA | CRITICO | Auditar propostas enviadas imediatamente, corrigir matching em Sprint 1 |
| R-6 | Supabase free tier limitado | BAIXA | MEDIO | Volume atual ~80KB, muito abaixo do limite. Monitorar. |
| R-7 | Time de 1 pessoa = 12 semanas realistas? | MEDIA | ALTO | Considerar priorizacao mais agressiva: P0+P1 em 3 semanas, P2 seletivo |
| R-8 | git-filter-repo pode afetar colaboradores | MEDIA | MEDIO | Comunicar ANTES, todos fazem git clone fresco apos |

---

## 6. Stack Tecnologica Recomendada

### 6.1 Decisoes Arquiteturais

| Aspecto | Decisao | Alternativas Descartadas | Justificativa |
|---------|---------|-------------------------|---------------|
| **Auth** | Supabase Auth | Firebase Auth, Auth0 | Free tier generoso, PostgreSQL integrado, SDK JS simples |
| **Database** | Supabase PostgreSQL (futuro) | SQLite, Netlify Blobs | Transacoes, indices, RLS, backup nativo. SQLite nao funciona em Netlify Functions. |
| **Validacao** | Zod | JSON Schema (Ajv), Joi | Runtime JS, ergonomico, TypeScript-ready |
| **Frontend** | Vanilla JS + Web Components | Preact, Svelte, Lit | Sem build step, encapsulamento nativo, menor mudanca |
| **Design** | CSS Custom Properties (dark, base azul) | Tailwind, Sass | Ja em uso, leve, sem build step |
| **Testes** | Vitest (unit) + Playwright (e2e) | Jest, Mocha, Cypress | Vitest rapido, ESM nativo. Playwright ja e dependencia. |
| **CI/CD** | GitHub Actions | Netlify CI, CircleCI | Integracao nativa GitHub, free tier generoso |
| **Icons** | Lucide (SVG) | Heroicons, Feather | Leve, consistente, tree-shakeable |

### 6.2 Pipeline CI/CD Recomendado

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - Checkout
      - Node.js setup (18.x)
      - npm ci
      - Lint (ESLint)
      - Type check (tsc --noEmit, se TypeScript futuro)
      - Unit tests (Vitest)
      - E2E tests (Playwright)
      - A11y audit (axe-core)
      - Security scan (npm audit)
  deploy:
    needs: quality
    if: github.ref == 'refs/heads/main'
    steps:
      - Deploy to Netlify
```

---

## 7. Criterios de Sucesso

### 7.1 Metricas Alvo

| Metrica | Atual | Meta Pos-Resolucao |
|---------|-------|-------------------|
| Debitos CRITICOS | 8 | 0 |
| Debitos ALTOS | 16 | <= 3 (aceitaveis) |
| Cobertura de testes | 0% | >= 60% |
| Lighthouse a11y | ~30-40 | >= 90 |
| Lighthouse performance | ~85 | >= 90 |
| Pipeline CI/CD | Inexistente | Verde em cada PR |
| Credenciais expostas | 3+ arquivos | 0 |
| Propostas com matching errado | Desconhecido | 0 (deterministico) |
| Tempo de scan SGD | 5-10 min | < 2 min |
| Paginas com layout compartilhado | 0/7 | 7/7 |

### 7.2 Definition of Done (Brownfield)

O Brownfield Discovery e considerado **completo** quando:

- [ ] Todos os debitos P0 resolvidos
- [ ] Todos os debitos P1 resolvidos
- [ ] Pipeline CI/CD operacional
- [ ] Cobertura de testes >= 60%
- [ ] Lighthouse a11y >= 90 em todas as paginas
- [ ] Zero credenciais no repositorio
- [ ] Auth server-side implementada
- [ ] Design system unificado
- [ ] app.js modularizado
- [ ] Layout compartilhado entre paginas

---

## Apendice A — Referencia de Documentos

| Documento | Fase | Agente | Path |
|-----------|------|--------|------|
| System Architecture | 1 | @architect | `docs/architecture/system-architecture.md` |
| Data Audit | 2 | @data-engineer | `docs/architecture/data-audit.md` |
| Frontend Spec | 3 | @ux-design-expert | `docs/architecture/frontend-spec.md` |
| Technical Debt DRAFT | 4 | @architect | `docs/prd/technical-debt-DRAFT.md` |
| DB Specialist Review | 5 | @data-engineer | `docs/reviews/db-specialist-review.md` |
| UX Specialist Review | 6 | @ux-design-expert | `docs/reviews/ux-specialist-review.md` |
| QA Review | 7 | @qa | `docs/reviews/qa-review.md` |
| Technical Debt Assessment | 8 | @architect | `docs/prd/technical-debt-assessment.md` |

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 8*
*Aria, arquitetando o futuro*
