# PRD-006: Sistema de Inteligência de Preços

**Produto:** Licit-AIX GDP
**Autor:** Morgan (@pm)
**Versão:** 1.0
**Data:** 2026-04-08
**Status:** Draft
**Prioridade:** P0 — Impacta diretamente receita e competitividade

---

## 1. PROBLEMA

O fornecedor de licitações escolares precisa responder: **"Por quanto eu vendo esse item pra essa escola?"**

Hoje:
- Pré-orçamentos saem com preço R$ 0 em ~30% dos itens (matching falha)
- Custo real (NF entrada) não alimenta o banco de preços
- Resultados ganhos/perdidos não retroalimentam a precificação
- Contratos e NFs de saída não registram preço de venda no banco
- Cada escola descreve o mesmo produto de forma diferente, sem normalização

**Impacto:** Perda de processos por preço errado, margem não otimizada, trabalho manual em cada orçamento.

---

## 2. VISÃO

Um banco de preços unificado com dois lados (custo e venda) que se alimenta automaticamente de todas as operações do sistema e sugere o preço ideal para cada item de cada escola.

---

## 3. USUÁRIO-ALVO

**Persona:** Edson — fornecedor de alimentos para caixas escolares em MG
**Contexto:** Participa de ~150+ processos licitatórios/ano, atende 30+ escolas, vende ~100 itens alimentícios diferentes
**Dor principal:** Preencher preços manualmente em cada orçamento, sem saber se está competitivo

---

## 4. REQUISITOS FUNCIONAIS

### Epic 6: Inteligência de Preços

#### FR-1: Matching Radar → Banco (Ponte 2)
- FR-1.1: Dicionário de equivalências isolado para Radar (`radar_equivalencias`)
- FR-1.2: Normalização de nomes (remover noise, sinônimos, gramatura)
- FR-1.3: Auto-match 3 camadas: dicionário → seed contratos → fuzzy banco
- FR-1.4: Modal de vinculação manual com busca e criação de produto
- FR-1.5: Aprendizado — cada vinculação alimenta dicionário para futuro
- FR-1.6: Seed inicial dos 95 vínculos existentes nos contratos GDP
- FR-1.7: Indicadores visuais: verde (vinculado), amarelo (sugestão), vermelho (sem match)

#### FR-2: Resultado SGD → Banco (Ponte 3)
- FR-2.1: Quando resultado é marcado (ganho/perdido), atualizar `historicoResultados[]` do produto no banco
- FR-2.2: Match por SKU/equivalência (não substring)
- FR-2.3: Se ganhou: registrar como "preço aceito" com escola e data
- FR-2.4: Se perdeu: registrar como "preço recusado" + adicionar a `concorrentes[]`
- FR-2.5: Recalcular `taxaConversao` do produto

#### FR-3: NF Entrada → Custo (Ponte 1)
- FR-3.1: Quando NF de entrada é importada, match cada item com banco por NCM+nome
- FR-3.2: Atualizar `custoBase` com preço unitário da NF
- FR-3.3: Adicionar entrada em `custosFornecedor[]` com tipo "nf_entrada"
- FR-3.4: Recalcular `precoReferencia` com nova margem

#### FR-4: Contrato → Banco (Ponte 4)
- FR-4.1: Quando contrato é criado/importado, registrar preço de cada item como "venda confirmada"
- FR-4.2: Adicionar entrada em `propostas[]` com tipo "contrato"
- FR-4.3: Atualizar `precoReferenciaHistorico` (média de contratos ganhos)

#### FR-5: NF Saída → Banco (Ponte 5)
- FR-5.1: Quando NF-e é emitida, registrar valor unitário de cada item como "preço real faturado"
- FR-5.2: Adicionar entrada em `propostas[]` com tipo "nf_saida"
- FR-5.3: Calcular `margemReal` = (precoNF - custoBase) / custoBase

#### FR-6: Engine de Preço Sugerido (melhoria do existente)
- FR-6.1: Usar `custoBase` mais recente (prioridade: NF entrada > tabela > B2B)
- FR-6.2: Ajustar margem por `taxaConversao` (< 50%: -5pp, > 80%: +5pp)
- FR-6.3: Considerar `concorrenteMaisBaixo` pra ficar competitivo
- FR-6.4: Mostrar referência: último preço ganho nessa escola
- FR-6.5: Mostrar recorrência: quantas vezes esse item apareceu em 12 meses

---

## 5. REQUISITOS NÃO-FUNCIONAIS

| NFR | Requisito | Métrica |
|-----|-----------|---------|
| NFR-1 | Matching automático < 2s para 30 itens | Performance |
| NFR-2 | Dicionário radar isolado do GDP | Arquitetura |
| NFR-3 | Dados no Supabase (não localStorage) | Persistência |
| NFR-4 | Zero alteração nos módulos GDP existentes | Compatibilidade |
| NFR-5 | Taxa auto-match > 80% após 30 dias de uso | Qualidade |

---

## 6. ESCOPO / FORA DE ESCOPO

### Dentro
- 5 pontes entre módulos existentes
- Dicionário de equivalências Radar
- Hooks em funções existentes (NF entrada, resultado, contrato, NF saída)
- Melhoria do `calcPrecoSugerido()`

### Fora
- Multi-supplier arbitrage (comparação entre fornecedores)
- Demand forecasting (previsão de demanda)
- Seasonal pricing (sazonalidade)
- Supplier rating (avaliação de fornecedores)
- Import automático de tabelas de fornecedor (manual por agora)

---

## 7. MÉTRICAS DE SUCESSO

| Métrica | Baseline (hoje) | Meta (30 dias) | Meta (90 dias) |
|---------|-----------------|----------------|----------------|
| Taxa auto-match | ~40% | > 70% | > 85% |
| Itens com preço R$ 0 | ~30% | < 10% | < 3% |
| Margem média | 30% (fixo) | 28-35% (dinâmico) | Otimizado por item |
| Taxa conversão | Desconhecida | Medida | > 60% |
| Tempo pré-orçamento | 15-30 min | < 5 min | < 2 min |

---

## 8. FASES DE IMPLEMENTAÇÃO

### Fase 1 — Pontes rápidas + Matching (5 dias)
| Story | Ponte | Esforço |
|-------|-------|---------|
| 6.1 | Matching Radar (FR-1) — novo módulo | 3 dias |
| 6.2 | Resultado → Banco (FR-2) — melhorar match | 0.5 dia |
| 6.3 | Contrato → Banco (FR-4) — hook | 0.5 dia |
| 6.4 | NF Saída → Banco (FR-5) — hook | 0.5 dia |
| 6.5 | NF Entrada → Custo (FR-3) — hook | 0.5 dia |

### Fase 2 — Engine inteligente (3 dias)
| Story | Feature | Esforço |
|-------|---------|---------|
| 6.6 | Preço sugerido melhorado (FR-6) | 1.5 dia |
| 6.7 | Dashboard de inteligência (KPIs, recorrência) | 1.5 dia |

---

## 9. RISCOS

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Matching errado (falso positivo) | Média | Alto | Threshold 0.6, confirmação visual |
| Interferir no GDP | Baixa | Alto | Módulo isolado, read-only nos contratos |
| Seed insuficiente (95 produtos) | Média | Médio | Cresce com uso + vinculação manual |
| Performance do fuzzy match | Baixa | Médio | Cache em memória, tokenização O(n) |

---

## 10. REFERÊNCIAS

- SOP-PRECO-000: Visão Geral do Sistema de Preços
- SOP-RADAR-001/002/003: Matching, Vinculação, Aprendizado
- Gap Analysis: 5 pontes identificadas pelo @analyst
- Brownfield Discovery: Split completo dos monolitos (app.js + gdp-contratos.html)

---

## 11. DEPENDÊNCIAS TÉCNICAS

| Dependência | Status | Nota |
|-------------|--------|------|
| Supabase tabelas reais | PRONTO | 9 tabelas criadas |
| gdp-api.js | PRONTO | CRUD layer |
| app.js split | PRONTO | 9 módulos |
| gdp-contratos.html split | PRONTO | 9 módulos |
| Banco de preços existente | PRONTO | custoBase, margem, concorrentes, propostas |
| Tabela radar_equivalencias | CRIAR | Schema no SOP-003 |

---

**Autor:** Morgan (@pm)
**Handoff:** → @architect (Aria) para decisões de arquitetura
**Pipeline:** PM → Architect → Data Engineer → UX → PO → SM → Dev → QA → DevOps
