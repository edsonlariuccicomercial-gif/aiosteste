# Epic 2 — Resolucao de Debito Tecnico

**Fase:** Brownfield Discovery — Fase 10
**Agente:** @pm (Morgan)
**Data:** 2026-03-09
**Status:** Planning

---

## Objetivo

Eliminar todos os debitos tecnicos criticos e altos identificados na avaliacao Brownfield Discovery, estabelecendo uma base solida de seguranca, qualidade e manutencao para o sistema LicitIA / Painel Caixa Escolar MG.

## Escopo

- 55 debitos tecnicos identificados
- 8 criticos, 16 altos, 19 medios, 12 baixos
- Areas: Seguranca, Dados, Frontend/UX, DevOps, Performance

## Criterios de Sucesso

| Metrica | Atual | Meta |
|---------|-------|------|
| Debitos CRITICOS | 8 | 0 |
| Debitos ALTOS | 16 | <= 3 |
| Cobertura de testes | 0% | >= 60% |
| Lighthouse a11y | ~35 | >= 90 |
| Credenciais expostas | 7+ | 0 |
| Pipeline CI/CD | Nenhum | Operacional |
| Layout compartilhado | 0/7 paginas | 7/7 |

## Timeline

| Sprint | Semanas | Foco | Stories |
|--------|---------|------|---------|
| Sprint 0 | Semana 1 | Seguranca Emergencial | 2.1 |
| Sprint 1 | Semana 2-3 | Integridade de Dados | 2.2, 2.3 |
| Sprint 2 | Semana 4-5 | CI/CD + Testes + Design | 2.4, 2.5 |
| Sprint 3 | Semana 6-7 | Refatoracao Frontend | 2.6, 2.7 |
| Sprint 4 | Semana 8-9 | Auth + Acessibilidade | 2.8, 2.9 |
| Sprint 5 | Semana 10-12 | Consolidacao + Polish | 2.10, 2.11 |

## Budget

| Item | Horas | Custo (R$ 150/h) |
|------|-------|------------------|
| Desenvolvimento | 280h | R$ 42.000 |
| Revisao/QA | 40h | R$ 6.000 |
| Contingencia (15%) | 48h | R$ 7.200 |
| **Total** | **368h** | **R$ 55.200** |

## Lista de Stories

| ID | Titulo | Prioridade | Horas | Sprint |
|----|--------|-----------|-------|--------|
| 2.1 | Remocao de Credenciais e Dados Sensiveis | P0 | 10.5h | 0 |
| 2.2 | Protecao de APIs e Autenticacao Backend | P1 | 16h | 1 |
| 2.3 | Integridade de Dados e Validacao Schema | P1 | 21h | 1 |
| 2.4 | Pipeline CI/CD com GitHub Actions | P2 | 12h | 2 |
| 2.5 | Testes Automatizados (Vitest + Playwright) | P2 | 32h | 2 |
| 2.6 | Design System Unificado | P2 | 20h | 3 |
| 2.7 | Modularizacao Frontend (app.js + Layout) | P2 | 52h | 3 |
| 2.8 | Autenticacao Segura com Supabase | P2 | 24h | 4 |
| 2.9 | Acessibilidade WCAG 2.1 AA | P2 | 32h | 4 |
| 2.10 | Consolidacao de Dados e Performance | P3 | 38h | 5 |
| 2.11 | Polish e Melhorias de UX | P4 | 42h | 5 |

## Dependencias Externas

1. **Conta Supabase** — necessaria para stories 2.8 e 2.10
2. **Comunicacao com escolas** — necessaria antes de story 2.1 (rotacao credenciais)
3. **Acesso ao CatalogoMobile** — necessario para ARP dinamica (story 2.10)

## Riscos do Epic

| Risco | Mitigacao |
|-------|-----------|
| Timeline apertada para 1 dev | Priorizar P0+P1 (semana 1-3), P2 seletivo |
| Migracao auth quebra fluxos | Feature flag, rollout gradual |
| Modularizacao causa regressoes | Testes e2e ANTES de modularizar |
| Escolas perdem acesso | Comunicar 7 dias antes, canal seguro |

---

## Documentos de Referencia

- `docs/prd/technical-debt-assessment.md` — Assessment final
- `docs/reports/TECHNICAL-DEBT-REPORT.md` — Relatorio executivo
- `docs/reviews/db-specialist-review.md` — Validacao DB
- `docs/reviews/ux-specialist-review.md` — Validacao UX
- `docs/reviews/qa-review.md` — Revisao QA

---

*Criado por @pm (Morgan) — Brownfield Discovery Fase 10*
*Morgan, entregando valor com clareza*
