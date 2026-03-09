# QA Review — Brownfield Discovery

**Fase:** Brownfield Discovery — Fase 7
**Agente:** @qa (Quinn)
**Data:** 2026-03-09
**Documentos revisados:**
- `docs/prd/technical-debt-DRAFT.md` (Fase 4 - @architect)
- `docs/reviews/db-specialist-review.md` (Fase 5 - @data-engineer)
- `docs/reviews/ux-specialist-review.md` (Fase 6 - @ux-design-expert)

---

## 1. Gate Status

### **APROVADO**

O DRAFT de debito tecnico esta completo e validado pelos especialistas. As seguintes condicoes foram verificadas:

| Criterio | Status | Observacao |
|----------|--------|-----------|
| Todos os debitos inventariados | PASS | 44 debitos no DRAFT + 5 adicionados por DB + 6 adicionados por UX = **55 debitos totais** |
| Severidades validadas por especialistas | PASS | DB elevou 3 severidades (D-04, D-09, D-13, D-19). UX elevou 2 (UX-04, UX-06). Ajustes justificados. |
| Estimativas de horas realistas | PASS | DB: 131.5h, UX: 194h. Total realista para escopo. Nota: ha sobreposicao entre debitos. |
| Prioridades coerentes entre areas | PASS | Ambos especialistas concordam: seguranca primeiro, depois integridade, depois UX. |
| Nenhum debito critico ignorado | PASS | Todos os CRITICOS identificados e priorizados como P0/P1. |
| Dependencias entre debitos mapeadas | PASS | DB mapeou dependencias na secao 2. UX definiu roadmap sequencial. |
| Recomendacoes de resolucao concretas | PASS | DB recomendou Supabase + Zod. UX recomendou Web Components + design tokens. |

---

## 2. Gaps Identificados

### 2.1 Gaps no DRAFT Original

| # | Gap | Severidade | Acao Requerida |
|---|-----|-----------|----------------|
| G-1 | **Sem analise de performance de rede** — DRAFT nao avalia tempos de resposta das APIs SGD/Tiny em producao | BAIXO | Adicionar metricas de latencia no assessment final |
| G-2 | **Sem analise de compatibilidade de browser** — nao ha lista de browsers suportados nem testes cross-browser | MEDIO | Definir browser matrix e testar (Chrome, Firefox, Safari, Edge) |
| G-3 | **Sem analise de SEO/meta tags** — paginas publicas (gdp-portal) podem precisar de SEO basico | BAIXO | Adicionar no assessment se paginas sao publicas |
| G-4 | **Debitos de DevOps subdetalhados** — SYS-8 (CI/CD) mencionado mas sem detalhamento de pipeline ideal | MEDIO | Architect deve detalhar pipeline no assessment final |

### 2.2 Gaps na Revisao DB

| # | Gap | Severidade | Acao Requerida |
|---|-----|-----------|----------------|
| G-5 | **Migracao Supabase nao considera latencia** — Netlify Functions + Supabase pode adicionar ~50-100ms por query | BAIXO | Documentar impacto de latencia na recomendacao |
| G-6 | **git filter-branch e destrutivo** — pode quebrar forks, PRs abertos, referencias. Alternativa: `git-filter-repo` (mais seguro) | MEDIO | Recomendar `git-filter-repo` no assessment final |

### 2.3 Gaps na Revisao UX

| # | Gap | Severidade | Acao Requerida |
|---|-----|-----------|----------------|
| G-7 | **Web Components + Vanilla JS = sem SSR** — implicacao para SEO e first paint do gdp-portal (se publico) | BAIXO | Avaliar se SSR e necessario no contexto |
| G-8 | **Estimativa de 20h para acessibilidade e otimista** — auditoria completa WCAG AA em 7 paginas tipicamente leva 30-40h | MEDIO | Ajustar estimativa no assessment final para 32h |

---

## 3. Riscos Cross-Area

### 3.1 Riscos de Implementacao

| # | Risco | Areas | Probabilidade | Impacto | Mitigacao |
|---|-------|-------|--------------|---------|-----------|
| R-1 | **Migracao de auth quebra fluxo existente** — trocar SHA-256 client-side por Supabase Auth impacta todos os fluxos de login (fornecedor, escola, admin, entregador) | Seguranca + UX + Dados | ALTA | ALTO | Implementar auth nova em paralelo, feature flag, migracao gradual |
| R-2 | **Modularizacao app.js introduz regressoes** — separar 2546 linhas em modulos pode quebrar funcionalidades nao documentadas | Frontend + QA | ALTA | ALTO | Escrever testes e2e ANTES de modularizar. Testes como safety net. |
| R-3 | **Unificacao design system quebra layout GDP** — GDP pages tem CSS inline que pode conflitar com tokens unificados | UX + Frontend | MEDIA | MEDIO | Migrar uma pagina por vez, testar visualmente cada uma |
| R-4 | **Remocao de credenciais do repo exige comunicacao** — escolas precisam receber novas credenciais seguras apos rotacao | Seguranca + Negocio | ALTA | ALTO | Plano de comunicacao com escolas ANTES de rotacionar credenciais |
| R-5 | **Zod + Vanilla JS sem TypeScript** — Zod funciona em JS mas perde os beneficios de type inference | Dados + DX | BAIXA | BAIXO | Aceitavel. Zod ainda valida em runtime, que e o objetivo principal. |
| R-6 | **Supabase free tier tem limites** — 500MB database, 50K auth users, 2GB bandwidth | Dados + Infra | BAIXA | MEDIO | Volume atual (~80KB dados) esta muito abaixo. Monitorar crescimento. |

### 3.2 Riscos de Negocio

| # | Risco | Impacto | Mitigacao |
|---|-------|---------|-----------|
| R-7 | **Sistema inoperante durante migracao** — se auth e dados mudam simultaneamente, dashboard pode ficar fora do ar | CRITICO | Rollout gradual, nunca modificar auth e dados na mesma sprint |
| R-8 | **Escolas perdem acesso durante rotacao de credenciais** — credenciais atuais expostas precisam ser invalidadas | ALTO | Comunicar escolas com 7 dias de antecedencia, fornecer novas credenciais |
| R-9 | **Propostas SGD com precos errados (D-09)** — fuzzy match incorreto pode estar enviando precos errados AGORA | CRITICO | Prioridade maxima: auditar propostas ja enviadas e corrigir matching |

---

## 4. Validacao de Dependencias

### 4.1 Grafo de Dependencias Criticas

```
D-04 (CNPJ .env.example) ──→ Nenhuma dependencia (fazer PRIMEIRO)
                                     │
D-01/D-19 (Credenciais repo) ──→ Nenhuma dependencia (fazer SEGUNDO)
     │                              │
     └── R-4 (comunicar escolas) ───┘
                                     │
D-02 (Senha auth.js) ───────────────┤
     │                               │
     └── UX-01 (Auth segura) ────────┤
          │                          │
          └── D-03 (APIs sem auth) ──┤
               │                     │
               └── D-25 (Audit log) ─┘

SYS-2 (Testes) ──→ R-2 (testes ANTES de modularizar)
     │
     └── UX-05 (Modularizar app.js) ──→ UX-06 (Sanitizacao)
          │
          └── UX-03 (Layout compartilhado) ──→ UX-02 (Design system)
               │
               └── UX-04 (Acessibilidade)

D-06 (Escrita atomica) ──→ D-21 (Transacoes)
     │
     └── D-07 (Schema Zod) ──→ D-22 (Migracao schema)
          │
          └── D-13 (Estimativas reais)

D-23 (Lock concorrencia) ──→ Nenhuma dependencia (fazer CEDO)
```

### 4.2 Itens sem Dependencia (Podem Iniciar Imediatamente)

1. D-04 — Substituir CNPJ no .env.example (0.5h)
2. D-01/D-19 — Remover credenciais do repo (6h)
3. D-23 — Lock file para concorrencia (3h)
4. D-06 — Escrita atomica (3h)
5. UX-18 — Substituir emojis por icon library (3h)
6. UX-07 — Loading states (3h)
7. D-11 — readFileSync → async (2h)

---

## 5. Testes Requeridos

### 5.1 Testes para Debitos P0 (Seguranca Imediata)

| Debito | Teste Requerido | Tipo | Prioridade |
|--------|----------------|------|-----------|
| D-01/SEC-5 | Verificar que escolas-credentials.json nao existe no repo apos cleanup | Script de verificacao | P0 |
| D-01/SEC-5 | Verificar que git log nao contem o arquivo no historico | Script git | P0 |
| D-02/SEC-1 | Verificar que auth.js nao contem senhas ou hashes hardcoded | Grep automatizado | P0 |
| D-03/SEC-3 | Testar que APIs retornam 401 sem autenticacao | Teste de integracao | P0 |
| D-04 | Verificar que .env.example nao contem dados reais | Grep automatizado | P0 |

### 5.2 Testes para Debitos P1 (Integridade)

| Debito | Teste Requerido | Tipo | Prioridade |
|--------|----------------|------|-----------|
| D-06 | Simular crash durante escrita e verificar que arquivo nao corrompeu | Teste unitario | P1 |
| D-07 | Testar rejeicao de dados malformados em todos os endpoints | Teste de integracao | P1 |
| D-09 | Testar matching de itens com dados reais do SGD (pelo menos 10 casos) | Teste unitario | P1 |
| D-23 | Testar execucao simultanea de scan e verificar integridade | Teste de concorrencia | P1 |
| D-25 | Verificar que todas as operacoes geram log de auditoria | Teste de integracao | P1 |

### 5.3 Testes para Debitos P2 (Qualidade)

| Debito | Teste Requerido | Tipo | Prioridade |
|--------|----------------|------|-----------|
| UX-04 | Audit Lighthouse a11y score >= 90 em todas as paginas | Teste automatizado | P2 |
| UX-02 | Visual regression test apos unificacao de design system | Teste e2e (Playwright) | P2 |
| UX-05 | Testes unitarios para cada modulo extraido de app.js | Teste unitario | P2 |
| SYS-2 | Cobertura de testes >= 60% apos implementacao | Metricas | P2 |
| SYS-8 | CI pipeline roda testes em cada PR | Teste de integracao | P2 |

### 5.4 Estrategia de Testes Recomendada

| Camada | Ferramenta | Objetivo | Quando Implementar |
|--------|-----------|----------|-------------------|
| Unitario | Vitest | Logica de negocios, matching, validacao | Sprint 2 (junto com modularizacao) |
| Integracao | Supertest | APIs Express, endpoints Netlify | Sprint 2 (junto com auth) |
| E2E | Playwright | Fluxos criticos (login, scan, submit, pedido) | Sprint 3 (antes de modularizar) |
| Visual | Playwright screenshots | Regressao visual apos mudancas CSS | Sprint 3 (junto com design system) |
| A11y | axe-core + Lighthouse CI | WCAG AA compliance | Sprint 4 (junto com a11y) |
| Performance | Lighthouse CI | LCP, FID, CLS em cada deploy | Sprint 5 (junto com CI/CD) |

---

## 6. Consolidacao de Severidades Ajustadas

Apos revisao dos especialistas, as seguintes severidades foram ajustadas:

| ID | Severidade DRAFT | Severidade Ajustada | Quem Ajustou | Justificativa |
|----|-----------------|--------------------|--------------|----|
| D-04 | ALTO | **CRITICO** | @data-engineer | CNPJ real permite engenharia social |
| D-09 | ALTO | **CRITICO** | @data-engineer | Precos errados no SGD = irregularidade |
| D-13 | MEDIO | **ALTO** | @data-engineer | Estimativas ficticias induzem erro |
| D-19 | ALTO | **CRITICO** | @data-engineer | Violacao LGPD em dados de escolas publicas |
| UX-04 | ALTO | **CRITICO** | @ux-design-expert | Obrigacao legal (Lei 13.146/2015) |
| UX-06 | MEDIO | **ALTO** | @ux-design-expert | innerHTML sem sanitizacao consistente |

---

## 7. Veredicto Final

### **APROVADO — Seguir para Assessment Final (Fase 8)**

**Justificativa:**
1. Inventario completo — 55 debitos identificados e validados por 3 especialistas
2. Severidades calibradas — ajustes feitos pelos especialistas sao coerentes
3. Priorizacao consensual — todos concordam na ordem: Seguranca → Integridade → UX → Performance
4. Estimativas realistas — total de ~326h (nota: ha sobreposicao significativa entre DB e UX)
5. Recomendacoes concretas — Supabase, Zod, Web Components, design tokens definidos
6. Dependencias mapeadas — grafo de dependencias permite planejamento de sprints

**Ressalvas:**
- Estimativa de a11y deve ser ajustada para 32h (nao 20h) no assessment final
- Riscos R-4 (comunicacao escolas) e R-9 (propostas com precos errados) requerem atencao imediata do PM
- Pipeline CI/CD (SYS-8) deve ser detalhado no assessment final
- `git-filter-repo` recomendado em vez de `git filter-branch` para limpeza de historico

---

*Revisado por @qa (Quinn) — Brownfield Discovery Fase 7*
*Quinn, qualidade e inegociavel*
