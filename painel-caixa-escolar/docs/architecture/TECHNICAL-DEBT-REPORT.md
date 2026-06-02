# Technical Debt Report — Relatório Executivo

**Fase:** Brownfield Discovery — Fase 9
**Agente:** @analyst (Atlas)
**Data:** 2026-06-02
**Projeto:** GDP Painel Caixa Escolar

---

## TL;DR

O sistema GDP evoluiu bem desde março 2026 (migração para Supabase/Vercel), mas carrega **35 débitos técnicos** com custo estimado de **242-425 horas**. Os 4 débitos críticos são todos de **segurança** e devem ser priorizados imediatamente. O sistema está funcional para operação atual mas não está pronto para escalar (múltiplas empresas, compliance, equipe maior).

---

## Estado Atual do Sistema

| Dimensão | Score | Detalhe |
|----------|-------|---------|
| Funcionalidade | 4/5 | Atende o fluxo operacional completo |
| Segurança | 3/5 | Auth migrada, mas RLS permissivo e credenciais expostas |
| Manutenibilidade | 2/5 | Frontend monolítico, poucos testes, sem CI/CD |
| Escalabilidade | 3/5 | Supabase suporta, mas frontend não está preparado |
| Documentação | 3/5 | Brownfield discovery gerou boa base documental |

**Score Geral: 3.0/5 — Funcional mas com riscos**

---

## O Que Melhorou (desde março 2026)

| Antes | Depois | Impacto |
|-------|--------|---------|
| JSON flat files | Supabase PostgreSQL (19 migrations) | Dados seguros, multi-device, audit trail |
| Login SHA-256 client-side | Supabase Auth (JWT) | Segurança de autenticação |
| Netlify Functions | Vercel Functions | Deploy mais rápido, melhor DX |
| localStorage only | Supabase + localStorage cache + Realtime WebSocket | Sync cross-browser, offline fallback |
| Zero database | 16+ tabelas, RLS, 44+ indexes, retention policies | Base sólida para crescer |

---

## Riscos Críticos (Ação Imediata)

### 1. RLS Permissivo (TD-C1)
**O quê:** A policy `anon_full_access` com `USING(true)` permite que qualquer requisição com a anon key leia/escreva QUALQUER empresa no banco.
**Impacto:** Se houver mais de uma empresa, dados são acessíveis entre tenants.
**Solução:** Migrar para auth.uid() exclusivo + remover policies permissivas.

### 2. Credenciais de Escolas Expostas (TD-C2)
**O quê:** Login/senha das escolas estão em plaintext no banco E no arquivo `escolas-credentials.json` commitado.
**Impacto:** Qualquer pessoa com acesso ao repo tem credenciais de terceiros.
**Solução:** Hash bcrypt + remover arquivo do git history.

### 3. Certificados Digitais A1 (TD-C3)
**O quê:** PFX do certificado A1 armazenado como base64 em JSONB no banco.
**Impacto:** Comprometimento do certificado permite emissão de NF-e fraudulentas.
**Solução:** Migrar para Vault ou variáveis de ambiente.

### 4. Zero Acessibilidade (TD-C4)
**O quê:** Nenhum atributo aria-*, role, focus management em 11 páginas.
**Impacto:** Sistema para educação pública inacessível a pessoas com deficiência. Risco legal.
**Solução:** Plano progressivo de a11y (quick wins: 8-16h, completo: 24-40h).

---

## Investimento Recomendado

| Fase | Foco | Horas | ROI |
|------|------|-------|-----|
| Sprint 1 | Segurança | 30-44h | ALTO — elimina riscos críticos |
| Sprint 2 | Qualidade + DevOps | 36-64h | ALTO — CI/CD + testes previnem regressões |
| Sprint 3 | Frontend | 40-64h | MÉDIO — melhora manutenibilidade |
| Sprint 4 | Consolidação | 24-48h | MÉDIO — simplifica arquitetura |
| **Total Prioritário** | **Sprints 1-4** | **130-220h** | - |
| Backlog | Restante | 112-205h | BAIXO-MÉDIO |

**Recomendação:** Investir nos Sprints 1-2 imediatamente (66-108h). Sprints 3-4 podem ser paralelos ao desenvolvimento de features.

---

## Métricas de Saúde

| Métrica | Atual | Meta |
|---------|-------|------|
| Testes automatizados | 3 arquivos | >20 arquivos |
| Cobertura de código | ~5% | >60% |
| a11y score (Lighthouse) | ~30/100 | >80/100 |
| Deploy automatizado | Manual | CI/CD |
| Débitos críticos | 4 | 0 |
| Débitos altos | 12 | <5 |
| Tempo de deploy | ~5min manual | <2min automático |

---

## Documentos de Referência

| Documento | Localização |
|----------|-------------|
| System Architecture v2.0 | `docs/architecture/system-architecture.md` |
| Database Schema | `docs/architecture/SCHEMA.md` |
| Database Audit | `docs/architecture/DB-AUDIT.md` |
| Frontend Specification v2.0 | `docs/architecture/frontend-spec.md` |
| Technical Debt DRAFT | `docs/architecture/technical-debt-DRAFT.md` |
| Specialist Reviews + QA Gate | `docs/architecture/brownfield-reviews.md` |
| Technical Debt Assessment (final) | `docs/architecture/technical-debt-assessment.md` |
| Este relatório | `docs/architecture/TECHNICAL-DEBT-REPORT.md` |

---

*Relatório Executivo — @analyst (Atlas) — Brownfield Discovery Fase 9*
*Atlas, investigando a verdade 🔎*
