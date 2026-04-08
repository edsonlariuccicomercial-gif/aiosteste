# SOP-PRECO-000: Visão Geral — Sistema de Inteligência de Preços

**Versão:** 1.0
**Status:** Draft
**Escopo:** Plataforma completa de pricing para fornecedores de licitações escolares

---

## 1. O PROBLEMA

O fornecedor precisa responder à pergunta: **"Por quanto eu vendo esse item pra essa escola?"**

Para responder, ele precisa saber:
- Quanto **eu pago** (custo do fornecedor)
- Quanto **eu cobrei antes** (histórico de preços próprios)
- Quanto **os concorrentes cobram** (preço de mercado)
- Quanto **a escola costuma pagar** (histórico SGD)
- Com que **frequência** esse item aparece (recorrência)
- Qual **minha taxa de sucesso** nesse item (ganho/perdido)

Hoje esses dados estão espalhados, sem conexão. O sistema resolve isso.

---

## 2. ARQUITETURA — DOIS LADOS DO PREÇO

```
┌─────────────────────────────────────────────────────────────────────┐
│                    BANCO DE PREÇOS UNIFICADO                        │
│                                                                     │
│  ┌──────────────┐              ┌──────────────┐                     │
│  │  LADO CUSTO  │              │  LADO VENDA  │                     │
│  │  (eu pago)   │              │  (eu cobro)  │                     │
│  └──────┬───────┘              └──────┬───────┘                     │
│         │                              │                            │
│  ┌──────┴───────┐              ┌──────┴───────┐                     │
│  │ Fontes:      │              │ Fontes:      │                     │
│  │ • Tabela forn│              │ • Pré-orçam. │                     │
│  │ • NF entrada │              │ • Contratos  │                     │
│  │ • Cotação    │              │ • NFs saída  │                     │
│  │ • B2B scrape │              │ • SGD result │                     │
│  └──────────────┘              └──────────────┘                     │
│         │                              │                            │
│         └──────────┬───────────────────┘                            │
│                    │                                                │
│              ┌─────┴─────┐                                          │
│              │  MARGEM   │                                          │
│              │ venda-custo│                                          │
│              └─────┬─────┘                                          │
│                    │                                                │
│         ┌──────────┴──────────┐                                     │
│         │  INTELIGÊNCIA       │                                     │
│         │  • Recorrência      │                                     │
│         │  • Concorrência     │                                     │
│         │  • Histórico G/P    │                                     │
│         │  • Tendência preço  │                                     │
│         │  • Score competitiv │                                     │
│         └─────────────────────┘                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. ENTIDADE CENTRAL — PRODUTO DO BANCO

Cada produto no banco de preços tem:

```
Produto: "Feijão Carioca"
├── SKU: LICT-0067
├── NCM: 0713.33.19
├── Unidade base: KG
├── Grupo: Grãos e Cereais
│
├── CUSTO (lado compra)
│   ├── custoAtual: R$ 6,20/kg
│   ├── custoMedio: R$ 6,05/kg (últimos 90 dias)
│   ├── custoMinimo: R$ 5,80/kg
│   ├── custoMaximo: R$ 6,50/kg
│   ├── fontes:
│   │   ├── { tipo: "tabela", fornecedor: "Distribuidora ABC", valor: 6.20, data: "2026-04-01" }
│   │   ├── { tipo: "nf_entrada", nf: "NFE-123", fornecedor: "ABC", valor: 6.00, data: "2026-03-15" }
│   │   └── { tipo: "cotacao", fornecedor: "XYZ", valor: 6.50, data: "2026-03-20" }
│   └── tendencia: "estavel" (+0.3% mês)
│
├── VENDA (lado venda)
│   ├── precoMedio: R$ 8,10/kg (últimos 6 meses)
│   ├── precoMinimo: R$ 7,50/kg
│   ├── precoMaximo: R$ 9,00/kg
│   ├── margemMedia: 31%
│   ├── historico:
│   │   ├── { escola: "Alceu Novaes", preco: 8.06, data: "2026-03", resultado: "ganho" }
│   │   ├── { escola: "Brasil", preco: 7.80, data: "2026-02", resultado: "ganho" }
│   │   └── { escola: "Polivalente", preco: 9.50, data: "2026-01", resultado: "perdido" }
│   └── concorrentes:
│       ├── { fornecedor: "Distribuidora X", precoMedio: 7.90, vezesGanhou: 3 }
│       └── { fornecedor: "Atacadão Y", precoMedio: 7.50, vezesGanhou: 5 }
│
└── INTELIGÊNCIA
    ├── recorrencia: 15 vezes nos últimos 12 meses
    ├── escolasQueCompram: ["Alceu Novaes", "Brasil", "Josino", ...]
    ├── taxaConversao: 73% (11 ganhos / 15 enviados)
    ├── scoreCompetitividade: 0.82 (preço médio vs concorrência)
    ├── sazonalidade: "estavel" (sem pico sazonal detectado)
    └── recomendacao: "Manter margem 30%. Item recorrente com boa taxa de conversão."
```

---

## 4. FONTES DE ALIMENTAÇÃO DO CUSTO

### 4.1 Tabela de Fornecedor (import manual)

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Usuário faz upload de planilha Excel/PDF do fornecedor |
| **Dados** | Produto, unidade, preço, validade, fornecedor |
| **Processo** | Parse → normalizar nomes → match com banco → atualizar custoBase |
| **Frequência** | Quando fornecedor manda tabela nova (mensal/trimestral) |

### 4.2 Nota Fiscal de Entrada (automático)

| Campo | Descrição |
|-------|-----------|
| **Trigger** | NF de compra importada no sistema (XML ou manual) |
| **Dados** | Itens da NF com valor unitário, NCM, fornecedor, data |
| **Processo** | Cada item da NF → match por NCM+nome → atualizar custoBase |
| **Vantagem** | Preço REAL pago, não estimativa. Mais confiável que tabela |
| **Frequência** | A cada compra realizada |

### 4.3 Cotação Pontual (manual)

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Usuário registra cotação recebida de fornecedor |
| **Dados** | Produto, preço, fornecedor, validade |
| **Processo** | Match com banco → registrar como fonte tipo "cotação" |
| **Frequência** | Sob demanda |

### 4.4 B2B Scrape (automático)

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Varredura de URLs de atacadistas/distribuidores |
| **Dados** | Produto, preço, URL fonte |
| **Processo** | IA extrai dados → match com banco → registrar como fonte "b2b" |
| **Frequência** | Configurável (semanal) |

---

## 5. FONTES DE ALIMENTAÇÃO DA VENDA

### 5.1 Pré-Orçamentos Enviados

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Pré-orçamento enviado ao SGD |
| **Dados** | Itens com preço proposto, escola, data |
| **Processo** | Cada item → registrar preço de venda proposto no histórico |

### 5.2 Resultados SGD (ganho/perdido)

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Resultado do processo (via "Checar SGD" ou "Editar Resultado") |
| **Dados** | Ganho ou perdido, escola, preço proposto |
| **Processo** | Atualizar taxaConversao, alimentar historico de preço |
| **Se ganhou** | Registrar preço como "preço aceito" — referência forte |
| **Se perdeu** | Registrar como "preço recusado" — preço estava alto |

### 5.3 Contratos Ativos

| Campo | Descrição |
|-------|-----------|
| **Trigger** | Contrato importado no GDP |
| **Dados** | Itens com preço unitário contratado, escola, vigência |
| **Processo** | Preço do contrato = preço de venda confirmado |

### 5.4 Notas Fiscais de Saída

| Campo | Descrição |
|-------|-----------|
| **Trigger** | NF-e emitida |
| **Dados** | Itens com valor unitário faturado |
| **Processo** | Preço da NF = preço REAL de venda (pode diferir do contrato) |

---

## 6. ANÁLISES DE INTELIGÊNCIA

### 6.1 Recorrência

```
Para cada produto do banco:
  recorrencia = COUNT(DISTINCT orcamentos SGD com esse item nos últimos 12 meses)
  escolasQueCompram = lista de escolas que pediram
  mediaMensal = recorrencia / 12

Uso: Priorizar itens recorrentes na formação de preço.
     Item que aparece 15x/ano merece mais atenção que item que aparece 1x.
```

### 6.2 Concorrência

```
Fontes:
  - Resultados perdidos (SGD): se perdeu, alguém cobrou menos
  - PNCP (portal nacional): preços praticados em licitações públicas
  - B2B scrape: preços de outros fornecedores

Para cada produto:
  concorrenteMaisBaixo = MIN(preços concorrentes)
  mediaConorrencia = AVG(preços concorrentes)
  scoreCompetitividade = meuPrecoMedio / mediaConcorrencia
    Se < 1.0 → eu sou mais barato (bom)
    Se > 1.1 → eu sou 10%+ mais caro (risco)
```

### 6.3 Histórico Ganho/Perdido

```
Para cada produto:
  totalEnviados = COUNT(pré-orçamentos enviados com esse item)
  totalGanhos = COUNT(resultados "ganho")
  totalPerdidos = COUNT(resultados "perdido")
  taxaConversao = totalGanhos / totalEnviados

  precoMedioGanho = AVG(preço nos ganhos)
  precoMedioPerdido = AVG(preço nos perdidos)
  
  Se precoMedioPerdido > precoMedioGanho:
    → "Quando perde, é porque cobrou mais caro"
    → Sugestão: reduzir margem pra esse item
```

### 6.4 Tendência de Preço

```
Para cada produto:
  custos_3m = custos dos últimos 3 meses
  custos_6m = custos dos últimos 6 meses
  tendencia = regressão linear simples
  
  Se tendencia > +5%: "SUBINDO" → ajustar margem pra cima
  Se tendencia < -5%: "CAINDO" → oportunidade de margem
  Senão: "ESTÁVEL"
```

### 6.5 Preço Sugerido (engine principal)

```
Para cada item de um pré-orçamento:

  custoBase = custo mais recente do lado compra
  margemBase = margem padrão do produto (default 30%)
  
  Ajustes:
    + Se taxaConversao < 50%: reduzir margem em 5pp (preço muito alto)
    + Se taxaConversao > 80%: aumentar margem em 5pp (espaço pra subir)
    + Se concorrente mais baixo < custoBase * 1.2: ajustar pra ficar competitivo
    + Se escola já comprou antes: usar preço do último ganho como referência
    + Se item recorrente (>10x/ano): manter margem menor (volume compensa)
  
  precoSugerido = custoBase * (1 + margemAjustada)
  
  Exibir:
    "Sugestão: R$ 8,06 (margem 30%)"
    "Referência: último ganho R$ 7,80 na EE Brasil"
    "Concorrente mais baixo: R$ 7,50"
    "Taxa de conversão: 73% (11/15)"
```

---

## 7. MAPA DE SOPs

```
SOP-PRECO-000  Visão Geral (ESTE DOCUMENTO)
│
├── MATCHING (Radar → Banco)
│   ├── SOP-RADAR-001  Matching Automático
│   ├── SOP-RADAR-002  Vinculação Manual
│   └── SOP-RADAR-003  Aprendizado
│
├── CUSTO (Lado Compra)
│   ├── SOP-PRECO-001  Import Tabela Fornecedor
│   ├── SOP-PRECO-002  NF de Entrada → Custo
│   ├── SOP-PRECO-003  Cotação Pontual
│   └── SOP-PRECO-004  B2B Scrape Automático
│
├── VENDA (Lado Venda)
│   ├── SOP-PRECO-005  Registro Preço Proposto (pré-orçamento)
│   ├── SOP-PRECO-006  Resultado SGD → Histórico
│   ├── SOP-PRECO-007  Contrato → Preço Confirmado
│   └── SOP-PRECO-008  NF Saída → Preço Real
│
└── INTELIGÊNCIA
    ├── SOP-PRECO-009  Análise de Recorrência
    ├── SOP-PRECO-010  Análise de Concorrência
    ├── SOP-PRECO-011  Histórico Ganho/Perdido
    ├── SOP-PRECO-012  Tendência de Preço
    └── SOP-PRECO-013  Engine de Preço Sugerido
```

---

## 8. PRIORIDADE DE IMPLEMENTAÇÃO

| Fase | SOPs | Impacto | Esforço |
|------|------|---------|---------|
| **1** | RADAR-001/002/003 + PRECO-005/006 | Pré-orçamento com preço automático + resultado alimenta banco | 3 dias |
| **2** | PRECO-001/002 | Custo real via tabela e NF entrada | 2 dias |
| **3** | PRECO-009/010/011/013 | Inteligência completa + sugestão de preço | 3 dias |
| **4** | PRECO-003/004/007/008/012 | Fontes secundárias + tendência | 2 dias |

**Fase 1 resolve 80% do problema** — o Pareto (Juran) diz: faça o que dá mais resultado primeiro.

---

**Autor:** Deming (SOP Factory)
**Metodologia:** PDCA (Deming) + Quality Trilogy (Juran) + Pareto Principle
**Próximo passo:** Rotear Fase 1 para @dev
