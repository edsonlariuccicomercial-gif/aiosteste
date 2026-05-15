# SOP-RADAR-INTEL-PRECOS-001 — Processo Operacional: Radar & Intel Preços

| Campo | Valor |
|-------|-------|
| **ID** | SOP-RADAR-INTEL-PRECOS-001 |
| **Versão** | 1.0.0 |
| **Status** | Draft |
| **Data** | 2026-05-15 |
| **Módulo** | Painel do Fornecedor — Licit-AIX |
| **Responsável** | Operador/Fornecedor |
| **Extraído de** | Código-fonte (app.js, radar-matcher.js, app-sgd-integration.js, app-results.js, app-import.js, gdp-estoque-intel.js) |

---

## 1. Propósito

Documentar o processo completo do módulo **Radar / Intel Preços**, desde a descoberta de oportunidades de licitação até a geração de contratos, incluindo inteligência de preços, cotação automatizada e análise de resultados.

---

## 2. Escopo

Cobre todo o ciclo:

1. Monitoramento de oportunidades (Radar)
2. Associação inteligente de produtos (Radar Matcher)
3. Criação e revisão de pré-orçamentos
4. Envio ao SGD
5. Registro de resultados (ganho/perda)
6. Geração de contratos (GDP)
7. Central de Preços (cadastro de produtos)
8. Analytics e rentabilidade

**Não cobre:** Gestão de contratos pós-criação (módulo GDP), gestão de estoque físico, emissão de notas fiscais.

---

## 3. Glossário

| Termo | Definição |
|-------|-----------|
| **SGD** | Sistema de Gestão de Demandas — plataforma centralizada de licitações escolares |
| **SRE** | Superintendência Regional de Ensino |
| **Banco de Preços** | Base de dados de produtos com preços de custo e venda |
| **Radar Matcher** | Engine de matching que associa itens SGD a produtos do Banco de Preços |
| **Pré-Orçamento** | Proposta de preços preparada antes do envio ao SGD |
| **GDP** | Gestão de Pedidos — módulo pós-licitação |
| **Item Mestre** | Produto canônico que agrupa aliases/variações de nome |
| **Central de Preços** | Tela de cadastro unificado de produtos com preços |

---

## 4. Pré-requisitos

- [ ] Conta configurada com dados da empresa (CNPJ, razão social, cidade, UF)
- [ ] Banco de Preços populado com pelo menos os produtos principais
- [ ] SREs de atuação selecionadas (Uberaba, Uberlândia, Passos, etc.)
- [ ] Margem padrão configurada no perfil
- [ ] Navegador com acesso à internet (sync Supabase)

---

## 5. Fluxo Macro (Visão Geral)

```
┌──────────────────────────────────────────────────────────────────────┐
│                        RADAR / INTEL PREÇOS                          │
│                                                                      │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐       │
│  │ RADAR   │───>│ ASSOCIAR │───>│ PRÉ-ORC. │───>│ ENVIO    │       │
│  │ Monitor │    │ Produtos │    │ Revisar  │    │ SGD      │       │
│  └─────────┘    └──────────┘    └──────────┘    └──────────┘       │
│       │                                              │              │
│       │                                              ▼              │
│       │                                        ┌──────────┐        │
│       │                                        │ RESULTADO│        │
│       │                                        │ Ganho/   │        │
│       │                                        │ Perdido  │        │
│       │                                        └──────────┘        │
│       │                                              │              │
│       ▼                                              ▼              │
│  ┌─────────┐                                  ┌──────────┐        │
│  │CENTRAL  │                                  │ CONTRATO │        │
│  │PREÇOS   │                                  │ GDP      │        │
│  └─────────┘                                  └──────────┘        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ ANALYTICS: KPIs, Rentabilidade, Tendências, Alertas  │           │
│  └──────────────────────────────────────────────────────┘           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 6. Processos Detalhados

### 6.1 — PROCESSO 1: Monitoramento de Oportunidades (Radar)

**Objetivo:** Identificar e filtrar oportunidades de licitação relevantes.

**Entrada:** Dados de oportunidades carregados do SGD (via importação ou API)

| Passo | Ação | Sistema/Tela | Dados |
|-------|------|--------------|-------|
| 1.1 | Acessar aba **RADAR** no menu lateral | Sidebar → ícone 📡 | — |
| 1.2 | Visualizar KPIs do dashboard | Dashboard Radar | Valor total, oportunidades abertas, prazos urgentes |
| 1.3 | Filtrar oportunidades por SRE, escola, município, grupo, status, data | Filtros do Radar | Dropdowns + campo texto |
| 1.4 | Analisar oportunidade individual | Tabela de oportunidades | ID, escola, objeto, grupo, prazo, itens |
| 1.5 | **Decisão:** Descartar ou pré-orçar | Botões na linha | `descartarOrc()` ou `gerarPreOrcamento()` |
| 1.6 | (Opcional) Seleção em lote | Checkboxes + barra batch | Selecionar múltiplas → ações batch |

**Ações Batch Disponíveis:**

| Ação | Função | Resultado |
|------|--------|-----------|
| Pré-Orçar Selecionados | `batchPreOrcamento()` | Cria pré-orçamentos automáticos para todos selecionados |
| Exportar CSV | `batchExportCsv()` | Download `orcamentos-selecionados.csv` |
| Descartar Selecionados | `descartarSelecionados()` | Move para lista de descartados |

**Saída:** Oportunidades triadas → prontas para pré-orçamento ou descartadas

---

### 6.2 — PROCESSO 2: Associação Inteligente de Produtos (Radar Matcher)

**Objetivo:** Vincular cada item da licitação SGD a um produto do Banco de Preços.

**Entrada:** Item SGD (nome, quantidade, unidade)

| Passo | Ação | Algoritmo | Score |
|-------|------|-----------|-------|
| 2.1 | Normalizar nome do produto | `normalizeProductName()`: lowercase, remover acentos, substituir sinônimos, remover marcas, filtrar noise words | — |
| 2.2 | **Camada 1:** Busca exata no dicionário de equivalências | Lookup em `radar.equivalencias.v1` | 1.0 (confirmado) |
| 2.3 | **Camada 2:** Similaridade por tokens (Jaccard) | `tokenSimilarity()`: intersecção / união de tokens | ≥ 0.6 = match |
| 2.4 | **Camada 3:** Fallback — solicita vinculação manual | Modal de seleção de produto | — |
| 2.5 | Cachear resultado para futuras buscas | Salva em `radar.equivalencias.v1` + Supabase | — |

**Seeding automático:**
- Na primeira execução, `seedFromContratos()` carrega contratos históricos e extrai SKUs vinculados
- Isso pré-popula o dicionário de equivalências antes da primeira cotação

**Saída:** Cada item SGD vinculado a um produto do Banco com preço de custo

---

### 6.3 — PROCESSO 3: Criação do Pré-Orçamento

**Objetivo:** Gerar proposta de preços completa para uma oportunidade.

| Passo | Ação | Tela | Validação |
|-------|------|------|-----------|
| 3.1 | Clicar "Pré-Orçar" na oportunidade | Radar → botão na linha | — |
| 3.2 | Modal "Associar Produtos" é exibido | Modal de associação | — |
| 3.3 | Revisar sugestões do Radar Matcher | Lista item → produto sugerido | Status: Associado / Sem Custo / Sem Cadastro |
| 3.4 | Ajustar associações manualmente se necessário | Dropdown de produtos | — |
| 3.5 | (Opcional) Criar produto novo inline | Botão "Novo Produto" | Nome obrigatório |
| 3.6 | Validar: todos associados + todos com preço | Indicadores na modal | Bloqueio se falta associação ou custo |
| 3.7 | Confirmar e criar pré-orçamento | Botão "Confirmar" | — |

**Cálculo de preços:**
```
Para cada item:
  custoUnit = produto.custoBase OU último custosFornecedor[].preco
  margem = produto.margemPadrao OU perfil.config.margemPadrao
  precoUnit = custoUnit × (1 + margem)
  precoTotal = precoUnit × quantidade
  menorConcorrente = min(produto.concorrentes[].preco)
```

**Objeto criado:**
```
preOrcamentos[orcId] = {
  orcamentoId, escola, municipio, grupo,
  status: "pendente",
  criadoEm: data,
  itens: [{ nome, quantidade, unidade, custoUnitario, precoUnitario, precoTotal, margem }],
  totalGeral: soma,
  margemMedia: média
}
```

**Saída:** Pré-orçamento com status "pendente" salvo no localStorage + sync cloud

---

### 6.4 — PROCESSO 4: Revisão e Ajuste do Pré-Orçamento

**Objetivo:** Refinar margens, revisar unidades e simular cenários antes da aprovação.

| Passo | Ação | Tela | Resultado |
|-------|------|------|-----------|
| 4.1 | Abrir pré-orçamento para revisão | Intel Preços → Pré-Orçamento | Carrega dados completos |
| 4.2 | **Revisão de Unidades** | Seção "Revisão de Unidades" | Confirmar se unidade cotada = unidade vendida |
| 4.3 | **Ajuste de Margem Global** | Slider 5-60% | Aplica mesma margem a todos os itens |
| 4.4 | **Ajuste de Margem por Item** | Clique no item → edição inline | Margem individual |
| 4.5 | **Simulador de Cenários** | Botão "Simular Cenários" | 4 cenários pré-definidos: |
| | | | — Conservador: 35% |
| | | | — Moderado: 25% |
| | | | — Agressivo: 15% |
| | | | — Ótimo: melhor preço competitivo |
| 4.6 | **Auto-Preenchimento** | Botão "Auto-Preencher" | Busca preços atualizados no Banco |
| 4.7 | Revisar totais e margem média | Rodapé da tabela | Total geral + margem média |

**Alertas automáticos:**
- Margem < 10% → ⚠️ Warning amarelo
- Preço acima do concorrente → ⚠️ Warning vermelho
- Item sem preço de custo → 🔴 Bloqueio

**Saída:** Pré-orçamento refinado → pronto para aprovação

---

### 6.5 — PROCESSO 5: Aprovação e Envio ao SGD

**Objetivo:** Aprovar a proposta e submeter ao sistema de licitação.

| Passo | Ação | Status | Condição |
|-------|------|--------|----------|
| 5.1 | Clicar "Aprovar" | pendente → **aprovado** | — |
| 5.2 | Clicar "Enviar ao SGD" | aprovado → **enviado** | Requer status "aprovado" |
| 5.3 | Sistema envia payload ao SGD | — | Inclui todos itens com preços |
| 5.4 | Confirmar envio (resposta SGD) | — | `sgdId` retornado |
| 5.5 | Pré-orçamento move para aba "Envios SGD" | — | — |

**Payload enviado:**
```
{
  orçamento_sgd, escola, municipio,
  itens: [{ idBudgetItem, nome, quantidade, unidade, custoUnitario, precoUnitario, precoTotal }],
  totalGeral, margemMedia
}
```

**Workflow de status:**
```
pendente → aprovado → enviado → ganho/perdido → finalizado
```

**Saída:** Proposta registrada no SGD → aguardando resultado

---

### 6.6 — PROCESSO 6: Registro de Resultados

**Objetivo:** Registrar se a licitação foi ganha ou perdida, alimentando analytics.

| Passo | Ação | Dados Coletados |
|-------|------|-----------------|
| 6.1 | SGD anuncia resultado | — |
| 6.2 | Operador acessa aba "Envios SGD" | — |
| 6.3 | Clicar "Registrar Resultado" | Abre modal |
| 6.4a | **Se GANHOU:** | Número do contrato, flag "gerar contrato GDP" |
| 6.4b | **Se PERDEU:** | Valor do vencedor, nome do vencedor, motivo (preço alto / critério técnico / desclassificado / outro), observações |
| 6.5 | Salvar resultado | Grava em `caixaescolar.resultados.v1` |
| 6.6 | (Se ganhou + flag ativo) Criar contrato GDP automaticamente | Insere em `gdp.contratos.v1` |

**Saída:** Resultado registrado + contrato gerado (se ganhou)

---

### 6.7 — PROCESSO 7: Central de Preços (Cadastro de Produtos)

**Objetivo:** Manter base unificada de produtos com preços de custo e venda.

| Passo | Ação | Função | Armazenamento |
|-------|------|--------|---------------|
| 7.1 | Acessar aba "Central de Preços" | `switchTab("central-precos")` | — |
| 7.2 | Visualizar tabela de produtos | `renderCentralPrecos()` | `gdp.estoque-intel.produtos.v1` |
| 7.3 | Filtrar por texto (nome, SKU, NCM) | Input com `oninput` | — |
| 7.4 | **Novo produto:** clicar "Novo" | `abrirNovoProdutoCentralPrecos()` | — |
| 7.5 | Preencher formulário | Modal com campos: nome, unidade, categoria, SKU, NCM, origem, P.Custo, P.Venda, tipo (comum/crítico) | — |
| 7.6 | Salvar | `salvarProdutoCentral()` | localStorage + `schedulCloudSync()` |
| 7.7 | **Editar produto:** clicar no nome | `editarProdutoCentralPrecos(id)` | — |
| 7.8 | **Exportar CSV** | `exportarCentralCsv()` | Download `central-produtos.csv` |

**Campos do produto:**

| Campo | Obrigatório | Tipo |
|-------|-------------|------|
| Nome | Sim | Texto |
| Unidade Base | Não | UN, KG, CX, PCT, etc. |
| Categoria | Não | Texto livre |
| SKU | Não | Código interno |
| NCM | Não | Código fiscal (8 dígitos) |
| Origem | Não | 0=Nacional, 1-8=Importação |
| Preço de Custo | Não | R$ decimal |
| Preço de Venda (Referência) | Não | R$ decimal |
| Tipo | Não | Comum / Crítico |

**Saída:** Produto cadastrado/atualizado → disponível para matching e cotações

---

### 6.8 — PROCESSO 8: Importação de Preços

**Objetivo:** Importar preços de fornecedores a partir de arquivos.

| Passo | Ação | Formatos Aceitos |
|-------|------|-----------------|
| 8.1 | Clicar "Importar Mapa de Preços" | — |
| 8.2 | Upload do arquivo | Excel (.xlsx, .xls), PDF, DOCX, Imagem (OCR), CSV |
| 8.3 | Detecção automática de formato | `detectFileType()` |
| 8.4 | OCR se necessário (PDF escaneado, imagem) | Tesseract.js |
| 8.5 | Mapeamento de colunas (auto + ajuste manual) | Produto, Custo, Venda, Unidade |
| 8.6 | Preview dos dados extraídos | Tabela preview |
| 8.7 | Conversão de unidades automática | "Caixa c/ 12" → preço unitário |
| 8.8 | Importar no Banco de Preços | Merge: atualiza existentes, cria novos |
| 8.9 | Sync + rebuild Radar Matcher | `schedulCloudSync()` + seed equivalências |

**Saída:** Banco de Preços atualizado com novos dados de fornecedor

---

### 6.9 — PROCESSO 9: Analytics e Rentabilidade

**Objetivo:** Analisar performance de cotações, margens e competitividade.

**KPIs do Dashboard:**

| KPI | Cálculo | Localização |
|-----|---------|-------------|
| Propostas Enviadas | Count de pré-orçamentos enviados | Histórico |
| Taxa de Conversão | Ganhas / (Ganhas + Perdidas) × 100 | Histórico |
| Faturamento Total | Soma do valor de contratos ganhos | Histórico |
| Margem Média | Média ponderada de margens | Histórico |
| Top 5 Categorias | Contagem por grupo de despesa | Radar |
| Oportunidades Urgentes | Prazo ≤ 3 dias | Radar |

**Análises de Rentabilidade (Histórico):**

| Dimensão | Métricas |
|----------|----------|
| Por Escola | Propostas, faturamento, custo, lucro, margem |
| Por Produto | Vezes cotado, preço médio, custo médio, margem média, volume |
| Por Grupo/Categoria | Itens, faturamento, custo, lucro, margem |

**Alertas Automáticos:**

| Alerta | Gatilho |
|--------|---------|
| Preços vencidos | Produto sem cotação > 90 dias |
| Margem baixa | Produto com margem < 10% |
| Sem competidor | Produto sem dados de concorrência |
| Acima do concorrente | Preço cotado > menor preço concorrente |

---

## 7. Armazenamento de Dados

### 7.1 Chaves localStorage

| Chave | Conteúdo | Sync Cloud |
|-------|----------|------------|
| `caixaescolar.orcamentos` | Oportunidades SGD | Sim |
| `caixaescolar.preorcamentos.v1` | Pré-orçamentos | Sim |
| `caixaescolar.banco.v1` | Banco de Preços | Sim |
| `caixaescolar.resultados.v1` | Resultados (ganho/perdido) | Sim |
| `caixaescolar.descartados` | IDs descartados | Sim |
| `caixaescolar.itens-mestres` | Itens mestres (canônicos) | Sim |
| `caixaescolar.arquivos-importados` | Registro de arquivos importados | Sim |
| `radar.equivalencias.v1` | Cache de equivalências produto | Sim |
| `gdp.estoque-intel.produtos.v1` | Produtos Central de Preços | Sim |
| `gdp.estoque-intel.embalagens.v1` | Embalagens | Sim |
| `gdp.estoque-intel.movimentacoes.v1` | Movimentações estoque | Sim |
| `gdp.estoque-intel.fornecedores.v1` | Fornecedores | Sim |
| `gdp.estoque-intel.compras.v1` | Compras | Sim |
| `gdp.equivalencias.v1` | Equivalências produto-SKU | Sim |
| `gdp.conversoes.v1` | Conversões de unidade | Sim |
| `gdp.contratos.v1` | Contratos GDP | Tabela dedicada |

### 7.2 Sync com Supabase

- **URL:** `https://mvvsjaudhbglxttxaeop.supabase.co`
- **Mecanismo:** `schedulCloudSync()` → debounce 2s → `syncToCloud()` itera `SYNC_KEYS`
- **Trigger:** Após cada operação de save
- **Fallback:** `visibilitychange` event (sync ao fechar aba)
- **Direção:** Bidirecional (upload no save, download no boot)

---

## 8. Integrações

| Sistema | Tipo | Dados Trocados |
|---------|------|----------------|
| **SGD** | Entrada/Saída | Oportunidades (entrada), propostas (saída) |
| **GDP - Contratos** | Saída | Contratos gerados a partir de licitações ganhas |
| **GDP - Estoque Intel** | Compartilhado | Base unificada de produtos (`gdp.estoque-intel.produtos.v1`) |
| **Supabase Cloud** | Backup/Sync | Todos os dados sincronizados para acesso multi-computador |
| **Tesseract.js** | OCR | Extração de texto de PDFs escaneados e imagens |

---

## 9. Regras de Negócio

| # | Regra | Enforcement |
|---|-------|-------------|
| RN-01 | Todo pré-orçamento deve ter todos os itens associados a produtos antes da aprovação | Validação no modal de associação |
| RN-02 | Todo item associado deve ter preço de custo > 0 | Validação no modal de associação |
| RN-03 | Margem padrão vem do perfil do usuário se não definida no produto | Fallback em `confirmarAssociacao()` |
| RN-04 | Pré-orçamento só pode ser enviado ao SGD com status "aprovado" | Guard em `enviarAoSgd()` |
| RN-05 | Resultado "ganho" com flag ativo gera contrato GDP automaticamente | `criarContratoGdp()` |
| RN-06 | Radar Matcher usa threshold ≥ 0.6 para sugestão automática | `tokenSimilarity()` |
| RN-07 | Equivalências confirmadas pelo usuário têm score 1.0 e são reutilizadas | Cache `radar.equivalencias.v1` |
| RN-08 | Dados sincronizam via Supabase para acesso multi-computador | `SYNC_KEYS` + `SHARED_SYNC_KEYS` |
| RN-09 | Oportunidades descartadas podem ser restauradas | `restaurarOrc()` |
| RN-10 | Preços aprovados em pré-orçamento ficam "travados" (não são atualizados retroativamente) | Apenas novos pré-orçamentos usam preços atualizados |

---

## 10. Tratamento de Exceções

| Exceção | Ação | Responsável |
|---------|------|-------------|
| Item SGD sem match no Banco | Exibir modal para vincular manualmente ou criar produto | Operador |
| Produto sem preço de custo | Bloquear aprovação, alertar operador | Sistema |
| Falha no sync Supabase | Dados preservados no localStorage, retry na próxima operação | Sistema (auto-retry) |
| SGD offline/erro no envio | Manter status "aprovado", notificar operador | Sistema |
| Arquivo importado com formato irreconhecível | Mostrar erro + sugerir formatos aceitos | Sistema |
| OCR com baixa confiança | Marcar campo `confianca < 0.5`, flag para revisão | Sistema |

---

## 11. Métricas de Controle

| Métrica | Meta | Frequência |
|---------|------|------------|
| Taxa de conversão (ganhos/total) | ≥ 30% | Mensal |
| Margem média dos pré-orçamentos | 20-35% | Por cotação |
| Tempo médio de cotação | < 15 min por oportunidade | Semanal |
| Produtos sem cotação > 90 dias | 0 (ideal) | Semanal |
| Taxa de match automático (Radar Matcher) | ≥ 70% | Mensal |

---

## 12. Arquivos-Fonte do Código

| Arquivo | Responsabilidade |
|---------|-----------------|
| `app.js` | Boot, filtros, pré-orçamento, Central de Preços, renderização |
| `app-state.js` | Estado global, constantes, SYNC_KEYS |
| `app-import.js` | Importação multi-formato (Excel, PDF, OCR) |
| `app-sync.js` | Cloud sync com Supabase |
| `app-sgd-integration.js` | Integração SGD, envio, fila |
| `app-results.js` | Registro de resultados, criação de contratos |
| `radar-matcher.js` | Engine de matching por similaridade |
| `js/banco-precos-client.js` | Cliente API do Banco de Preços |
| `js/gdp-estoque-intel.js` | Módulo de estoque inteligente |
| `js/gdp-core.js` | Core GDP (save/load, cloudSave) |
| `js/gdp-banco-produtos.js` | Gestão de produtos GDP |
| `index.html` | Interface principal (tabs, modals, forms) |

---

## 13. Histórico de Revisão

| Versão | Data | Autor | Alteração |
|--------|------|-------|-----------|
| 1.0.0 | 2026-05-15 | Deming (SOP Factory) | Extração inicial do código-fonte — mapeamento completo |

---

*Extraído pela SOP Factory — Deming Orchestrator*
*Método: Code-source extraction via @sop-extractor + @analyst handoff*
