# QA Gate Review — Brownfield Discovery Phase 7

**Projeto:** Painel Caixa Escolar (GDP / LicitIA MG / Licit-AIX)
**Data:** 2026-04-20
**Revisor:** @qa (Quinn)
**Fase:** Brownfield Discovery - Phase 7 (QA Gate)
**Documentos revisados:**
- `system-architecture.md` (Phase 1 - @architect)
- `SCHEMA.md` (Phase 2 - @data-engineer)
- `DB-AUDIT.md` (Phase 2 - @data-engineer)
- `frontend-spec.md` (Phase 3 - @ux-design-expert)
- `technical-debt-DRAFT.md` (Phase 4 - @architect)
- `db-specialist-review.md` (Phase 5 - @data-engineer)
- `ux-specialist-review.md` (Phase 6 - @ux-design-expert)

---

## 1. Resumo da Revisao

O processo de Brownfield Discovery foi conduzido com **rigor e profundidade adequados**. Os 7 documentos produzidos cobrem de forma abrangente as camadas do sistema (frontend, backend, banco de dados, infraestrutura, seguranca) e apresentam uma visao coerente e complementar da divida tecnica existente.

A @architect (Phase 1 e 4) produziu uma base solida com 43 debitos catalogados, severidades justificadas e plano de remediacao em sprints. Os especialistas (Phase 5 e 6) complementaram com **ajustes de severidade fundamentados** e **riscos adicionais nao mapeados** que enriquecem significativamente o assessment final.

**Qualidade geral do processo:** 4.0/5

**Pontos fortes:**
- Cobertura exaustiva do sistema (10 secoes na arquitetura, 13 tabelas documentadas, 10+ paginas HTML analisadas)
- Evidencias concretas com referencias a linhas de codigo, nomes de arquivos e migrations
- Plano de remediacao acionavel com scripts SQL prontos para execucao
- Especialistas forneceram discordancias justificadas e construtivas
- Quick wins identificados com ROI claro

**Pontos de atencao:**
- Algumas inconsistencias numericas entre documentos (detalhadas na secao 3)
- Ausencia de validacao de um aspecto critico nao coberto (detalhado na secao 4)
- Discordancias de severidade entre especialistas ainda nao consolidadas formalmente

---

## 2. Checklist de Validacao

| # | Criterio | Nota (1-5) | Justificativa |
|---|----------|:----------:|---------------|
| 1 | **Completude** | 4 | Todas as 6 areas obrigatorias estao cobertas (Frontend, Backend, Database, Infrastructure, Security, Testing). O aspecto de **Testing** e o mais superficial — apenas TD-029 e TD-038 cobrem a ausencia total de testes, sem analise de qual estrategia de teste seria viavel para o contexto. Falta analise de **dependencias externas** (SGD, SEFAZ) e seus riscos de indisponibilidade/mudanca de API sem aviso. |
| 2 | **Consistencia** | 4 | Os 3 documentos produzidos independentemente (@architect, @data-engineer, @ux-design-expert) concordam em 75% dos itens e discordam de forma construtiva nos demais. As discordancias sao todas justificadas com evidencias. Nao ha contradicoes fundamentais — apenas ajustes de calibragem de severidade. |
| 3 | **Severidades** | 4 | As severidades sao geralmente bem calibradas. O @data-engineer propoe 6 elevacoes com justificativa tecnica solida (TD-017, TD-021, TD-022, TD-023, TD-025, TD-026, TD-027, TD-028) e 1 reducao (TD-019). A @ux-design-expert propoe 4 elevacoes (TD-030, TD-031, TD-033, TD-035). As elevacoes sao fundamentadas e devem ser incorporadas. |
| 4 | **Acionabilidade** | 5 | Excelente. O @data-engineer forneceu **5 scripts SQL completos** prontos para execucao como migrations 006-010. A @ux-design-expert forneceu um **roadmap em 3 fases** (A, B, C) com estimativas de horas por item. O draft original ja trazia quick wins com tempo estimado. Qualquer desenvolvedor pode pegar um item e executar. |
| 5 | **Dependencias** | 4 | O grafo de dependencias Mermaid no draft e claro e correto. A cadeia critica (TD-001 -> TD-003 -> TD-002 -> TD-015) esta bem identificada. O @data-engineer reforca que RLS e funcao atomica sao pre-requisitos para qualquer feature nova. A @ux-design-expert mapeia dependencias da Phase B com TD-010 (build system). Falta apenas mapear dependencia entre Phase A UX e Sprint 0 Seguranca (sao paralelas, nao dependentes — corretamente notado pela @ux-design-expert). |
| 6 | **Riscos Nao Mapeados** | 3 | O @data-engineer identificou 6 riscos adicionais (RA-01 a RA-06) e a @ux-design-expert identificou 6 riscos de UX (TD-UX-001 a TD-UX-006). Porem, identifico **2 riscos criticos que NENHUM documento anterior cobriu** (detalhados na secao 4). |
| 7 | **Viabilidade** | 4 | O plano de 4 sprints e realista para o escopo. As estimativas do @data-engineer (Fase 0+1 = 12h de trabalho focado) sao conservadoras e factaveis. A Phase A da @ux-design-expert (23h) e igualmente viavel. O unico ponto de preocupacao e a Phase C (framework) que depende de expertise que o time atual pode nao ter (bus factor = 1). |

**Nota media ponderada: 4.0/5**

---

## 3. Inconsistencias Encontradas

### 3.1 Contagem de tabelas sem RLS

| Documento | Afirmacao | Valor |
|-----------|-----------|-------|
| `system-architecture.md` (Phase 1) | "As demais tabelas nao possuem RLS ativo" | Implica 8 tabelas sem RLS (10 - 2 com RLS) |
| `DB-AUDIT.md` (Phase 2) | "Tabelas com RLS: 2 de 13 (15%)" | 11 tabelas sem RLS |
| `technical-debt-DRAFT.md` (Phase 4) | "RLS ausente em 8 de 13 tabelas operacionais" | 8 tabelas sem RLS |
| `db-specialist-review.md` (Phase 5) | "O draft menciona 8, mas na realidade sao 11 (incluindo nf_counter, data_snapshots e audit_log)" | 11 tabelas sem RLS |

**Resolucao:** O @data-engineer esta correto. Sao **11 tabelas sem RLS** (13 total - 2 com RLS). O draft sub-contou ao excluir nf_counter, data_snapshots e audit_log da contagem. O @architect deve corrigir para 11 no documento final.

---

### 3.2 Severidade de TD-017 (Race condition nf_counter)

| Documento | Severidade atribuida |
|-----------|---------------------|
| `technical-debt-DRAFT.md` (Phase 4) | HIGH |
| `db-specialist-review.md` (Phase 5) | CRITICAL (propoe subir) |

**Resolucao:** Concordo com o @data-engineer. TD-017 deve ser **CRITICAL**. A justificativa e solida: NF-e duplicada causa rejeicao SEFAZ com impacto fiscal direto (multa + impossibilidade de faturar). O cenario de 2 abas ou 2 usuarios e realista no contexto de uso atual do sistema.

---

### 3.3 Referencia a "Netlify Functions" vs "Vercel Serverless Functions"

| Documento | Referencia |
|-----------|-----------|
| `system-architecture.md` (Phase 1) | "Vercel Serverless Functions" |
| `frontend-spec.md` (Phase 3) | "Netlify Functions" (secao 4.3) e "APIs Netlify Functions" (secao 1) |

**Resolucao:** A `frontend-spec.md` (Phase 3) utiliza o termo "Netlify Functions" em 2 instancias, enquanto TODOS os demais documentos (incluindo a analise de `vercel.json`, o limite de 12 functions e o plano Hobby) indicam claramente que o hosting e **Vercel**. Trata-se de um erro factual no documento da Phase 3 que deve ser corrigido. O impacto e baixo (nao afeta o assessment de divida tecnica), porem gera confusao para quem ler o documento isoladamente.

---

### 3.4 Esforco estimado divergente para RLS

| Documento | Estimativa |
|-----------|-----------|
| `technical-debt-DRAFT.md` (Phase 4) | Esforco "M" (medio) para TD-002 |
| `db-specialist-review.md` (Phase 5) | "4h" implementacao + "2h" teste = 5h total |

**Resolucao:** Nao e uma inconsistencia real — "M" no draft corresponde a "1-3 dias", e 5h esta dentro desse range. Porem, a estimativa do @data-engineer e mais precisa e deve ser usada como referencia no documento final.

---

## 4. Gaps Identificados

### Gap 1: Risco de Indisponibilidade/Mudanca da API do SGD (SEVERITY: HIGH)

**Nenhum documento anterior abordou este risco.** O sistema depende criticamente da API do SGD (Sistema de Gestao de Despesas do Governo de MG) para:
- Login e autenticacao de sessao
- Listagem de orcamentos
- Detalhamento de itens
- Envio de propostas

Nao existe:
- Documentacao oficial da API (e uma API interna do governo)
- Contrato de SLA com o provedor
- Versionamento da API
- Mecanismo de retry sofisticado (alem do proxy)
- Fallback para operacao offline quando SGD esta fora
- Monitoramento de disponibilidade do SGD

**Impacto:** Se o governo de MG alterar a API do SGD (endpoints, headers, formato de resposta), o sistema inteiro de cotacao para de funcionar sem aviso. Dado que o sistema depende de web scraping e engenharia reversa da API governamental, este e um risco operacional de primeira ordem.

**Recomendacao:** Adicionar item ao assessment final como TD-044 (HIGH): "Dependencia critica em API governamental nao-documentada (SGD) sem contrato de SLA, versionamento ou fallback". Incluir no Sprint 1 a implementacao de: health check periodico do SGD, cache agressivo de dados ja coletados, e alertas quando a API retornar erros inesperados.

---

### Gap 2: Ausencia de Estrategia de Backup e Disaster Recovery (SEVERITY: HIGH)

O sistema armazena dados fiscais legalmente obrigatorios (NF-e, chaves de acesso, XMLs autorizados) em:
- **Supabase Free Tier** (sem SLA, sem garantia de backup)
- **localStorage do browser** (volatil por definicao)

Nao existe:
- Rotina de backup automatico do banco Supabase
- Export periodico de dados para storage externo (S3, GCS)
- Plano de disaster recovery documentado
- RPO (Recovery Point Objective) ou RTO (Recovery Time Objective) definidos
- Backup dos XMLs de NF-e autorizadas (obrigacao fiscal: guarda de 5 anos)

**Impacto:** A perda do banco Supabase (por erro do provedor, exclusao acidental, ou atingimento de limite) causa perda irreversivel de dados fiscais cuja guarda e obrigatoria por lei (Art. 174 do CTN — 5 anos). O `data_snapshots` existente e um mecanismo interno, nao um backup externo.

**Recomendacao:** Adicionar item ao assessment final como TD-045 (CRITICAL): "Ausencia de backup externo e disaster recovery para dados fiscais obrigatorios (NF-e, XMLs)". O campo `notas_fiscais.xml_autorizado` contem XMLs que DEVEM ser preservados por 5 anos. Incluir no Sprint 0 (junto com seguranca) a implementacao de export diario para storage externo (Supabase Storage bucket ou servico externo).

---

### Gap 3: Certificado Digital sem Monitoramento de Expiracao (SEVERITY: MEDIUM)

O draft menciona TD-040 (certificado PFX em env var), mas nenhum documento analisa o risco concreto: certificados A1 tem validade de 1 ano. Se expirar sem renovacao:
- Todas as emissoes de NF-e falham
- O faturamento da empresa para completamente
- A renovacao requer novo certificado + redeploy

**Nota:** TD-040 ja cobre parcialmente isso. O gap e que a severidade deveria ser HIGH (nao MEDIUM) dado o impacto de paralisacao total do faturamento.

---

## 5. Consolidacao de Severidades

Com base na analise cruzada dos 3 documentos de avaliacao (draft, db-specialist-review, ux-specialist-review), apresento a **severidade final recomendada** para todos os itens disputados:

| TD ID | Severidade Draft | Proposta DB | Proposta UX | **Severidade Final QA** | Justificativa |
|-------|:----------------:|:-----------:|:-----------:|:-----------------------:|---------------|
| TD-017 | HIGH | CRITICAL | — | **CRITICAL** | Race condition com impacto fiscal direto. Cenario realista e inevitavel com uso normal. |
| TD-019 | HIGH | MEDIUM | — | **MEDIUM** | Volume atual < 5000 registros. Quick win preventivo, mas nao urgente. |
| TD-021 | MEDIUM | HIGH | — | **HIGH** | Dados incorretos do destinatario em NF-e causam rejeicao SEFAZ. Impacto fiscal comprovado. |
| TD-022 | MEDIUM | HIGH | — | **HIGH** | Queries temporais de vigencia sao essenciais para compliance de licitacao publica. |
| TD-023 | MEDIUM | HIGH | — | **HIGH** | Trigger silenciosamente quebrado compromete sync e cache invalidation. Correcao trivial (5min). |
| TD-025 | MEDIUM | HIGH | — | **HIGH** | Bomba-relogio: atingira limite do Supabase Free em ~6 meses. Mensuravel e previsivel. |
| TD-026 | LOW | MEDIUM | — | **MEDIUM** | 3 sistemas de storage coexistindo cria divergencia real entre sessoes/dispositivos. |
| TD-027 | LOW | MEDIUM | — | **MEDIUM** | Sem FK, exclusao de NF deixa conta a receber referenciando registro fantasma. |
| TD-028 | LOW | HIGH | — | **HIGH** | NF duplicada no banco = rejeicao SEFAZ. Correcao trivial (5min). |
| TD-030 | MEDIUM | — | HIGH | **HIGH** | Fragmentacao visual comunica "dois produtos" e duplica esforco de manutencao CSS. |
| TD-031 | MEDIUM | — | HIGH | **HIGH** | 167+ linhas de CSS inline duplicadas em 5+ paginas. Manutencao impossivel na pratica. |
| TD-033 | MEDIUM | — | HIGH | **HIGH** | Risco juridico real (Lei 13.146/2015). Exclusao de usuarios em contexto de licitacao publica. |
| TD-035 | LOW | — | MEDIUM | **MEDIUM** | Publico-alvo em cidades pequenas de MG com conexao lenta. FCP de 5-10s e inaceitavel. |

### Resumo da Consolidacao

| Direcao | Quantidade |
|---------|:----------:|
| Mantido como no draft | 30 itens |
| Elevado (concordando com especialistas) | 12 itens |
| Reduzido (concordando com especialista) | 1 item (TD-019) |

### Contagem Final Consolidada

| Severidade | Quantidade (Draft) | Quantidade (Consolidada) |
|------------|:------------------:|:------------------------:|
| CRITICAL | 3 | **4** (+TD-017) |
| HIGH | 11 | **18** (+TD-021, TD-022, TD-023, TD-025, TD-028, TD-030, TD-031, TD-033; -TD-019) |
| MEDIUM | 16 | **12** (-6 elevados a HIGH; +TD-019, +TD-026, +TD-027, +TD-035) |
| LOW | 13 | **9** (-TD-026, -TD-027, -TD-028, -TD-035) |
| **TOTAL** | **43** | **43** (mesmos itens, severidades ajustadas) |

---

## 6. Recomendacoes ao @architect

Para a finalizacao do documento `technical-debt-assessment.md` (Phase 8), recomendo:

### 6.1 Correcoes Obrigatorias

1. **Corrigir contagem de tabelas sem RLS** de "8 de 13" para **"11 de 13"** em todas as referencias (incluindo nf_counter, data_snapshots, audit_log).

2. **Elevar TD-017 para CRITICAL** com justificativa do @data-engineer: race condition com impacto fiscal direto, cenario inevitavel com uso normal do sistema.

3. **Incorporar severidades consolidadas** da secao 5 deste documento para todos os 12 itens com elevacao aprovada.

4. **Corrigir referencia a "Netlify Functions"** na frontend-spec (ou notar que a terminologia correta e Vercel Serverless Functions em todas as mencoes do assessment final).

5. **Adicionar TD-044** (Dependencia em API governamental SGD sem SLA) como item HIGH no assessment final, conforme detalhado no Gap 1.

6. **Adicionar TD-045** (Ausencia de backup externo e DR para dados fiscais) como item CRITICAL no assessment final, conforme detalhado no Gap 2.

### 6.2 Incorporacoes dos Especialistas

7. **Incorporar os 6 riscos adicionais do @data-engineer** (RA-01 a RA-06) no catalogo de debitos, com as severidades propostas.

8. **Incorporar os 6 riscos de UX** (TD-UX-001 a TD-UX-006) no catalogo de debitos, com as severidades propostas pela @ux-design-expert.

9. **Incorporar os scripts SQL do @data-engineer** (migrations 006-010) como anexo ou referencia direta no plano de remediacao.

10. **Adicionar Phase A da @ux-design-expert** (quick fixes, 23h) como atividade paralela ao Sprint 0 no plano de remediacao.

### 6.3 Melhorias Recomendadas

11. **Adicionar secao de Riscos Externos** cobrindo: indisponibilidade do SGD, mudancas na API SEFAZ, expiracao de certificado digital, atingimento de limites do free tier.

12. **Expandir a secao de Testing** com recomendacao de estrategia especifica: quais funcoes testar primeiro (gdp-api.js, nfe-sefaz-client.js, radar-matcher.js), qual framework usar (Vitest dado o contexto de build via Vite), cobertura alvo por sprint.

13. **Adicionar metrica de Bus Factor** como item de risco explicito (atualmente = 1; alvo = 2 apos documentacao e testes).

14. **Elevar TD-040** (certificado digital) de MEDIUM para HIGH, dado que expiracao causa paralisacao total do faturamento.

---

## 7. Veredito

### **APPROVED**

---

### Justificativa

O assessment de divida tecnica produzido pelo processo de Brownfield Discovery **atende aos criterios de qualidade** exigidos para prosseguir para a Phase 8 (finalizacao pelo @architect):

| Criterio | Status | Detalhes |
|----------|--------|----------|
| Todos os debitos validados | SIM | 43 debitos catalogados, todos com evidencia e severidade justificada. Especialistas validaram e complementaram. |
| Gaps criticos identificados | SIM (com ressalvas) | 2 gaps novos identificados nesta revisao (SGD dependency e backup/DR) devem ser incorporados no documento final. Nenhum gap invalida o assessment existente. |
| Dependencias mapeadas | SIM | Grafo Mermaid correto. Cadeia critica identificada. Dependencias entre phases dos especialistas tambem mapeadas. |
| Plano acionavel | SIM | Scripts SQL prontos, estimativas em horas, owners sugeridos, criterios de saida definidos por sprint. |
| Consistencia entre documentos | SIM (com correcoes menores) | 4 inconsistencias identificadas (secao 3), todas com resolucao clara e de baixo impacto. |

### Condicoes para o @architect na Phase 8

O veredito APPROVED esta condicionado a incorporacao dos seguintes itens no documento final (`technical-debt-assessment.md`):

1. **MUST:** Incorporar as 5 correcoes obrigatorias (secao 6.1, itens 1-5)
2. **MUST:** Adicionar TD-045 (backup/DR) como item CRITICAL
3. **SHOULD:** Incorporar itens 7-10 da secao 6.2
4. **SHOULD:** Incorporar melhorias 11-14 da secao 6.3

### Nota Final

O sistema apresenta **risco operacional real e mensuravel**, mas a equipe produziu um diagnostico de qualidade que, uma vez consolidado e executado conforme o plano de sprints, e capaz de remediar os riscos criticos em **2-3 semanas de trabalho focado** (Sprint 0). A base de codigo funciona e entrega valor de negocio — a divida tecnica e gerenciavel se tratada agora. O custo de inacao cresce exponencialmente com o tempo.

---

*Documento gerado por @qa (Quinn) — Brownfield Discovery Phase 7*
*Proximo passo: @architect (Phase 8) — Consolidar em `technical-debt-assessment.md` final*
