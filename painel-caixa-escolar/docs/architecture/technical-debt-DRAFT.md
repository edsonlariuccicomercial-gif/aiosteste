# Technical Debt Assessment — DRAFT

**Fase:** Brownfield Discovery — Fase 4 (Consolidação)
**Agente:** @architect (Aria)
**Data:** 2026-06-02
**Status:** DRAFT — aguarda review especialistas (Fases 5-7)

---

## 1. Resumo Executivo

O sistema GDP (Painel Caixa Escolar) evoluiu significativamente desde o assessment inicial (março 2026). A migração de JSON flat files → Supabase e de Netlify → Vercel resolveu vários débitos críticos originais. No entanto, novos débitos surgiram da evolução rápida e outros débitos históricos permanecem.

### Score Geral

| Área | Score (1-5) | Tendência |
|------|-------------|-----------|
| Segurança | 3.0 | ↑ Melhorou (auth migrada) |
| Arquitetura Backend | 3.5 | ↑ Melhorou (Supabase + Vercel) |
| Arquitetura Frontend | 2.0 | → Estável (mesmo desde v1) |
| Database | 3.5 | ↑ Boa (RLS, audit, retention) |
| Qualidade de Código | 2.0 | → Estável (poucos testes) |
| DevOps | 2.0 | → Sem CI/CD |
| Acessibilidade | 1.0 | → Zero a11y |
| Documentação | 3.0 | ↑ Melhorou (brownfield docs) |

**Score Médio:** 2.5/5 — **Funcional mas com riscos operacionais**

---

## 2. Débitos Consolidados por Severidade

### 2.1 CRÍTICOS (Bloqueiam escala ou apresentam risco imediato)

| ID | Débito | Área | Origem | Ação Recomendada | Esforço |
|----|--------|------|--------|-----------------|---------|
| TD-C1 | RLS permissivo (anon full access) — qualquer requisição pode ler/escrever qualquer empresa | Segurança/DB | DB-C1 | Migrar para auth.uid() exclusivo, remover policies anon_full_access | 16-24h |
| TD-C2 | Credenciais de escolas (login/senha) em plaintext no banco e no repo (escolas-credentials.json) | Segurança | SEC-1, DB-C2 | Hash bcrypt + remover arquivo do repo | 4-8h |
| TD-C3 | Certificados A1 (PFX) armazenados como base64 em config_fiscal JSONB | Segurança | SEC-3 | Migrar para Supabase Vault ou env vars | 8-12h |
| TD-C4 | Zero acessibilidade (a11y) — nenhum aria-*, role, focus management | Frontend | UX-04 | Plano de a11y progressivo (quick wins primeiro) | 24-40h |

### 2.2 ALTOS (Impactam qualidade ou manutenção significativamente)

| ID | Débito | Área | Origem | Ação Recomendada | Esforço |
|----|--------|------|--------|-----------------|---------|
| TD-A1 | app.js monolito (~2500 linhas) | Frontend | SYS-1, UX-05 | Modularizar em ES modules | 16-24h |
| TD-A2 | HTML com lógica inline (gdp-contratos 79KB, 200-400 linhas CSS por página) | Frontend | SYS-2, UX-03 | Extrair CSS compartilhado, layout unificado | 16-24h |
| TD-A3 | Apenas 3 test files (cors, health, nf-counter) | Qualidade | SYS-3 | Adicionar testes para módulos críticos (gdp-api, auth, sync) | 24-40h |
| TD-A4 | Sem CI/CD pipeline — deploy manual via `npx vercel --prod` | DevOps | SYS-8 | GitHub Actions: lint, test, deploy automático | 8-16h |
| TD-A5 | APIs serverless sem auth middleware (dependem apenas de RLS) | Segurança | SEC-2 | Adicionar verificação de JWT nas functions | 4-8h |
| TD-A6 | Dois design systems incompatíveis (verde/escuro vs azul/slate) | Frontend | UX-02 | Unificar design tokens em arquivo compartilhado | 16-24h |
| TD-A7 | Três estratégias RLS coexistindo (006, 007, 009) | DB | DB-A4 | Consolidar em auth.uid() exclusivo | 8-16h |
| TD-A8 | TypeScript definitions (database.ts) desatualizadas — faltam colunas de 015/016/018 | Qualidade | DB-A2 | Regenerar database.ts a partir do schema atual | 2-4h |
| TD-A9 | Extratos/conciliacoes sem audit_trigger | DB | DB-A3 | Adicionar trigger como nas outras tabelas | 2-4h |
| TD-A10 | Duas sync layers sobrepostas (gdp-api.js + app-sync.js) | Arquitetura | SYS-10 | Deprecar app-sync.js, consolidar em gdp-api.js | 8-16h |

### 2.3 MÉDIOS (Impactam developer experience ou manutenção)

| ID | Débito | Área | Origem | Ação Recomendada | Esforço |
|----|--------|------|--------|-----------------|---------|
| TD-M1 | Módulos JS duplos (IIFE window.* + CommonJS em server-lib) | Arquitetura | SYS-4 | Padronizar em ES modules | 8-16h |
| TD-M2 | Sem error handling padronizado nas APIs serverless | Backend | SYS-5 | Middleware de error handling + formato padrão | 4-8h |
| TD-M3 | Sem logging estruturado (apenas console.log/warn) | Ops | SYS-6 | Implementar logger com níveis + Vercel Logs | 4-8h |
| TD-M4 | innerHTML para renderização — risco de XSS | Frontend | UX-06 | Usar DOM API ou textContent | 8-16h |
| TD-M5 | Sem rate limiting nas APIs serverless | Segurança | SEC-5 | Adicionar rate limit por IP | 4-8h |
| TD-M6 | Sem CSP headers configurados | Segurança | SEC-6 | Adicionar Content-Security-Policy no vercel.json | 2-4h |
| TD-M7 | empresa_id default 'LARIUCCI' hardcoded em extratos/conciliacoes | DB | DB-M3 | Remover default, exigir empresa_id explícito | 2-4h |
| TD-M8 | conciliacoes.extrato_id não é FK formal | DB | DB-A1 | Adicionar constraint FK | 1-2h |
| TD-M9 | Sem paginação em tabelas frontend (renderiza todos os registros) | Frontend | UX-11 | Implementar paginação virtual | 8-16h |
| TD-M10 | Credenciais SGD em localStorage plaintext | Segurança | UX-13 | Mover para sessão server-side | 4-8h |

### 2.4 BAIXOS (Melhorias de qualidade de vida)

| ID | Débito | Área | Origem | Esforço |
|----|--------|------|--------|---------|
| TD-B1 | Dependências CDN sem lock de versão (SheetJS) | Frontend | SYS-7 | 2-4h |
| TD-B2 | Express server legado coexiste com Vercel | Arquitetura | SYS-9 | 4-8h |
| TD-B3 | Legacy Netlify functions em _archive/ | Cleanup | SYS-12 | 1-2h |
| TD-B4 | PWA entregador incompleta (manifest/icons ausentes) | Frontend | UX-09 | 4-8h |
| TD-B5 | Comentários SQL parciais | DB | DB-B1 | 2-4h |
| TD-B6 | ALL_MIGRATIONS consolidado redundante | DB | DB-B3 | 1h |
| TD-B7 | Sem animações de transição entre abas | UX | UX-15 | 2-4h |

---

## 3. Débitos Resolvidos (desde assessment v1.0 — março 2026)

| ID Original | Débito | Resolução | Data |
|-------------|--------|-----------|------|
| SEC-1 (antigo) | Login client-side SHA-256 hardcoded | Migrado para Supabase Auth (JWT) | ~abril 2026 |
| SYS-4 (antigo) | JSON flat files sem validação | Migrado para Supabase PostgreSQL + CHECK constraints | ~abril 2026 |
| UX-01 | Auth insegura client-side | Supabase GoTrue implementado | ~abril 2026 |
| UX-12 (parcial) | localStorage como único armazenamento | Supabase é source-of-truth, localStorage é cache | ~abril 2026 |
| Deploy | Netlify Functions | Migrado para Vercel Functions | ~abril 2026 |
| Data Layer | JSON flat files | Migrado para Supabase PostgreSQL (19 migrations) | abril-junho 2026 |

---

## 4. Análise de Risco

### 4.1 Riscos de Segurança

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Acesso não autorizado via anon key (RLS permissivo) | ALTA | ALTO | TD-C1: Migrar RLS |
| Vazamento de credenciais de escolas | MÉDIA | ALTO | TD-C2: Hash + remover do repo |
| Comprometimento de certificado A1 | BAIXA | CRÍTICO | TD-C3: Vault/env vars |
| XSS via innerHTML | BAIXA | MÉDIO | TD-M4: DOM API |

### 4.2 Riscos Operacionais

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Deploy quebrado sem CI/CD | MÉDIA | ALTO | TD-A4: GitHub Actions |
| Bug em produção sem testes | ALTA | MÉDIO | TD-A3: Testes automatizados |
| Inconsistência de sync entre layers | MÉDIA | MÉDIO | TD-A10: Consolidar sync |
| Perda de audit trail (extratos/concil.) | BAIXA | MÉDIO | TD-A9: Adicionar trigger |

### 4.3 Riscos de Manutenção

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Refatoração impossível em app.js monolito | ALTA | ALTO | TD-A1: Modularizar |
| CSS inconsistente entre páginas | ALTA | MÉDIO | TD-A6: Design tokens |
| Onboarding lento para novos devs | ALTA | MÉDIO | Documentação (este brownfield) |

---

## 5. Estimativa de Esforço Total

| Severidade | Qtd | Horas (min-max) |
|-----------|-----|-----------------|
| CRÍTICOS | 4 | 52-84h |
| ALTOS | 10 | 105-176h |
| MÉDIOS | 10 | 45-94h |
| BAIXOS | 7 | 16-35h |
| **TOTAL** | **31** | **218-389h** |

### 5.1 Plano de Priorização Sugerido

**Sprint 1 (Segurança):** TD-C1, TD-C2, TD-A5, TD-M6 → ~30-44h
**Sprint 2 (Qualidade):** TD-A3, TD-A4, TD-A8, TD-A9 → ~36-64h
**Sprint 3 (Frontend):** TD-A1, TD-A6, TD-C4 (quick wins) → ~40-64h
**Sprint 4 (Consolidação):** TD-A7, TD-A10, TD-M1 → ~24-48h
**Backlog:** Restantes → ~88-169h

---

## 6. Próximos Passos

- [ ] **Fase 5:** Review @data-engineer → `db-specialist-review.md`
- [ ] **Fase 6:** Review @ux-design-expert → `ux-specialist-review.md`
- [ ] **Fase 7:** QA Gate @qa → `qa-review.md` (APPROVED | NEEDS WORK)
- [ ] **Fase 8:** Assessment final → `technical-debt-assessment.md`
- [ ] **Fase 9:** Relatório executivo → `TECHNICAL-DEBT-REPORT.md`
- [ ] **Fase 10:** Epic + Stories → pronto para desenvolvimento

---

*DRAFT — Gerado por @architect (Aria) — Brownfield Discovery Fase 4*
*Aguarda validação das Fases 5-7 antes de finalização*
