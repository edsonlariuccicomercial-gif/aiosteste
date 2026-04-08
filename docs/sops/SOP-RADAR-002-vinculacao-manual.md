# SOP-RADAR-002: Vinculação Manual de Itens — Fluxo do Usuário

**Versão:** 1.0
**Status:** Draft
**Módulo:** Radar / Pré-Orçamento
**Pré-requisito:** SOP-RADAR-001 (Matching Automático)

---

## 1. OBJETIVO

Quando o matching automático (SOP-001) não encontra vínculo ou retorna sugestão incorreta, o usuário deve poder vincular manualmente o item do SGD a um produto do Banco de Preços. O sistema então aprende essa vinculação para uso futuro.

## 2. CENÁRIOS DE ATIVAÇÃO

| Cenário | Trigger | Estado inicial |
|---------|---------|---------------|
| **A: Sem match** | Item com badge vermelho "Sem vínculo" | preço R$ 0, sem SKU |
| **B: Sugestão errada** | Usuário clica "Corrigir" na sugestão amarela | sugestão descartada |
| **C: Edição posterior** | Usuário abre pré-orçamento já criado e quer re-vincular | item já tem preço (manual ou sugestão) |

## 3. FLUXO DETALHADO

### Passo 1: Abrir Modal de Vinculação

**Trigger:** Clique em "Vincular ao Banco" ou "Corrigir"

**Modal exibe:**
```
┌─────────────────────────────────────────────┐
│  Vincular: "FEIJÃO CARIOQUINHA TIPO 1 1KG"  │
│                                              │
│  🔍 Buscar no Banco: [____________] [Buscar] │
│                                              │
│  Sugestões automáticas:                      │
│  ┌──────────────────────────────────────┐    │
│  │ ● Feijão Carioca (LICT-0067)        │    │
│  │   Custo: R$ 6,20 | Margem: 30%      │    │
│  │   Score: 85% | [Selecionar]          │    │
│  ├──────────────────────────────────────┤    │
│  │ ● Feijão Preto (LICT-0068)          │    │
│  │   Custo: R$ 5,80 | Margem: 30%      │    │
│  │   Score: 45% | [Selecionar]          │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Produto não existe no banco?                │
│  [+ Criar novo produto no Banco]             │
│                                              │
│  [Cancelar]              [Vincular sem banco] │
└─────────────────────────────────────────────┘
```

### Passo 2: Seleção do Produto

| Ação do usuário | Resultado |
|----------------|-----------|
| Clica "Selecionar" em sugestão | Produto vinculado, preço preenchido |
| Digita no campo busca e seleciona | Produto vinculado por busca manual |
| Clica "Criar novo produto" | Abre form para cadastrar no Banco → depois vincula |
| Clica "Vincular sem banco" | Item fica sem vínculo, usuário preenche preço manual |

### Passo 3: Confirmação e Aprendizado

Ao selecionar um produto:

```
1. Atualizar item do pré-orçamento:
   - skuBanco = produto.sku
   - nomeBanco = produto.nome
   - custoBase = produto.custoBase
   - margemPadrao = produto.margemPadrao
   - precoSugerido = custoBase * (1 + margem)
   - matchStatus = "exato"

2. Salvar no dicionário de equivalências (SOP-003):
   - chave = normalizar(item.nome)  // nome original do SGD
   - valor = { sku, nomeBanco, confirmado: true, origem: "manual" }

3. Re-renderizar item com badge verde "Vinculado"

4. Recalcular total do pré-orçamento
```

## 4. BUSCA NO BANCO DE PREÇOS

O campo de busca no modal deve suportar:

| Tipo de busca | Exemplo | Comportamento |
|--------------|---------|---------------|
| Por nome | "feijão" | Filtra itens do banco que contêm "feijão" |
| Por SKU | "LICT-0067" | Match exato por SKU |
| Por NCM | "0713" | Filtra por NCM parcial |

**Ordenação dos resultados:**
1. Score de similaridade com o nome original do SGD (desc)
2. Frequência de uso em pré-orçamentos anteriores (desc)
3. Alfabético (asc)

## 5. CRIAR NOVO PRODUTO NO BANCO

Se o produto não existe no Banco de Preços:

```
Form rápido:
- Nome: [pré-preenchido com nome do SGD limpo]
- Grupo: [dropdown: Alimentação, Limpeza, Material, etc.]
- Unidade base: [KG / UN / LT / PCT]
- Custo base: [R$ ___]
- Margem padrão: [30%]  (default)
- NCM: [pré-preenchido se disponível no SGD]
```

**Após salvar:**
1. Produto criado no Banco de Preços
2. SKU gerado automaticamente (LICT-XXXX)
3. Vinculação automática ao item do pré-orçamento
4. Equivalência salva no dicionário Radar

## 6. REGRAS DE NEGÓCIO

1. **Um item SGD pode vincular a apenas 1 produto do banco** — se re-vincular, substitui o anterior
2. **Vincular sem banco é permitido** — itens novos ou serviços sem histórico de preço
3. **O modal mostra máximo 10 sugestões** — ordenadas por score
4. **Vinculação é por descrição normalizada** — "FEIJÃO CARIOQUINHA TIPO 1 1KG" e "Feijão carioquinha tipo 1 pct 1kg" geram a mesma chave
5. **Criar produto no banco é opcional** — se o usuário só quer preencher preço manual, pode "Vincular sem banco"

## 7. MÉTRICAS

| Métrica | Fórmula | Meta |
|---------|---------|------|
| Taxa de auto-match | itens com match exato / total itens | > 80% após 30 dias |
| Taxa de sugestão aceita | sugestões confirmadas / sugestões exibidas | > 60% |
| Itens sem vínculo | itens com matchStatus = "sem_match" / total | < 10% após 60 dias |
| Tempo médio vinculação manual | tempo entre abrir modal e confirmar | < 15 segundos |

---

**Autor:** Deming (SOP Factory) | **Próximo:** SOP-RADAR-003 (Aprendizado)
