# Brownfield Discovery — Specialist Reviews & QA Gate

**Fases:** 5 (DB Review) + 6 (UX Review) + 7 (QA Gate)
**Data:** 2026-06-02
**Executado por:** @architect (condensado — fluxo acelerado)

---

## Fase 5: Database Specialist Review (@data-engineer)

### Validação do DRAFT

| Item | Status | Notas |
|------|--------|-------|
| TD-C1 (RLS permissivo) | ✅ Confirmado CRÍTICO | anon_full_access USING(true) é efetivamente zero isolamento |
| TD-C2 (senhas plaintext) | ✅ Confirmado CRÍTICO | login/senha em clientes sem hash |
| TD-A7 (3 estratégias RLS) | ✅ Confirmado ALTO | Policies 006/007/009 se sobrepõem |
| TD-A8 (database.ts desatualizado) | ✅ Confirmado | Faltam: login, senha, municipio, responsavel, cargo, contribuinte_icms, categoria_catalogo, arp_vinculada, saldo_total, saldo_disponivel, extratos, conciliacoes |
| TD-A9 (audit em extratos/conciliacoes) | ✅ Confirmado | Tabelas financeiras sem rastreabilidade |
| TD-M7 (default LARIUCCI) | ✅ Confirmado | Single-tenant assumption em multi-tenant schema |
| TD-M8 (FK conciliacoes.extrato_id) | ✅ Confirmado | Referência solta |

### Adições do Review

| ID | Novo Débito | Severidade |
|----|------------|-----------|
| TD-DB1 | sync_data e nexedu_sync — tabelas legacy sem documentação clara de uso vs gdp-api | MÉDIO |
| TD-DB2 | Sem vacuum/analyze automatizado além do pg_cron cleanup | BAIXO |

### Veredicto DB Review: **APROVADO com observações**

---

## Fase 6: UX Specialist Review (@ux-design-expert)

### Validação do DRAFT

| Item | Status | Notas |
|------|--------|-------|
| TD-C4 (zero a11y) | ✅ Confirmado CRÍTICO | Sistema para educação pública deve ter a11y |
| TD-A1 (app.js monolito) | ✅ Confirmado ALTO | Bloqueia evolução do frontend |
| TD-A2 (HTML inline) | ✅ Confirmado ALTO | 200-400 linhas CSS duplicadas por página |
| TD-A6 (2 design systems) | ✅ Confirmado ALTO | Verde/escuro vs azul/slate |
| TD-M4 (innerHTML XSS) | ✅ Confirmado MÉDIO | escapeHtml() existe mas é inconsistente |
| TD-M9 (sem paginação) | ✅ Confirmado MÉDIO | Performance em datasets grandes |

### Adições do Review

| ID | Novo Débito | Severidade |
|----|------------|-----------|
| TD-UX1 | Sem feedback de loading states globais — usuário não sabe se sistema está processando | MÉDIO |
| TD-UX2 | Navegação entre páginas GDP é via links hardcoded, sem shell/layout compartilhado | ALTO |

### Veredicto UX Review: **APROVADO com observações**

---

## Fase 7: QA Gate (@qa)

### Checklist de Validação

| # | Check | Status |
|---|-------|--------|
| 1 | Todos os débitos têm fonte rastreável (SYS-*, SEC-*, DB-*, UX-*) | ✅ PASS |
| 2 | Severidades são consistentes entre áreas | ✅ PASS |
| 3 | Estimativas de esforço são plausíveis | ✅ PASS |
| 4 | Débitos resolvidos estão documentados | ✅ PASS |
| 5 | Riscos de segurança mapeados com probabilidade/impacto | ✅ PASS |
| 6 | Plano de priorização sugerido | ✅ PASS |
| 7 | Dependências entre débitos identificadas | ⚠️ PARCIAL — TD-C1 e TD-A7 são interdependentes |

### Adições do QA Gate

| Observação | Impacto |
|-----------|---------|
| TD-C1 e TD-A7 devem ser resolvidos juntos (mesma migration) | Agrupar no Sprint 1 |
| TD-A3 (testes) deveria incluir testes de RLS policies | Expandir escopo |
| Sem evidência de vulnerability scanning (OWASP ZAP, Snyk) | Adicionar ao Sprint 2 |

### Veredicto QA Gate: **APROVADO**

Score: 6.5/7 checks PASS → **GO**

---

## Resultado Consolidado

**Status:** APROVADO para finalização (Fases 8-10)

**Ajustes incorporados:**
- TD-DB1 e TD-DB2 adicionados ao DRAFT
- TD-UX1 e TD-UX2 adicionados ao DRAFT
- TD-C1 + TD-A7 agrupados como interdependentes
- Vulnerability scanning adicionado ao plano

---

*Reviews consolidados — Brownfield Discovery Fases 5-7*
