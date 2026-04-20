# Relatorio Executivo — Divida Tecnica

**Projeto:** Painel Caixa Escolar (GDP / Licit-AIX)
**Data:** 2026-04-20
**Autor:** @analyst (Alex) — Brownfield Discovery Phase 9

---

## 1. Sumario Executivo

O sistema esta **operacional e gerando valor**, porem apresenta vulnerabilidades criticas de seguranca que permitem acesso nao autorizado a dados fiscais e comerciais de todas as empresas cadastradas. Nao existe autenticacao real no servidor, backup de dados fiscais obrigatorios, nem testes automatizados. O risco imediato e vazamento de dados para concorrentes e multas fiscais por NF-e duplicada. A correcao dos itens criticos exige **2-3 semanas de trabalho focado** antes de qualquer nova funcionalidade.

---

## 2. Score de Saude

| Area | Nota | Observacao |
|------|:----:|-----------|
| Seguranca | 2/10 | Sem autenticacao real; dados expostos publicamente |
| Arquitetura | 4/10 | Monolito funcional mas impossivel de escalar |
| Banco de Dados | 5/10 | Schema razoavel, mas sem protecoes e com race conditions |
| Frontend | 4/10 | Entrega valor, mas sem testes e sem modularidade |
| Infraestrutura | 3/10 | Free tier em producao com dados fiscais legais |
| Testes | 1/10 | Zero cobertura automatizada |
| **TOTAL** | **19/60** | Risco operacional alto |

---

## 3. Top 5 Riscos

| # | Risco | Consequencia |
|---|-------|-------------|
| 1 | **Dados de todas as empresas acessiveis sem senha** — qualquer pessoa com a URL pode ler contratos, precos e notas fiscais | Perda de vantagem competitiva em licitacoes; vazamento de dados comerciais sigilosos |
| 2 | **NF-e duplicada por falha tecnica** — duas pessoas emitindo ao mesmo tempo geram o mesmo numero | Rejeicao pela SEFAZ, multa fiscal, impossibilidade de faturar ate correcao manual |
| 3 | **Sem backup de dados fiscais** — dados obrigatorios por 5 anos armazenados em servico gratuito sem garantia | Perda irreversivel em caso de falha; descumprimento do Art. 174 do CTN |
| 4 | **Dependencia de API governamental (SGD) sem contrato** — se o governo mudar a API, o sistema para | Impossibilidade de participar de licitacoes ate reengenharia do modulo |
| 5 | **Zero testes automatizados + 1 unico desenvolvedor** — qualquer mudanca pode quebrar o sistema sem aviso | Regressoes silenciosas; projeto inviavel se desenvolvedor ficar indisponivel |

---

## 4. Impacto Financeiro

| Cenario | Perda Estimada |
|---------|---------------|
| Vazamento de dados para concorrentes | R$ 50-200K/ano em contratos perdidos |
| NF-e rejeitada + multa SEFAZ | R$ 5-20K por incidente |
| Sistema fora do ar por limite do plano gratuito | R$ 10-50K em licitacoes perdidas |
| Reescrita emergencial (se nada for feito em 12 meses) | R$ 150-300K |
| **Exposicao total acumulada** | **R$ 215-570K** |

---

## 5. Roadmap de Correcao

| Periodo | Sprint | Foco | Status |
|---------|--------|------|--------|
| Semana 1-2 | Sprint 0 | **Seguranca** — autenticacao real, protecao do banco, backup fiscal | BLOQUEANTE |
| Semana 3-4 | Sprint 1 | **Fundacao** — build system, consolidar deploys, monitoramento | Prioritario |
| Semana 5-8 | Sprint 2 | **Qualidade** — testes, CI/CD, design unificado, modularizacao | Importante |
| Semana 9+ | Sprint 3 | **Evolucao** — TypeScript, acessibilidade, multi-tenant | Desejavel |

**Sprint 0 e NON-NEGOTIABLE.** Nenhuma feature nova deve ser desenvolvida antes de sua conclusao.

---

## 6. Decisao Necessaria

O stakeholder precisa decidir **agora**:

| Decisao | Opcoes |
|---------|--------|
| Autorizar pausa de features por 2-3 semanas para Sprint 0? | SIM (recomendado) / NAO (aceita risco) |
| Migrar para plano pago (Vercel Pro + Supabase Pro)? | ~US$ 45/mes vs risco de indisponibilidade |
| Alocar segundo desenvolvedor para reduzir bus factor? | Investimento em continuidade do projeto |

---

## 7. Recomendacao

**Executar imediatamente o Sprint 0 (seguranca + backup).** O sistema funciona e gera valor hoje, mas esta a uma inspecao de browser de distancia de um vazamento total de dados. O custo de correcao agora (2-3 semanas) e 50-100x menor que o custo de um incidente ou reescrita futura.

---

*Documento gerado por @analyst (Alex) — Brownfield Discovery Phase 9*
*Base: 45 debitos catalogados (4 CRITICAL, 18 HIGH, 12 MEDIUM, 9 LOW) + 2 gaps adicionais da QA*
*Proximo passo: @pm (Phase 10) — Criar Epic + stories para execucao do roadmap*
