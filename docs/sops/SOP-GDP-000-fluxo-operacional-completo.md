# SOP-GDP-000: Fluxo Operacional Completo — Ciclo de Vida do Fornecedor

**Versão:** 1.0
**Status:** Draft (levantamento com stakeholder)
**Data:** 2026-04-20
**Fonte:** Entrevista direta com operador (Edson)

---

## PIPELINE COMPLETO (14 Etapas)

```
SGD Login → FILTRO → CLASSIFICAÇÃO → PRAZO → COTAÇÃO → REVISÃO → CENTRAL PRODUTOS
     ↓                                                              ↓
ASSOCIAÇÃO ← C.A. REFERÊNCIA ← FONTES (B2B/Excel/PDF/NF)          ↓
     ↓                                                              ↓
ENVIO PROPOSTA → RESULTADO → GANHOU? → CONTRATO (normalizado)
                                ↓ NÃO
                          MEMÓRIA CONCORRÊNCIA → SÉRIE HISTÓRICA
```

---

## ETAPAS DETALHADAS

### 1. FILTRO DAS ESCOLAS
- Entrar no SGD, filtrar por cidade
- Analisar quais orçamentos estão no prazo de envio de proposta
- Output: lista de oportunidades ativas

### 2. CLASSIFICAÇÃO DO OBJETO
- Classificar objetos por categoria: alimentação, limpeza, papelaria, etc.
- Permite priorização e agrupamento de cotações por fornecedor

### 3. PRAZO
- Ordenar por data de vencimento
- Garantir que nenhum prazo é perdido
- Alertas de urgência

### 4. COTAÇÃO
- Cotar os produtos de cada orçamento
- Buscar preços na Central de Produtos
- Aplicar margem sobre custo de aquisição

### 5. REVISÃO DA COTAÇÃO
- Revisão humana obrigatória
- Erros comuns: unidade errada (cx vs un), quantidade incorreta
- Exemplo: se é caixa e cota unidade, perde o processo por isso

### 6. C.A. DE REFERÊNCIA (Custo de Aquisição)
- Preço que o fornecedor paga aos seus fornecedores
- Base para cálculo de margem
- Deve estar sempre atualizado na Central

### 7. CENTRAL DE PRODUTOS
- Repositório único de produtos com:
  - Descrição normalizada (igual à NF de saída)
  - NCM associado
  - Marca
  - Preço de referência (C.A.)
  - Unidade correta
- Puxa dados da seção Inteligência do módulo GDP

### 8. ASSOCIAÇÃO DE PRODUTO
- Descrição SGD é genérica/longa/diferente da Central
- Precisa fazer matching: descrição SGD ↔ produto Central
- Central tem a descrição que vai na NF + NCM + marca
- Pipeline de matching: fuzzy → manual → aprendizado

### 9. LIGAÇÃO ORÇAMENTO ↔ CENTRAL
- Cada item do orçamento SGD deve ser vinculado a um produto da Central
- Permite cotação automática com preço de referência correto

### 10. ATUALIZAÇÃO DA CENTRAL
Fontes de atualização:
- a) Sites B2B (scraping)
- b) Tabelas em Excel (upload)
- c) Tabelas em PDF (extração)
- d) Notas Fiscais de entrada (automático)

### 11. CONTRATO (pós-vitória)
- Cotação ganha → vira contrato automaticamente
- Produtos já normalizados e associados
- Vai direto para seção Contratos no GDP

### 12. MEMÓRIA DE RESULTADO (ganhou/perdeu)
- Registrar resultado de cada processo
- Análise de concorrência para futuras decisões
- Base em dados reais, não intuição

### 13. PREÇO DO GANHADOR (quando perde)
- Memorizar o preço do concorrente que ganhou
- Avaliar se é possível virar o jogo no próximo processo daquela escola
- Alimenta inteligência competitiva

### 14. SÉRIE HISTÓRICA
- Formação de séries por:
  - Cidade
  - Região (SRE)
  - Escola
- Permite análise de tendência e posicionamento estratégico

---

## DECISÕES PENDENTES

### PNCP
- **Questão:** Qual a validade dos dados do PNCP? Dados antigos devem ser excluídos?
- **Ação:** Definir regra de retenção/limpeza da seção PNCP

### BANCO DE PREÇOS (deprecar)
- **Decisão:** Excluir módulo "Banco de Preços" separado
- **Migrar para:** Central de Produtos (seção Inteligência → aba Produtos no GDP)
- **Justificativa:** Ter uma única fonte de verdade para preços

### FLUXO GDP (revisão)
- **Ação:** Auditar módulos atuais do GDP
- **Objetivo:** Definir o que fica, o que sai, o que muda
- **Critério:** Alinhamento com este pipeline de 14 etapas

---

## MAPEAMENTO SISTEMA ATUAL vs PIPELINE

| Etapa | Existe no sistema? | Onde? | Status |
|-------|:------------------:|-------|--------|
| 1. Filtro escolas | ✅ | SGD Radar | Funcional |
| 2. Classificação | ⚠️ | Parcial (manual) | Precisa automação |
| 3. Prazo | ✅ | Dashboard KPIs | Funcional |
| 4. Cotação | ⚠️ | Pré-orçamento | Parcial |
| 5. Revisão | ❌ | Não existe | CRIAR |
| 6. C.A. Referência | ⚠️ | Disperso | Centralizar |
| 7. Central Produtos | ⚠️ | Inteligência/Produtos | Incompleta |
| 8. Associação | ✅ | Radar Matcher | Funcional (4 camadas) |
| 9. Ligação orç↔central | ⚠️ | Parcial | Melhorar |
| 10. Atualização Central | ⚠️ | B2B scraping | Falta Excel/PDF/NF |
| 11. Contrato auto | ⚠️ | Manual | Automatizar |
| 12. Memória resultado | ⚠️ | resultados_orcamento | Parcial |
| 13. Preço ganhador | ❌ | Não existe | CRIAR |
| 14. Série histórica | ⚠️ | preco_historico | Parcial |
| PNCP | ✅ | PNCP Search | Revisar validade |
| Banco Preços | ❌ → deprecar | banco-precos-client | REMOVER |

---

*Documento criado durante sessão de Brownfield Discovery + SOP mapping*
*Próximo: Criar stories para gaps identificados (❌ e ⚠️)*
