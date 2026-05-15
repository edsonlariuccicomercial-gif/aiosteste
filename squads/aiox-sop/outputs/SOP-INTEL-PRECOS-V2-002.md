# SOP-INTEL-PRECOS-V2-002 — Redesign: Intel Preços v2 — Arquitetura 6 Camadas

| Campo | Valor |
|-------|-------|
| **ID** | SOP-INTEL-PRECOS-V2-002 |
| **Versão** | 2.0.0 |
| **Status** | Draft |
| **Data** | 2026-05-15 |
| **Atualizado** | 2026-05-15 |
| **Módulo** | Painel do Fornecedor — Licit-AIX |
| **Tipo** | Redesign Arquitetural (TO-BE) |
| **Baseline** | SOP-RADAR-INTEL-PRECOS-001 (AS-IS) |
| **Responsável** | Operador/Fornecedor + Sistema |

---

## 1. Propósito

Redesenhar o módulo Intel Preços com arquitetura de 6 camadas, eliminando bancos de preços fragmentados por fornecedor, implementando central de produtos única, motor de precificação inteligente, e histórico de licitações como componente de decisão estratégica.

Contexto regulatório: fornecedor que vende para o governo via licitações escolares (Caixas Escolares MG), regido pela **Lei 14.133/2021** (Nova Lei de Licitações) e **Decreto 11.462/2023**.

---

## 1.1 Fundamentação Teórica — Metodologias Certificadas

Esta arquitetura é fundamentada em 6 frameworks da literatura de procurement, precificação e gestão de dados:

### A. Should-Cost Analysis (Dept. Defesa EUA / McKinsey)

Decompõe o preço em camadas para determinar o preço justo. McKinsey classifica em 3 níveis que mapeiam diretamente aos nossos cenários:

| Nível McKinsey | Nosso cenário | Definição |
|----------------|---------------|-----------|
| **Does-Cost** | Conservador | Quanto pago hoje + margem segura |
| **Should-Cost** | Sugerido | Quanto deveria custar (mediana de vencedores) |
| **Could-Cost** | Agressivo | Mínimo teórico viável |

### B. Matriz de Kraljic (HBR, 1983)

Classifica produtos por impacto no lucro × risco de suprimento:

| Quadrante | Exemplo escolar | Estratégia de preço |
|-----------|----------------|---------------------|
| **Não-crítico** (baixo risco, baixo impacto) | Clips, borracha | Menor preço, automatizar |
| **Alavancagem** (baixo risco, alto impacto) | Arroz, feijão, papel A4 | Negociar agressivo, volume |
| **Gargalo** (alto risco, baixo impacto) | Produto regional específico | Margem conservadora, garantir |
| **Estratégico** (alto risco, alto impacto) | Kit alimentação especial | Parceria, equilíbrio |

A classificação Kraljic influencia o cenário default do Motor de Precificação.

### C. Total Cost of Ownership — TCO (ISM/CIPS)

Vai além do preço unitário — inclui 7 camadas de custo:

| Camada TCO | Aplicação |
|------------|-----------|
| 1. Aquisição | Preço do produto |
| 2. Operação | Frete, armazenamento |
| 3. Manutenção | Validade, perecibilidade |
| 4. Inventário/Financeiro | Prazo de pagamento, custo de capital |
| 5. Risco | Fornecedor único, não-entrega |
| 6. ESG | Não aplicável diretamente |
| 7. Descarte | Não aplicável a revenda |

### D. PIM — Product Information Management (Pimcore/MDM)

Separa dados mestres (fixos) de dados transacionais (dinâmicos):

| Tipo de dado | Onde fica | Exemplo |
|-------------|-----------|---------|
| **Dado mestre** (PIM) | Camada 1 — Central de Produtos | Nome, SKU, NCM, categoria |
| **Dado transacional** | Camada 2 — Custos Fornecedores | Preço, fornecedor, data, validade |
| **Normalização** | Camada 3 — Normalizador | Aliases, equivalências |

Regra PIM: *"Preços NÃO ficam no cadastro do produto — ficam em tabela separada ligada por produto_id."*

### E. Mark-up Multiplicador (Precificação para Licitações)

Fórmula padrão para fornecedores governamentais:

```
PREÇO DE VENDA = CUSTO × MARK-UP

Mark-up = 1 / (1 - (Frete% + CI% + Tributos% + Margem%))
```

| Componente | % típico | Descrição |
|------------|----------|-----------|
| Frete | 3-8% | Varia por região/distância |
| Custos Indiretos | 5-10% | Admin, aluguel, depreciação |
| Tributos | 4-17% | Depende do regime (Simples/Presumido/Real) |
| Margem de Lucro | 5-20% | Varia por Kraljic + competitividade |

### F. Lei 14.133/2021 + Decreto 11.462/2023 — Pesquisa de Preços

O governo forma o preço de referência usando "cesta de preços":

| Fonte governamental | Inteligência para o fornecedor |
|---------------------|-------------------------------|
| Compras.gov.br (licitações anteriores) | Nosso Histórico (Camada 4) replica essa visão |
| Painel de Preços (banco federal) | Benchmark externo |
| Cotações de fornecedores | Nossos preços alimentam a cesta |
| Contratações similares | Monitorar preços de outras escolas |

**TCU (Acórdão 1712/2025):** O governo deve diversificar fontes. O preço de referência já considera histórico de contratos — nosso Histórico é inteligência espelhada.

**Métodos de cálculo do governo:** média, mediana, ou menor dos valores (mínimo 3 preços). Nosso Motor deve gerar os 3.

### G. Inteligência Competitiva (FedBiz365/Hermix)

Dados internacionais de impacto:

| Insight | Dado |
|---------|------|
| Win rate com intelligence | **+47%** vs sem intelligence |
| Menor preço nem sempre ganha | Só ganha **31%** em best-value |
| AI economiza | **15h por ciclo** de bid |
| Rating bom | **2.7×** mais vitórias |

---

## 2. Problemas do AS-IS (SOP-001)

| # | Problema | Impacto |
|---|----------|---------|
| P1 | Apenas 3 SREs configuradas (Uberaba, Uberlândia, Passos) — faltam as demais do estado | Perde oportunidades em outras regiões |
| P2 | Varredura varre TODAS as SREs sem filtro — lenta | Tempo desperdiçado em SREs sem interesse |
| P3 | Resultados (ganho/perdido) são registrados manualmente 1 a 1 | 141+ propostas perdidas sem registro, sem analytics |
| P4 | Batch pré-orçar sem match = item sem produto, sem opção de criar na hora | Operador precisa sair do fluxo para cadastrar produto |
| P5 | Download de payload JSON (sgdBaixarPayload) sem utilidade clara | Feature sem uso, causa confusão de status |
| P6 | Banco de Preços mistura produtos, custos e fornecedores em 1 array plano | Impossível rastrear evolução de custo por fornecedor |
| P7 | Sem motor de precificação — margem é fixa ou manual | Não considera concorrência, região, histórico |
| P8 | Histórico de licitações desconectado do motor de decisão | Dados existem mas não alimentam cenários |

---

## 3. Arquitetura TO-BE — 6 Camadas

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTEL PREÇOS v2 — 6 CAMADAS                  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 1: CENTRAL DE PRODUTOS (Base única e fixa)        │   │
│  │ Cadastro mestre: id, nome, unidade, categoria, SKU, NCM  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 2: CUSTOS FORNECEDORES (Valores dinâmicos)        │   │
│  │ produto_id → fornecedor, custo, data, validade, região   │   │
│  │ Fontes: Excel, PDF, B2B, NF, API, Marketplace            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 3: NORMALIZADOR (Motor de associação)             │   │
│  │ "Papel rolão 300mts" = "Papel higiênico rolão 300m cx/8" │   │
│  │ IA + embeddings + similaridade + regras manuais           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 4: HISTÓRICO LICITAÇÕES (Inteligência competitiva)│   │
│  │ escola, cidade, produto_id, preço_vencedor, participou,  │   │
│  │ ganhou, empresa_vencedora, data                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 5: MOTOR DE PRECIFICAÇÃO                          │   │
│  │ Entrada: custo, histórico, região, margem, concorrência  │   │
│  │ Saída: preço sugerido, agressivo, risco, margem estimada │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          ▲                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ CAMADA 6: ESTRATEGISTA IA (Cenários e decisão)           │   │
│  │ Análise preditiva, simulação de cenários, recomendações  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Fluxo Principal TO-BE

```
SGD (todas SREs MG, com filtro seletivo)
    ↓
LEITOR DE ITENS (varredura com filtro de SREs ativas)
    ↓
NORMALIZADOR (match IA + embeddings + regras)
    ↓
    ├── Match encontrado → CENTRAL DE PRODUTOS (produto existente)
    └── Sem match → CRIAR PRODUTO INLINE (modal rápido no fluxo)
    ↓
BUSCA CUSTOS ATUAIS (tabela custos_fornecedores)
    ↓
MOTOR DE PRECIFICAÇÃO (preço sugerido + agressivo + risco)
    ↓
GERAÇÃO DA COTAÇÃO (pré-orçamento com cenários)
    ↓
ENVIO SGD
    ↓
RESULTADO AUTOMÁTICO (varredura SGD → registra ganho/perda em batch)
    ↓
HISTÓRICO LICITAÇÕES (alimenta motor de decisão)
```

---

## 5. Processos Detalhados

### 5.1 — PROCESSO 1: Varredura SGD — Todas as SREs com Filtro Seletivo

**Mudança:** Expandir de 3 SREs para TODAS do estado de MG, com filtro configurável.

| Passo | Ação | Detalhe |
|-------|------|---------|
| 1.1 | Configuração de SREs | Tela de configuração com TODAS as SREs de MG listadas |
| 1.2 | Seleção de SREs ativas | Checkboxes: operador seleciona quais SREs quer varrer |
| 1.3 | Perfil de varredura | Salvar perfil: "Rápido" (3 SREs), "Regional" (10), "Completo" (todas) |
| 1.4 | Varredura seletiva | Sistema varre APENAS SREs selecionadas → mais rápido |
| 1.5 | Indicador de progresso | Barra: "Varrendo SRE 3/10 — Uberlândia..." |
| 1.6 | Cache inteligente | SREs já varridas no dia não são re-varridas (cache 24h) |

**Regra:** Filtro de SREs é persistido no perfil do operador (`nexedu.empresa.sresAtivas`).

**Dados — Lista completa de SREs de MG:**

| # | SRE | Região |
|---|-----|--------|
| 1 | Almenara | Norte |
| 2 | Araçuaí | Norte |
| 3 | Barbacena | Central |
| 4 | Campo Belo | Oeste |
| 5 | Carangola | Leste |
| 6 | Caratinga | Leste |
| 7 | Caxambu | Sul |
| 8 | Conselheiro Lafaiete | Central |
| 9 | Coronel Fabriciano | Leste |
| 10 | Curvelo | Central |
| 11 | Diamantina | Norte |
| 12 | Divinópolis | Oeste |
| 13 | Governador Valadares | Leste |
| 14 | Guanhães | Leste |
| 15 | Itajubá | Sul |
| 16 | Ituiutaba | Triângulo |
| 17 | Janaúba | Norte |
| 18 | Januária | Norte |
| 19 | Juiz de Fora | Zona da Mata |
| 20 | Leopoldina | Zona da Mata |
| 21 | Manhuaçu | Leste |
| 22 | Metropolitana A (BH) | Metropolitana |
| 23 | Metropolitana B (BH) | Metropolitana |
| 24 | Metropolitana C (BH) | Metropolitana |
| 25 | Monte Carmelo | Triângulo |
| 26 | Montes Claros | Norte |
| 27 | Muriaé | Zona da Mata |
| 28 | Nova Era | Central |
| 29 | Ouro Preto | Central |
| 30 | Pará de Minas | Central |
| 31 | Paracatu | Noroeste |
| 32 | Passos | Sul |
| 33 | Patos de Minas | Alto Paranaíba |
| 34 | Patrocínio | Alto Paranaíba |
| 35 | Pirapora | Norte |
| 36 | Poços de Caldas | Sul |
| 37 | Ponte Nova | Zona da Mata |
| 38 | Pouso Alegre | Sul |
| 39 | São João del Rei | Central |
| 40 | São Sebastião do Paraíso | Sul |
| 41 | Sete Lagoas | Central |
| 42 | Teófilo Otoni | Norte |
| 43 | Ubá | Zona da Mata |
| 44 | Uberaba | Triângulo |
| 45 | Uberlândia | Triângulo |
| 46 | Unaí | Noroeste |
| 47 | Varginha | Sul |

---

### 5.2 — PROCESSO 2: Registro Automático de Resultados (Varredura SGD)

**Mudança:** Em vez de registrar resultado 1 a 1, o sistema varre o SGD e registra em batch.

| Passo | Ação | Detalhe |
|-------|------|---------|
| 2.1 | Varredura de resultados SGD | Sistema consulta API SGD para propostas com status final |
| 2.2 | Match com pré-orçamentos enviados | Cruza `sgdId` do pré-orçamento com resultado SGD |
| 2.3 | Registro automático GANHO | Se vencedor = empresa do operador → status "ganho" |
| 2.4 | Registro automático PERDIDO | Se vencedor ≠ empresa → status "perdido" + dados do vencedor |
| 2.5 | Dados capturados (perdido) | `valorVencedor`, `fornecedorVencedor`, `deltaTotalPercent` |
| 2.6 | Dados capturados (ganho) | `valorContrato`, `numContrato`, flag auto-gerar contrato GDP |
| 2.7 | Consolidação | Dashboard atualiza: taxa conversão, faturamento, perdas acumuladas |
| 2.8 | Histórico retroativo | Importar as 141 propostas perdidas existentes via CSV/Excel |

**Regra:** Varredura de resultados roda automaticamente junto com varredura de oportunidades, ou sob demanda com botão "Atualizar Resultados".

**Output para Camada 4 (Histórico):**
```
Para cada resultado registrado:
  → historico_licitacoes.push({
       escola, cidade, produto_id, preco_vencedor,
       empresa_vencedora, participou: true,
       ganhou: boolean, data
     })
```

---

### 5.3 — PROCESSO 3: Criação de Produto Inline (Batch Pré-Orçamento)

**Mudança:** Quando batch pré-orçar encontra item sem match, permitir criação rápida.

| Passo | Ação | Detalhe |
|-------|------|---------|
| 3.1 | Batch pré-orçar detecta "sem_match" | Item SGD sem produto associado |
| 3.2 | Exibir modal de criação rápida | Campos mínimos: Nome, Unidade, Categoria |
| 3.3 | Auto-preenchimento | Nome vem do item SGD, unidade inferida, categoria do grupo |
| 3.4 | Salvar produto na Central | Grava em `central_produtos` + sync cloud |
| 3.5 | Auto-vincular ao item SGD | Produto recém-criado é automaticamente associado ao item |
| 3.6 | Continuar batch | Próximo item sem match → mesmo fluxo |
| 3.7 | Resumo final | "X produtos criados, Y associados, Z sem custo" |

**Regra:** Produto criado inline tem flag `origem: "batch-pre-orcamento"` para rastreabilidade.

---

### 5.4 — PROCESSO 4: Remoção de Download Payload

**Mudança:** Remover `sgdBaixarPayload()` e `sgdBaixarTodos()` do fluxo.

| Ação | Detalhe |
|------|---------|
| Remover botão "Baixar Payload" da UI | Não tem utilidade operacional |
| Remover botão "Baixar Todos" da UI | Idem |
| Remover funções JS | `sgdBaixarPayload()`, `sgdBaixarTodos()`, `sgdBaixarTodosPdf()` |
| Manter apenas envio via API | Fluxo: Aprovar → Enviar ao SGD (API) |

---

### 5.5 — PROCESSO 5: Central de Produtos — Camada 1 (Base Única)

**Mudança:** Consolidar todos os bancos em 1 central única.

**Estrutura da tabela `central_produtos`:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | ID único (PROD-timestamp-random) |
| nome | string | Sim | Nome canônico do produto |
| unidade_base | string | Sim | UN, KG, CX, PCT, L, etc. |
| categoria | string | Não | Alimentos, Limpeza, Escritório, etc. |
| sku | string | Não | Código interno |
| ncm | string | Não | Código fiscal 8 dígitos |
| origem | string | Não | 0-Nacional, 1-8 Importação |
| produto_critico | boolean | Não | Flag de item crítico |
| classificacao_kraljic | enum | Não | nao-critico / alavancagem / gargalo / estrategico (Matriz de Kraljic) |
| ncm_tributacao | string | Não | Classificação fiscal para cálculo de tributos |
| ativo | boolean | Sim | Soft delete |
| criadoEm | datetime | Sim | Data de criação |
| atualizadoEm | datetime | Sim | Última atualização |

**Regra fundamental:**
```
NÃO criar:           CRIAR:
├─ banco fornecedor A   ├─ 1 central única (central_produtos)
├─ banco fornecedor B   ├─ N registros de custo (custos_fornecedores)
└─ banco fornecedor C   └─ Decisão baseada em dados

PRODUTO → MÚLTIPLOS CUSTOS → DECISÃO
```

---

### 5.6 — PROCESSO 6: Custos Fornecedores — Camada 2 (Valores Dinâmicos)

**Estrutura da tabela `custos_fornecedores`:**

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| id | string | Sim | ID único |
| produto_id | string | Sim | FK → central_produtos.id |
| fornecedor | string | Sim | Nome do fornecedor |
| custo | number | Sim | Preço unitário |
| data_coleta | date | Sim | Data da cotação |
| validade | date | Não | Até quando o preço é válido |
| regiao | string | Não | Região de aplicação |
| origem | string | Sim | "excel", "pdf", "nf", "api", "b2b", "marketplace", "manual" |
| confiabilidade | number | Não | Score 0-1 (OCR=0.5, NF=1.0, manual=0.9) |
| frete_estimado | number | Não | Custo de frete por unidade (TCO camada 2) |
| prazo_pagamento_dias | number | Não | Prazo de pagamento em dias (TCO camada 4) |
| condicao_pagamento | string | Não | "a_vista", "30d", "60d", "90d" (TCO custo financeiro) |
| arquivo_id | string | Não | Referência ao arquivo importado |

**Fontes de custo unificadas:**

| Fonte | Origem Tag | Confiabilidade |
|-------|-----------|----------------|
| Excel importado | `excel` | 0.95 |
| PDF (texto) | `pdf` | 0.85 |
| PDF (OCR) | `pdf-ocr` | 0.50 |
| Nota Fiscal XML | `nf` | 1.00 |
| API externa | `api` | 0.90 |
| B2B/Marketplace | `b2b` | 0.85 |
| Digitação manual | `manual` | 0.90 |

---

### 5.7 — PROCESSO 7: Normalizador — Camada 3 (Motor de Associação)

**Evolução do Radar Matcher atual para Normalizador multi-camada.**

| Camada | Método | Threshold | Resultado |
|--------|--------|-----------|-----------|
| N1 | Equivalência confirmada (dicionário) | Score 1.0 | Match definitivo |
| N2 | Similaridade por tokens (Jaccard) | ≥ 0.7 | Sugestão com revisão |
| N3 | Embeddings semânticos (futuro) | ≥ 0.8 cosine | Match inteligente |
| N4 | Regras manuais (regex patterns) | Exato | Match por padrão |
| N5 | Fallback — criar produto inline | — | Novo produto |

**Exemplos de normalização:**

| Descrição SGD | Produto Central | Método |
|---------------|----------------|--------|
| "Papel rolão 300mts" | "Papel higiênico rolão 300m cx c/8" | N2 (tokens) |
| "Arroz tipo 1 5kg" | "Arroz tipo 1 5kg" | N1 (exato) |
| "Detergente liq neutro 500ml" | "Detergente líquido neutro 500ml" | N2 (tokens) |
| "Material limpeza diversos" | — | N5 (criar) |

---

### 5.8 — PROCESSO 8: Histórico de Licitações — Camada 4 (Inteligência Competitiva)

**Estrutura da tabela `historico_licitacoes`:**

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | string | ID único |
| escola | string | Nome da escola |
| cidade | string | Município |
| sre | string | SRE responsável |
| produto_id | string | FK → central_produtos.id |
| descricao_item | string | Descrição original do item no SGD |
| preco_proposto | number | Nosso preço |
| preco_vencedor | number | Preço do vencedor |
| empresa_vencedora | string | Nome do vencedor |
| participou | boolean | Se participamos |
| ganhou | boolean | Se ganhamos |
| motivo_perda | string | Se perdeu: preço, técnico, desclassificação |
| delta_percent | number | % diferença nosso vs vencedor |
| data | date | Data do resultado |
| orcamento_sgd_id | string | Ref ao orçamento SGD |

**Analytics derivados:**

| Métrica | Cálculo | Uso |
|---------|---------|-----|
| Taxa de conversão por SRE | ganhos / participações por SRE | Focar nas SREs mais competitivas |
| Margem média dos vencedores | avg(preco_vencedor) por produto | Calibrar motor de precificação |
| Concorrentes frequentes | count(empresa_vencedora) ranking | Mapear competição |
| Sensibilidade de preço | correlação delta% vs ganho | Descobrir threshold de competitividade |
| Sazonalidade | tendência por mês/trimestre | Ajustar estratégia temporal |

---

### 5.9 — PROCESSO 9: Motor de Precificação — Camada 5

**Configuração da Empresa (uma vez):**

| Parâmetro | Tipo | Descrição |
|-----------|------|-----------|
| `regime_tributario` | enum | "simples" / "presumido" / "real" |
| `aliquota_tributos_pct` | number | % de tributos sobre faturamento (ex: 6% Simples) |
| `custos_indiretos_pct` | number | % de custos indiretos (admin, aluguel) — típico 5-10% |
| `frete_padrao_pct` | number | % de frete padrão — típico 3-8% |
| `margem_minima_pct` | number | Margem mínima aceitável — típico 5% |
| `margem_desejada_pct` | number | Margem target — típico 15-20% |

**Entrada (por item):**

| Dado | Fonte |
|------|-------|
| Custo unitário | Camada 2 — menor custo válido do produto |
| Frete específico | Camada 2 — `frete_estimado` ou `frete_padrao_pct` da config |
| Classificação Kraljic | Camada 1 — influencia cenário default |
| Histórico de preços vencedores | Camada 4 — por produto + região |
| Região da escola | SGD — municipio/SRE |
| Concorrência conhecida | Camada 4 — empresas que competem na região |

**Fórmula — Mark-up Multiplicador (padrão licitações):**

```
Mark-up = 1 / (1 - (Frete% + CI% + Tributos% + Margem%))
Preço de Venda = Custo × Mark-up
```

**Exemplo:**
```
Custo: R$ 18,00 (arroz 5kg)
Frete: 5% | CI: 8% | Tributos: 6% (Simples) | Margem: 15%
Mark-up = 1 / (1 - 0.34) = 1.515
Preço = R$ 18,00 × 1.515 = R$ 27,27
```

**Saída — 3 cenários (Should-Cost Analysis / McKinsey):**

| Cenário | Nome técnico | Cálculo | Uso |
|---------|-------------|---------|-----|
| **Conservador** | Does-Cost | custo × mark-up(margem=20%) | Protege margem — itens Gargalo/Estratégico |
| **Sugerido** | Should-Cost | mediana(preços_vencedores) ajustada por mark-up | Balanceado — máxima chance de lucro |
| **Agressivo** | Could-Cost | custo × mark-up(margem=margem_minima) | Maximiza chance de ganhar — itens Alavancagem |

**Influência Kraljic no cenário default:**

| Classificação | Cenário default | Razão |
|---------------|----------------|-------|
| Não-crítico | Agressivo | Baixo risco, competir por preço |
| Alavancagem | Agressivo | Volume compensa margem baixa |
| Gargalo | Conservador | Garantir entrega, proteger margem |
| Estratégico | Sugerido | Equilíbrio entre margem e competitividade |

**Indicadores por cenário:**

| Indicador | Descrição | Fórmula |
|-----------|-----------|---------|
| Margem líquida (%) | Margem real após todos os custos | (preço - custo_total) / preço × 100 |
| Mark-up aplicado | Multiplicador usado | 1 / (1 - soma%) |
| Probabilidade de ganho (%) | Baseado em histórico | % das vezes que esse preço teria ganhado |
| Competitiveness Index | Posição vs mercado | nosso_preço / mediana_vencedores |
| Risco | Classificação | Baixo (margem>20%), Médio (10-20%), Alto (<10%) |
| Price-to-Win | Preço estimado para ganhar | Mediana dos preços vencedores na região |

**Métricas de inteligência competitiva (Camada 4 → Camada 5):**

| Métrica | Fórmula | Uso |
|---------|---------|-----|
| Win Rate | Ganhos / (Ganhos + Perdidos) | Eficácia geral |
| Win Rate por SRE | Ganhos_SRE / Total_SRE | Focar nas SREs mais competitivas |
| Margin Erosion Rate | Δ% margem ao longo do tempo | Detectar perda de competitividade |
| Supplier Concentration Risk | % custos de 1 fornecedor / total | Risco de dependência |
| Cost Trend | Δ% custo por fornecedor no tempo | Antecipar aumentos |

---

### 5.10 — PROCESSO 10: Estrategista IA — Camada 6 (Futuro)

**Funcionalidades futuras:**

| Feature | Descrição | Prioridade |
|---------|-----------|------------|
| Previsão de demanda | Quais produtos terão mais licitações no próximo trimestre | P2 |
| Recomendação de SREs | Quais SREs expandir baseado em taxa de conversão | P2 |
| Alerta de oportunidade | Push quando licitação de alto potencial é publicada | P3 |
| Simulador de portfólio | "Se eu ganhar X% das propostas do mês, qual o faturamento?" | P3 |
| Otimizador de margem | ML que aprende a margem ideal por produto × região | P4 |

---

## 6. Regra Fundamental — Modelo de Dados

```
                    ┌──────────────────┐
                    │ CENTRAL_PRODUTOS │ (1 tabela, base fixa)
                    │ id, nome, SKU... │
                    └────────┬─────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
   ┌──────────────┐ ┌───────────────┐ ┌──────────────┐
   │ CUSTOS_FORN  │ │ HISTORICO_LIC │ │ NORMALIZADOR │
   │ produto_id→  │ │ produto_id→   │ │ produto_id→  │
   │ N custos     │ │ N resultados  │ │ N aliases    │
   └──────────────┘ └───────────────┘ └──────────────┘
              │              │
              ▼              ▼
        ┌────────────────────────┐
        │   MOTOR PRECIFICAÇÃO   │
        │ custo + hist → cenário │
        └────────────────────────┘
```

**PROIBIDO:** Criar banco por fornecedor (banco A, banco B, banco C).
**CORRETO:** 1 central + N custos por produto.

---

## 7. Prioridade de Implementação (Épicos)

| # | Épico | Escopo | Dependência |
|---|-------|--------|-------------|
| **E1** | Central de Produtos v2 | Migrar para tabela única, CRUD completo, sync Supabase | — |
| **E2** | Importador Multi-Fonte | PDF/Excel/NF → custos_fornecedores (tabela separada) | E1 |
| **E3** | Normalizador v2 | Evoluir Radar Matcher → multi-camada + criar inline | E1 |
| **E4** | SREs Completas + Filtro | 47 SREs MG + perfis de varredura + cache | — |
| **E5** | Resultados Automáticos | Varredura SGD batch + histórico retroativo (141 propostas) | E4 |
| **E6** | Histórico Licitações | Tabela + analytics + dashboard competitivo | E5 |
| **E7** | Motor de Precificação | 3 cenários + probabilidade + risco | E1, E2, E6 |
| **E8** | Remoção Payload Download | Limpar UI e código | — |
| **E9** | Estrategista IA | ML, previsões, recomendações | E7 |

**Sequência sugerida:**

```
Wave 1 (Fundação):     E1 + E4 + E8 (paralelo)
Wave 2 (Dados):        E2 + E3 (paralelo, dependem de E1)
Wave 3 (Inteligência): E5 + E6 (sequencial, dependem de E4)
Wave 4 (Motor):        E7 (depende de E1+E2+E6)
Wave 5 (IA):           E9 (depende de tudo)
```

---

## 8. Métricas de Sucesso

| Métrica | Meta | Baseline atual |
|---------|------|----------------|
| SREs cobertas | 47 | 3 |
| Tempo de varredura (10 SREs) | < 2 min | N/A |
| Taxa de match automático (Normalizador) | ≥ 85% | ~70% |
| Resultados registrados automaticamente | 100% | 0% (manual) |
| Produtos criados inline por batch | Sem limite | 0 (impossível) |
| Cenários de precificação | 3 por item | 0 (margem fixa) |
| Histórico de licitações acessível | Dashboard completo | Parcial |

---

## 9. Histórico de Revisão

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0.0 | 2026-05-15 | Deming (SOP Factory) | Criação do SOP TO-BE a partir de briefing do operador |
| 2.0.0 | 2026-05-15 | Deming + Atlas (Analyst) | Incorporação de 6 metodologias certificadas: Should-Cost (McKinsey), Kraljic (HBR), TCO (ISM/CIPS), PIM (Pimcore/MDM), Mark-up Multiplicador, Lei 14.133/2021 + Inteligência Competitiva. Camada 1 com Kraljic, Camada 2 com TCO expandido, Camada 5 reformulada com Mark-up |

---

*SOP Factory — Deming Orchestrator*
*Método: Process design from operator briefing + AS-IS baseline analysis*
