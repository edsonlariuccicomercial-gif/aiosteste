# Epic 8 — Consolidacao GDP e Fechamento de Gaps Operacionais

**Projeto:** Painel Caixa Escolar (GDP / Licit-AIX)
**Data de Criacao:** 2026-04-20
**Autor:** @sm (River) — baseado em SPEC-GDP-GAPS v1.0 (Approved)
**Status:** Ready
**Prioridade:** P0/P1 (Gaps operacionais criticos)

---

## Objetivo

Fechar os 4 gaps operacionais identificados no pipeline GDP (SOP-GDP-000) que impactam diretamente a operacao do fornecedor de Caixas Escolares de MG. Os gaps cobrem desde perda de licitacoes por erro de unidade (G1) ate a impossibilidade de formar series historicas de precos por cidade/SRE/escola (G4).

### Por que esta Epic existe

1. **G1 (P0):** Perda direta de licitacoes por erro de unidade no envio ao SGD — sem validacao pre-envio
2. **G2 (P1):** Dois sistemas sobrepostos (Banco de Precos + Central de Produtos) causam dados divergentes e confusao operacional
3. **G3 (P1):** Contrato manual apos vitoria desperdicea tempo e cria risco de perda de dados
4. **G4 (P2):** Historico de precos em localStorage impede analytics por cidade/SRE/escola

### Criterio de Entrada

- SPEC-GDP-GAPS v1.0 aprovada pelo QA Gate (Score 4.5/5.0)
- Epic 7 Sprint 0 (Seguranca) concluido ou em andamento (nao bloqueante para GDP)
- Ordem de implementacao: G2 primeiro (fundacao), depois G1, G3, G4

---

## Escopo

| Wave | Sprint | Foco | Gap | Prioridade | Status |
|:----:|:------:|------|:---:|:----------:|--------|
| 1 | S1 | Central Unificada — Fundacao | G2 | P1 | Ready |
| 2 | S2 | Revisao de Cotacao + Inicio Contrato | G1 + G3 | P0 + P1 | Backlog |
| 3 | S3 | Contrato Automatico + Inicio Serie | G3 + G4 | P1 + P2 | Backlog |
| 4 | S4 | Serie Historica Completa | G4 | P2 | Backlog |

---

## Stories

### Wave 1 — G2: Central Unificada (Fundacao)

**Duracao estimada:** 1 sprint (2 semanas)
**Criterio de saida:** Central de Produtos contem todos os campos do Banco de Precos; migracao idempotente executou; RadarMatcher aponta para Central unificada; aba Banco de Precos depreciada.

- [ ] Story 8.1: Unificar schema Central de Produtos com campos do Banco de Precos (3 pts)
- [ ] Story 8.2: Migrar dados Banco de Precos para Central de Produtos (2 pts)
- [ ] Story 8.3: Deprecar Banco de Precos — facade + atualizar RadarMatcher (2 pts)
- [ ] Story 8.4: Enriquecer UI Central com colunas de custo/margem/competitividade (2 pts)

### Wave 2 — G1: Revisao de Cotacao (P0)

**Duracao estimada:** 1 sprint (2 semanas)
**Criterio de saida:** Modal de revisao pre-envio funcional; divergencias de unidade detectadas e destacadas; sugestao de preco corrigido; bloqueio condicional de envio.

- [ ] Story 8.5: Modal de revisao pre-envio com deteccao de divergencia de unidade (3 pts)
- [ ] Story 8.6: Tabela de conversao de unidades e sugestao de preco corrigido (2 pts)

### Wave 3 — G3: Contrato Automatico

**Duracao estimada:** 1 sprint (2 semanas)
**Criterio de saida:** Contrato criado automaticamente ao registrar resultado "ganho"; itens vinculados a Central com SKU/NCM; persistencia dual-layer (localStorage + Supabase).

- [ ] Story 8.7: Auto-criar contrato em resultado ganho com vinculo Central (3 pts)
- [ ] Story 8.8: Persistir contrato no Supabase — dual-layer async (2 pts)

### Wave 4 — G4: Serie Historica

**Duracao estimada:** 1 sprint (2 semanas)
**Criterio de saida:** `preco_historico` populada em 6 pontos do fluxo; funcoes RPC de agregacao funcionais; dashboard com filtros por SKU/municipio/SRE/periodo.

- [ ] Story 8.9: Populacao sistematica de preco_historico — 6 pontos de insercao (3 pts)
- [ ] Story 8.10: Migration 006 — indices GIN e funcoes RPC de agregacao (2 pts)
- [ ] Story 8.11: Dashboard de serie historica com filtros e tendencia (3 pts)
- [ ] Story 8.12: Migracao de dados historicos — backfill preco_historico (2 pts)

---

**Total estimado:** 29 story points (~4 sprints de 2 semanas)

---

## Dependencias entre Stories

### Grafo de Dependencia

```
Wave 1 (G2 — Fundacao):
  8.1 (Schema) ──> 8.2 (Migracao) ──> 8.3 (Deprecar + RadarMatcher)
  8.1 (Schema) ──> 8.4 (UI enriquecida)     [paralela a 8.2]

Wave 2 (G1):
  8.3 ──> 8.5 (Modal revisao)               [depende de RadarMatcher atualizado]
  8.5 ──> 8.6 (Conversao unidades)

Wave 3 (G3):
  8.3 ──> 8.7 (Auto-contrato)               [depende de Central unificada p/ SKU/NCM]
  8.7 ──> 8.8 (Supabase dual-layer)

Wave 4 (G4):
  8.3 ──> 8.9 (Populacao preco_historico)    [depende de SKU unificado]
  8.9 ──> 8.10 (Migration + RPC)
  8.10 ──> 8.11 (Dashboard)
  8.9 ──> 8.12 (Backfill historico)          [paralela a 8.10]
```

### Dependencia Critica

**G2 (Stories 8.1-8.4) e o ponto de inflexao.** Sem a Central unificada:
- G1 nao consegue vincular produto Central a item SGD via RadarMatcher
- G3 nao consegue incluir SKU/NCM no contrato
- G4 nao tem SKU consistente para agregar series historicas

---

## Criterios de Sucesso

| Metrica | Atual | Alvo Wave 2 | Alvo Wave 4 |
|---------|:-----:|:-----------:|:-----------:|
| Sistemas de Produto | 2 (sobrepostos) | 1 (Central unica) | 1 |
| Validacao pre-envio SGD | Inexistente | Modal com 7 ACs | Operacional |
| Criacao de contrato | Manual (checkbox) | Automatica + opt-out | Automatica |
| Fontes de preco_historico | 1 (NF entrada) | 1 | 6 (completo) |
| Dashboard serie historica | Inexistente | N/A | Operacional com filtros |
| Perda por erro de unidade | Estimada alta | Reduzida (G1 resolve) | Monitorada |

---

## Riscos

| # | Risco | Prob. | Impacto | Mitigacao |
|---|-------|:-----:|:-------:|-----------|
| R1 | Migracao G2 perde dados historicos do Banco | Media | Alto | Backup `caixaescolar.banco.v1` por 30 dias; contagem pos-migracao |
| R2 | Tabela de conversao de unidades G1 incompleta | Alta | Medio | Top 10 pares iniciais; operador pode adicionar; log de divergencias |
| R3 | Performance queries G4 com volume alto | Baixa | Medio | Indices GIN; funcoes RPC com LIMIT; cache 15min |
| R4 | RadarMatcher perde qualidade apos troca fonte G2 | Media | Alto | Comparar matching contra ambas fontes durante 1 sprint |
| R5 | localStorage cheio apos unificacao G2 | Media | Alto | Monitorar tamanho; compactar historico >6 meses |
| R6 | Auto-contrato G3 gera contratos indesejados | Baixa | Medio | Checkbox opt-out; log de auditoria |
| R7 | Supabase free tier storage com preco_historico G4 | Media | Alto | Monitorar `supabase db size`; retention policy 12 meses |

---

## Dependencias Externas

### Bloqueia

- Qualquer feature que dependa de SKU unificado (pos-Wave 1)
- Analytics de competitividade por regiao (pos-Wave 4)

### Bloqueado por

- Epic 7 Sprint 0 NAO bloqueia esta Epic (podem rodar em paralelo)
- G2 e pre-requisito interno para G1, G3 e G4

---

## Issues do QA Critique (para acompanhamento)

| Issue | Descricao | Acao | Alocacao |
|-------|-----------|------|----------|
| ISS-1 | Etapa 13 SOP (Preco do Ganhador) sem FR dedicado | Backlog — story futura apos Wave 4 | Story 8.13 (futura) |
| ISS-2 | SECURITY DEFINER nas funcoes RPC | Resolver na Story 8.10 (usar SECURITY INVOKER) | Story 8.10 |
| ISS-3 | Referencia de linha para `salvarResultado()` | Ajustar na implementacao | Story 8.7/8.9 |
| ISS-4 | `gerarContratoUnificado()` nao mencionado | Verificar impacto durante Story 8.7 | Story 8.7 |

---

## Referencias

| Documento | Localizacao |
|-----------|-------------|
| Especificacao dos 4 Gaps (Approved) | `docs/specs/SPEC-GDP-GAPS.md` |
| SOP GDP Completo | Referenciado na spec (SOP-GDP-000) |
| System Architecture | `docs/architecture/system-architecture.md` |
| Technical Debt Assessment | `docs/architecture/technical-debt-assessment.md` |

---

*Epic criado por @sm (River) — baseado em SPEC-GDP-GAPS v1.0 (Approved, Score 4.5/5.0)*
*Rastreabilidade: SOP-GDP-000 Etapas 5, 6, 7, 11, 14*
*Projeto: Painel Caixa Escolar MG / GDP*
