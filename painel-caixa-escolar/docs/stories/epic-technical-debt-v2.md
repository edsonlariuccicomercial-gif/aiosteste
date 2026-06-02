# Epic: Remediação de Débitos Técnicos v2.0

**Epic ID:** 5
**Origem:** Brownfield Discovery v2.0 (2026-06-02)
**PM:** @pm (Morgan)
**Status:** Draft
**Prioridade:** Alta
**Esforço Total Estimado:** 130-220h (Sprints 1-4 prioritários)

---

## Objetivo

Remediar os 35 débitos técnicos identificados no Brownfield Discovery v2.0, priorizando segurança (4 críticos) e qualidade (CI/CD + testes), para preparar o GDP para escalar com múltiplas empresas e equipe maior.

## Contexto

O sistema GDP evoluiu de JSON flat files para Supabase/Vercel (mar-jun 2026), resolvendo débitos da v1. Porém, a evolução rápida introduziu novos débitos e deixou pendências históricas, especialmente em segurança (RLS permissivo), frontend (monolito, zero a11y) e qualidade (3 testes apenas).

## Success Metrics

| Métrica | Atual | Meta |
|---------|-------|------|
| Débitos críticos | 4 | 0 |
| Débitos altos | 12 | <5 |
| Testes automatizados | 3 files | >20 files |
| a11y score (Lighthouse) | ~30 | >80 |
| CI/CD | Manual | Automático |

---

## Stories (4 Sprints)

### Sprint 1: Segurança (30-44h)

| Story | Título | Débitos | Horas | Agente |
|-------|--------|---------|-------|--------|
| 5.1 | Migrar RLS para auth.uid() exclusivo | TD-C1, TD-A7 | 20-32h | @data-engineer |
| 5.2 | Hash senhas de escolas + remover credentials do repo | TD-C2 | 4-8h | @dev |
| 5.3 | Auth middleware nas Vercel Functions | TD-A5 | 4-8h | @dev |
| 5.4 | Adicionar CSP headers | TD-M6 | 2-4h | @dev |

### Sprint 2: Qualidade & DevOps (36-64h)

| Story | Título | Débitos | Horas | Agente |
|-------|--------|---------|-------|--------|
| 5.5 | Testes automatizados para módulos críticos | TD-A3 | 24-40h | @qa + @dev |
| 5.6 | CI/CD pipeline com GitHub Actions | TD-A4 | 8-16h | @devops |
| 5.7 | Atualizar database.ts com schema atual | TD-A8 | 2-4h | @data-engineer |
| 5.8 | Adicionar audit trigger em extratos/conciliacoes | TD-A9 | 2-4h | @data-engineer |

### Sprint 3: Frontend (40-64h)

| Story | Título | Débitos | Horas | Agente |
|-------|--------|---------|-------|--------|
| 5.9 | Modularizar app.js em ES modules | TD-A1 | 16-24h | @dev |
| 5.10 | Unificar design tokens entre páginas | TD-A6 | 16-24h | @ux-design-expert + @dev |
| 5.11 | Acessibilidade quick wins (aria, roles, focus) | TD-C4 | 8-16h | @dev |

### Sprint 4: Consolidação (24-48h)

| Story | Título | Débitos | Horas | Agente |
|-------|--------|---------|-------|--------|
| 5.12 | Consolidar sync layers (deprecar app-sync) | TD-A10 | 8-16h | @dev |
| 5.13 | Padronizar módulos JS (ES modules) | TD-M1 | 8-16h | @dev |
| 5.14 | Layout/navegação compartilhada entre páginas GDP | TD-UX2 | 8-16h | @dev + @ux-design-expert |

---

## Dependências

| Story | Depende de |
|-------|-----------|
| 5.3 | 5.1 (RLS migrado antes de auth middleware) |
| 5.5 | 5.1 (testes de RLS requerem policies novas) |
| 5.9 | 5.12 (consolidar sync antes de modularizar) |

## Riscos

| Risco | Mitigação |
|-------|-----------|
| Migração RLS pode quebrar frontend existente | Testes de integração antes + rollback plan |
| Modularização app.js pode introduzir regressões | Testes e2e com Playwright antes de refatorar |
| CI/CD sem testes existentes tem pouco valor | Story 5.5 (testes) antes de 5.6 (CI/CD) |

## Referências

- `docs/architecture/technical-debt-assessment.md`
- `docs/architecture/TECHNICAL-DEBT-REPORT.md`
- `docs/architecture/system-architecture.md` (v2.0)
- `docs/architecture/SCHEMA.md`
- `docs/architecture/DB-AUDIT.md`
- `docs/architecture/frontend-spec.md` (v2.0)
- `docs/architecture/brownfield-reviews.md`

---

*Epic criado por @pm (Morgan) — Brownfield Discovery Fase 10*
*Morgan, planejando o futuro 📊*
