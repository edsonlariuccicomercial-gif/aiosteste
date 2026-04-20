# Epic 7 — Modernizacao e Remediacao de Divida Tecnica

**Projeto:** Painel Caixa Escolar (GDP / Licit-AIX)
**Data de Criacao:** 2026-04-20
**Autor:** @pm (Morgan) — Brownfield Discovery Phase 10
**Status:** Ready
**Prioridade:** P0 (Sprint 0 e BLOQUEANTE)

---

## Objetivo

Remediar a divida tecnica acumulada no sistema Painel Caixa Escolar, priorizando a eliminacao de vulnerabilidades criticas de seguranca, protecao de dados fiscais obrigatorios e correcao de defeitos que causam impacto financeiro direto (rejeicao SEFAZ, multas). O sistema esta operacional e gerando valor, porem apresenta vetores de ataque que permitem acesso nao autorizado a **todos os dados de todas as empresas** sem qualquer barreira real.

### Por que esta Epic existe

1. **Seguranca:** Qualquer pessoa com a URL e DevTools acessa todos os dados (contratos, precos, certificados digitais, NF-e) de todas as empresas cadastradas
2. **Risco Fiscal:** Race condition no contador de NF-e produzira notas duplicadas inevitavelmente com uso concorrente — rejeicao SEFAZ + multa
3. **Compliance Legal:** Dados fiscais com guarda obrigatoria de 5 anos (Art. 174 CTN) em servico gratuito sem backup externo
4. **Exposicao Financeira Total:** R$ 215-570K em perdas potenciais se nada for feito

### Criterio de Entrada

- Sprint 0 e NON-NEGOTIABLE — nenhuma feature nova deve ser desenvolvida antes de sua conclusao
- Technical Debt Assessment FINAL aprovado pelo QA Gate (Phase 7) em 2026-04-20

---

## Escopo

| Sprint | Foco | Severidade | Status |
|--------|------|:----------:|--------|
| Sprint 0 | Seguranca + Backup | CRITICAL (bloqueante) | Ready |
| Sprint 1 | Fundacao Arquitetural | HIGH | Backlog |
| Sprint 2 | Qualidade e Manutencao | MEDIUM | Backlog |
| Sprint 3+ | Evolucao e Modernizacao | LOW | Backlog |

---

## Stories

### Sprint 0 — Seguranca (BLOQUEANTE)

**Duracao estimada:** 2-3 semanas
**Criterio de saida:** Nenhuma operacao CRUD possivel sem sessao autenticada; RLS ativo em todas as tabelas; race condition de NF eliminada; backup diario operando; chaves removidas do frontend.

- [ ] Story 7.1: Implementar RLS em todas as tabelas (TD-002)
- [ ] Story 7.2: Corrigir autenticacao — migrar para server-side (TD-001, TD-003)
- [ ] Story 7.3: Corrigir race condition NF-e com funcao atomica (TD-017, TD-028)
- [ ] Story 7.4: Implementar backup/DR para dados fiscais (TD-045)
- [ ] Story 7.5: Remover chaves expostas do frontend (TD-003, TD-005)

### Sprint 1 — Fundacao

**Duracao estimada:** 3-4 semanas

- [ ] Story 7.6: Configurar CORS restritivo (TD-004)
- [ ] Story 7.7: Configurar framework de testes — Vitest (TD-029)
- [ ] Story 7.8: Implementar monitoramento de APIs externas — SGD health check (TD-044)
- [ ] Story 7.9: Adicionar monitoramento de erros — Sentry (TD-039)
- [ ] Story 7.10: Alerta de expiracao de certificado digital (TD-040)
- [ ] Story 7.11: NOT NULL em colunas financeiras + indices (TD-018, TD-019)
- [ ] Story 7.12: Corrigir trigger set_updated_at() (TD-023)
- [ ] Story 7.13: Alterar data_apuracao para DATE (TD-022)

### Sprint 2 — Qualidade

**Duracao estimada:** 3-4 semanas

- [ ] Story 7.14: Extrair CSS compartilhado — design tokens (TD-030, TD-031)
- [ ] Story 7.15: Adicionar testes unitarios em funcoes criticas — cobertura 20% (TD-029)
- [ ] Story 7.16: Configurar CI/CD basico — GitHub Actions (TD-038)
- [ ] Story 7.17: Documentar API com JSDoc (TD-042)
- [ ] Story 7.18: Normalizar campos JSONB criticos + CHECK constraints (TD-020)
- [ ] Story 7.19: Implementar politica de retencao snapshots/audit (TD-025)

### Sprint 3+ — Evolucao

**Duracao estimada:** Ongoing

- [ ] Story 7.20: Introduzir build system — Vite (TD-010)
- [ ] Story 7.21: Consolidar raizes de deploy (TD-009, TD-011)
- [ ] Story 7.22: Migrar estado critico de localStorage para Supabase-first (TD-012)
- [ ] Story 7.23: Iniciar migracao para TypeScript (TD-043)
- [ ] Story 7.24: Implementar acessibilidade basica — ARIA (TD-033)
- [ ] Story 7.25: Extrair componentes reutilizaveis — Web Components (TD-008, TD-034)
- [ ] Story 7.26: Introduzir rendering library — Preact + HTM (TD-032)

---

## Criterios de Sucesso

| Metrica | Atual | Alvo Sprint 0 | Alvo Sprint 2 |
|---------|:-----:|:-------------:|:-------------:|
| RLS Coverage | 15% (2/13) | 100% (13/13) | 100% |
| Vulnerabilidades CRITICAL | 5 | 0 | 0 |
| Vulnerabilidades HIGH | 17 | 12 | 5 |
| Cobertura de Testes | 0% | 0% | 20% |
| Backup RPO | Inexistente | 24h | 24h |
| FCP (3G simulado) | 8-10s | 5-7s | 3-4s |
| Score de Seguranca | 2/10 | 7/10 | 8/10 |

---

## Dependencias

### Bloqueia

- Qualquer nova feature de grande porte (Sprint 0 e pre-requisito)
- Onboarding de novos fornecedores (multi-tenancy depende de RLS + auth real)
- Migracao para plano pago (precisa de seguranca resolvida primeiro)

### Bloqueado por

- Nenhuma dependencia externa — pode iniciar imediatamente
- Decisao de stakeholder: autorizar pausa de features por 2-3 semanas

### Dependencias entre stories (Sprint 0)

```
Story 7.1 (RLS) ──┐
                   ├──> Story 7.2 (Auth server-side) ──> Story 7.5 (Remover chaves)
Story 7.3 (NF-e)  │    (independente)
Story 7.4 (Backup)│    (independente)
```

- **7.1** pode ser executada em paralelo com 7.3 e 7.4
- **7.2** depende de 7.1 (RLS precisa estar ativo antes de mudar auth)
- **7.5** depende de 7.2 (so pode remover anon key apos auth funcionar)
- **7.3** e **7.4** sao independentes de todas as demais

---

## Referencias

| Documento | Localizacao |
|-----------|-------------|
| Technical Debt Assessment (FINAL) | `docs/architecture/technical-debt-assessment.md` |
| Relatorio Executivo | `docs/architecture/TECHNICAL-DEBT-REPORT.md` |
| DB Specialist Review (Scripts SQL) | `docs/architecture/db-specialist-review.md` |
| UX Specialist Review | `docs/architecture/ux-specialist-review.md` |
| QA Gate Review | `docs/architecture/qa-review.md` |
| System Architecture | `docs/architecture/system-architecture.md` |

---

*Epic criado por @pm (Morgan) — Brownfield Discovery Phase 10*
*Base: 45 debitos catalogados, 5 CRITICAL, 17 HIGH, 14 MEDIUM, 9 LOW*
