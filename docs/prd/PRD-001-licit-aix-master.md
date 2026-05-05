# PRD-001: Licit-AIX — PRD Master

**Produto:** Licit-AIX
**Autor:** Morgan (@pm)
**Versao:** 1.0
**Data:** 2026-05-05
**Status:** Definitivo (baseado no sistema em producao)
**Referencia:** docs/architecture/system-architecture.md

---

## 1. PROBLEMA

Fornecedores de alimentacao escolar em Minas Gerais participam de centenas de processos licitatorios por ano via SGD (Sistema de Gestao de Demandas). O ciclo completo — desde captar orcamentos ate entregar mercadoria e receber pagamento — envolve dezenas de etapas manuais, planilhas desconectadas e retrabalho constante.

**Dores principais:**
- Captar orcamentos do SGD manualmente (copiar/colar de cada escola)
- Precificar itens sem historico de precos confiavel
- Gerenciar contratos, saldos e pedidos em planilhas
- Emitir NF-e manualmente e controlar cobrancas
- Controlar estoque e demanda sem inteligencia
- Escolas sem acesso para fazer pedidos ou acompanhar saldo
- Entregas sem registro fotografico/assinatura digital

---

## 2. VISAO

Um sistema unico que cobre todo o ciclo pos-licitacao: da captacao do orcamento ate o recebimento do pagamento, com inteligencia de precos, portal para escolas e apps moveis para entregadores.

---

## 3. USUARIO-ALVO

**Persona primaria:** Edson — fornecedor de alimentos para caixas escolares em MG
- Participa de ~150+ processos licitatorios/ano
- Atende 35+ escolas com contratos ativos
- Vende ~150+ itens alimenticios diferentes
- Opera com equipe pequena (1-3 pessoas)

**Personas secundarias:**
- Escolas (caixas escolares) — fazem pedidos e acompanham saldo via Portal Escolar
- Motoristas — registram entregas via app mobile

---

## 4. MODULOS DO SISTEMA

### 4.1 HOME (dashboard-home.html)

**Proposito:** Painel inicial com acesso rapido aos modulos.

**Funcionalidades:**
- FR-HOME-1: Cards de acesso rapido para cada modulo (RADAR, Intel Precos, GDP)
- FR-HOME-2: Indicadores resumidos de orcamentos, contratos e pedidos

---

### 4.2 RADAR (index.html — aba RADAR)

**Proposito:** Captar orcamentos abertos no SGD e gerenciar propostas.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-RADAR-1 | Varredura automatica do SGD (listar orcamentos por status: aberto, enviado, aprovado, recusado) | Ativo |
| FR-RADAR-2 | Filtros por SRE, escola, municipio, grupo de despesa, status, texto livre | Ativo |
| FR-RADAR-3 | KPIs do topo: orcamentos abertos, urgentes, pendentes, faturamento potencial, margem media | Ativo |
| FR-RADAR-4 | Painel de inteligencia: valor total, taxa conversao, prazo medio, top categorias, por municipio | Ativo |
| FR-RADAR-5 | Selecao em lote de orcamentos para pre-orcar em batch | Ativo |
| FR-RADAR-6 | Criacao de Pre-Orcamento com itens, margem, frete por orcamento | Ativo |
| FR-RADAR-7 | Matching automatico de itens do orcamento com banco de precos (3 camadas: dicionario, seed contratos, fuzzy) | Ativo |
| FR-RADAR-8 | Modal de vinculacao manual de produto com busca e criacao | Ativo |
| FR-RADAR-9 | Revisao de cotacao pre-envio (validar unidades, precos, quantidades) | Ativo |
| FR-RADAR-10 | Envio de proposta ao SGD (modo local server ou browser direto) | Ativo |
| FR-RADAR-11 | Geracao de PDF da proposta | Ativo |
| FR-RADAR-12 | Registro de resultado (ganho/perdido) com retroalimentacao do banco de precos | Ativo |
| FR-RADAR-13 | Geracao automatica de contrato GDP a partir de resultado ganho | Ativo |
| FR-RADAR-14 | Descarte de orcamentos irrelevantes | Ativo |
| FR-RADAR-15 | Historico de orcamentos enviados com tab ganhos/perdidos/todos | Ativo |

**Fluxo:**
```
Varrer SGD → Filtrar → Selecionar → Pre-Orcar → Revisar → Enviar → Resultado → Contrato
```

---

### 4.3 INTEL PRECOS (index.html — aba Intel Precos)

**Proposito:** Inteligencia de precos, banco de produtos e analise competitiva.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-INTEL-1 | Banco de Precos: cadastro de itens com custo base, margem alvo, marca, fonte | Ativo |
| FR-INTEL-2 | Importacao de precos: Excel, PDF, OCR (imagem), DOCX | Ativo |
| FR-INTEL-3 | Importacao de Mapa de Apuracao (resultado de licitacao com vencedores) | Ativo |
| FR-INTEL-4 | Dashboard Intel: evolucao de custos, competitividade por grupo, alertas de preco | Ativo |
| FR-INTEL-5 | Simulador de margem: cenarios de margem global com preview | Ativo |
| FR-INTEL-6 | Rentabilidade: analise por item, margem real vs alvo | Ativo |
| FR-INTEL-7 | Central de Precos: visao unificada com revisao de unidades | Ativo |
| FR-INTEL-8 | Scraping B2B: busca de precos em sites de fornecedores | Ativo |
| FR-INTEL-9 | Itens Mestres: normalizacao de nomes de produtos com aliases | Ativo |
| FR-INTEL-10 | Timeline de precos por produto (historico de custos de fornecedor) | Ativo |
| FR-INTEL-11 | Auto-preenchimento de pre-orcamento com preco sugerido | Ativo |
| FR-INTEL-12 | Analise competitiva por pre-orcamento (margem, riscos, competitivos) | Ativo |

**Sub-PRD:** Ver PRD-006 (Sistema de Inteligencia de Precos) para detalhes das 5 pontes entre modulos.

---

### 4.4 GDP — CONTRATOS (gdp-contratos.html — sessao Contratos)

**Proposito:** Gestao de contratos pos-licitacao com controle de saldo.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-CTR-1 | Importacao de Mapa de Apuracao (Excel/PDF/DOCX/OCR) com deteccao automatica de colunas e fornecedores | Ativo |
| FR-CTR-2 | Importacao de Cronograma de Entrega (Excel/PDF) com deteccao de datas e quantidades | Ativo |
| FR-CTR-3 | Criacao manual de contrato com itens, escola, processo, edital, vigencia | Ativo |
| FR-CTR-4 | Cards de contrato com: escola, itens, saldo executado (barra de progresso), pedidos pendentes | Ativo |
| FR-CTR-5 | Filtro por status (ativo/encerrado) e busca por escola/edital | Ativo |
| FR-CTR-6 | Detalhe do contrato com lista de itens, qtd contratada, qtd entregue, saldo | Ativo |
| FR-CTR-7 | Edicao de itens do contrato (descricao, unidade, quantidade, preco, NCM) | Ativo |
| FR-CTR-8 | Vinculacao de escola/cliente ao contrato com busca | Ativo |
| FR-CTR-9 | Toggle "Permitir escola acompanhar saldo no Portal Escolar" | Ativo |
| FR-CTR-10 | Recalculo automatico de saldo ao criar/cancelar pedidos | Ativo |
| FR-CTR-11 | Impressao de contrato | Ativo |
| FR-CTR-12 | Exclusao de contrato (soft delete) | Ativo |
| FR-CTR-13 | KPIs: contratos ativos, itens contratados, valor total contratado | Ativo |

---

### 4.5 GDP — PEDIDOS (gdp-contratos.html — sessao Pedidos)

**Proposito:** Gestao de pedidos vinculados a contratos.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-PED-1 | Criacao de pedido manual com: contrato vinculado, cliente, itens do contrato, data entrega | Ativo |
| FR-PED-2 | Status tabs: Em Aberto, Agendado, Separando, Preparando Envio, Pronto para Envio, Faturado, Entregue, Nao Entregue, Cancelado | Ativo |
| FR-PED-3 | Deducao automatica do saldo do contrato ao criar pedido | Ativo |
| FR-PED-4 | Detalhe do pedido com itens, valores, pagamento, status | Ativo |
| FR-PED-5 | Edicao de pedido: adicionar/remover itens, alterar precos, datas | Ativo |
| FR-PED-6 | Clone de pedido | Ativo |
| FR-PED-7 | Cancelamento de pedido com devolucao automatica do saldo | Ativo |
| FR-PED-8 | Alteracao de status em lote (selecionar multiplos pedidos) | Ativo |
| FR-PED-9 | Geracao de Lista de Compras a partir de pedidos selecionados | Ativo |
| FR-PED-10 | Relatorio de Demanda a partir de pedidos selecionados | Ativo |
| FR-PED-11 | Geracao de NF-e a partir de pedidos selecionados | Ativo |
| FR-PED-12 | Impressao de pedido (formato fiscal) | Ativo |
| FR-PED-13 | Menu lateral por pedido com: status bolinhas coloridas, imprimir, clonar, excluir | Ativo |
| FR-PED-14 | Pagamento: forma (boleto/PIX), condicao, vencimento, conta bancaria | Ativo |
| FR-PED-15 | Filtros: busca por cliente/CNPJ, data, contrato | Ativo |

---

### 4.6 GDP — NOTAS FISCAIS (gdp-contratos.html — sessao Notas Fiscais)

**Proposito:** Emissao e gestao de NF-e.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-NF-1 | Geracao de NF-e a partir de pedido (automatica ou manual) | Ativo |
| FR-NF-2 | Dois modos: NF-e real (SEFAZ) ou manual externa (registro de NF ja emitida) | Ativo |
| FR-NF-3 | Preenchimento automatico de dados fiscais: cliente, itens, NCM, CFOP, natureza operacao | Ativo |
| FR-NF-4 | Transmissao ao SEFAZ (homologacao e producao) via certificado A1 | Ativo (homolog) |
| FR-NF-5 | Geracao de DANFE (HTML para impressao) | Ativo |
| FR-NF-6 | Status tabs: Todas, Pendentes, Emitidas, Canceladas, Inutilizadas | Ativo |
| FR-NF-7 | Cancelamento de NF-e (evento SEFAZ) | Ativo |
| FR-NF-8 | Inutilizacao de numeracao | Ativo |
| FR-NF-9 | Download XML autorizado | Ativo |
| FR-NF-10 | Criacao automatica de Conta a Receber ao autorizar NF-e | Ativo |
| FR-NF-11 | Geracao automatica de cobranca bancaria (boleto/PIX) ao autorizar NF-e | Parcial |
| FR-NF-12 | Notas de Entrada: importacao de NF de fornecedor (XML) com alimentacao do historico de custos | Ativo |

---

### 4.7 GDP — FINANCEIRO (gdp-contratos.html — sessao Financeiro)

**Proposito:** Gestao financeira: caixa, contas a pagar/receber, conciliacao.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-FIN-1 | Caixa: saldo do periodo, entradas, saidas, divergencias | Ativo |
| FR-FIN-2 | Conciliacao bancaria: sincronizar extrato via API Inter e conciliar com titulos | Parcial |
| FR-FIN-3 | Contas a Pagar: cadastro manual, categorias, formas de pagamento | Ativo |
| FR-FIN-4 | Contas a Pagar: status tabs (Emitidas, Em Aberto, Pagas, Atrasadas) com bolinhas coloridas | Ativo |
| FR-FIN-5 | Contas a Pagar: baixa manual, estorno, clonagem, exclusao | Ativo |
| FR-FIN-6 | Contas a Receber: auto-gerada da NF ou cadastro manual | Ativo |
| FR-FIN-7 | Contas a Receber: status tabs (Emitidas, Em Aberto, Recebidas, Atrasadas) com bolinhas coloridas | Ativo |
| FR-FIN-8 | Contas a Receber: baixa, estorno, cobranca automatica (WhatsApp/Email), clonagem | Ativo |
| FR-FIN-9 | Cards resumo: Vencendo Hoje (valor + qtd) e Contas Vencidas (valor + qtd + botoes cobrar) | Ativo |
| FR-FIN-10 | KPIs: Faturamento do Mes, Recebido, A Receber, Em Atraso | Ativo |
| FR-FIN-11 | Impressao de relatorio financeiro (Contas a Pagar e Contas a Receber) | Ativo |
| FR-FIN-12 | Acoes em lote: baixar multiplas contas, excluir multiplas | Ativo |

---

### 4.8 GDP — CENTRAL DE PRODUTOS (gdp-contratos.html — sessao Central de Produtos)

**Proposito:** Cadastro unificado de produtos com suporte a produtos criticos (conversao de embalagem).

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-PROD-1 | Cadastro de produto: nome, unidade base, SKU auto-gerado, NCM (com datalist), categoria, origem NF-e | Ativo |
| FR-PROD-2 | Dois tipos: Produto Comum (unidades inteiras) e Produto Critico (unidades de peso/volume com embalagens) | Ativo |
| FR-PROD-3 | Embalagens para produto critico: descricao, codigo de barras, quantidade base, preco referencia | Ativo |
| FR-PROD-4 | Edicao inline de produto com troca de tipo (comum ↔ critico) e campos de embalagem dinamicos | Ativo |
| FR-PROD-5 | Edicao em massa: tabela fullscreen com todos os produtos e campos editaveis por linha (unidade, SKU, NCM, categoria, origem) | Ativo |
| FR-PROD-6 | Auto SKU/NCM: preenchimento automatico por IA | Ativo |
| FR-PROD-7 | Importacao de produtos via Excel (modelo para download) | Ativo |
| FR-PROD-8 | Impressao de lista de produtos | Ativo |
| FR-PROD-9 | Menu por produto: editar, clonar, excluir | Ativo |
| FR-PROD-10 | Filtro por base (Todas, Comuns, Criticos) e busca por nome/embalagem/barcode | Ativo |
| FR-PROD-11 | KPIs: total produtos, comuns, criticos | Ativo |
| FR-PROD-12 | Sync com Banco de Produtos do contrato (vincular SKU do contrato ao produto central) | Ativo |

---

### 4.9 GDP — ESTOQUE (gdp-contratos.html — sessao Estoque)

**Proposito:** Gestao inteligente de estoque com demandas, compras e fornecedores.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-EST-1 | Visao de estoque por produto: saldo atual, demandas pendentes, sugestao de compra | Ativo |
| FR-EST-2 | Movimentacoes: entrada, saida, ajuste com historico | Ativo |
| FR-EST-3 | Demandas automaticas a partir de pedidos GDP | Ativo |
| FR-EST-4 | Lista de compras consolidada por fornecedor | Ativo |
| FR-EST-5 | Pedidos de compra para fornecedores | Ativo |
| FR-EST-6 | Cadastro de fornecedores com ofertas por embalagem | Ativo |
| FR-EST-7 | Inventario: contagem fisica com ajuste automatico | Ativo |
| FR-EST-8 | Impressao de tabela de estoque, lista de produtos, lista de fornecedores | Ativo |
| FR-EST-9 | Relatorio de demanda de embalagens | Ativo |

---

### 4.10 GDP — CLIENTES (gdp-contratos.html — sessao Clientes)

**Proposito:** Cadastro de escolas/clientes com dados fiscais.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-CLI-1 | Cadastro completo: nome, CNPJ, IE, UF, CEP, municipio, email, telefone, endereco | Ativo |
| FR-CLI-2 | Contribuinte ICMS (sim/nao/isento) | Ativo |
| FR-CLI-3 | Vinculacao de contratos ao cliente | Ativo |
| FR-CLI-4 | Login e senha para acesso ao Portal Escolar | Ativo |
| FR-CLI-5 | Busca e filtro de clientes | Ativo |

---

### 4.11 PORTAL ESCOLAR (gdp-portal.html)

**Proposito:** Interface para escolas fazerem pedidos e acompanharem saldo do contrato.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-PORTAL-1 | Login por escola (email+senha ou CNPJ) | Ativo |
| FR-PORTAL-2 | Selecao de contrato vinculado (catalogo ou ARP) | Ativo |
| FR-PORTAL-3 | Catalogo de produtos disponiveis com preco e saldo | Ativo |
| FR-PORTAL-4 | Carrinho de compras com validacao de saldo | Ativo |
| FR-PORTAL-5 | Submissao de pedido com sync ao fornecedor | Ativo |
| FR-PORTAL-6 | Aba Saldo: valor total do contrato, utilizado, disponivel, detalhamento por item | Ativo |
| FR-PORTAL-7 | Aba Meus Pedidos: historico de pedidos com status, NF-e badge, barra de saldo | Ativo |
| FR-PORTAL-8 | Informacoes do contrato: processo, edital, objeto, vigencia, fornecedor | Ativo |
| FR-PORTAL-9 | Saldo visivel apenas quando fornecedor habilita (toggle no contrato) | Ativo |

---

### 4.12 ENTREGADOR (gdp-entregador.html)

**Proposito:** App mobile (PWA) para motoristas registrarem entregas.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-ENT-1 | Lista de pedidos para entrega | Ativo |
| FR-ENT-2 | Registro de entrega: nome do recebedor, observacoes | Ativo |
| FR-ENT-3 | Captura de foto (camera do celular) | Ativo |
| FR-ENT-4 | Assinatura digital (canvas touch) | Ativo |
| FR-ENT-5 | Funcionamento offline com sync quando online (Service Worker) | Ativo |

---

### 4.13 ESTOQUE MOBILE (gdp-estoque-intel-mobile.html)

**Proposito:** App mobile (PWA) para gestao de estoque via codigo de barras.

**Funcionalidades:**

| ID | Funcionalidade | Status |
|----|---------------|--------|
| FR-MOB-1 | Scanner de codigo de barras em tempo real (camera) | Ativo |
| FR-MOB-2 | Registro de movimentacao (entrada/saida) ao escanear | Ativo |
| FR-MOB-3 | Consulta de produto e saldo pelo codigo de barras | Ativo |
| FR-MOB-4 | Funcionamento offline com sync (Service Worker) | Ativo |

---

## 5. CONFIGURACOES DO SISTEMA (app-config.js)

| ID | Configuracao | Status |
|----|-------------|--------|
| FR-CFG-1 | Dados da empresa: nome, CNPJ, IE, endereco, telefone, email | Ativo |
| FR-CFG-2 | Usuarios: cadastro de usuarios com acesso | Ativo |
| FR-CFG-3 | NF-e: ambiente (homolog/producao), serie, natureza operacao, CFOP padrao, regime tributario | Ativo |
| FR-CFG-4 | Contas bancarias: cadastro com banco, agencia, conta, PIX | Ativo |
| FR-CFG-5 | API Bancaria: provider (Inter/Asaas/BB/EFI), credenciais, ambiente, webhook | Ativo |
| FR-CFG-6 | Modulos: controle de acesso por modulo (RADAR, Intel, GDP) | Ativo |

---

## 6. INTEGRACOES EXTERNAS

| ID | Sistema | Proposito | Status |
|----|---------|-----------|--------|
| INT-1 | **SGD (MG)** | Captacao orcamentos educacao publica | Ativo |
| INT-2 | **SEFAZ** | Transmissao NF-e via SOAP + certificado A1 | Ativo (homolog) |
| INT-3 | **Banco Inter** | Boleto, PIX, extrato bancario | Parcial |
| INT-4 | **Asaas** | Gateway pagamentos alternativo | Configurado |
| INT-5 | **Supabase** | Database + Auth + RLS + Sync | Ativo |
| INT-6 | **Tiny ERP** | Sync produtos e pedidos | Opcional |
| INT-7 | **Olist** | Marketplace (framework pronto) | Framework |
| INT-8 | **PNCP** | Busca licitacoes publicas nacionais | Ativo |
| INT-9 | **OpenAI** | NCM auto, parsing precos, OCR inteligente | Opcional |

---

## 7. REQUISITOS NAO-FUNCIONAIS

| ID | Requisito | Metrica |
|----|-----------|---------|
| NFR-1 | Offline-first: sistema funciona sem internet | localStorage como fonte primaria |
| NFR-2 | Sync automatico com Supabase quando online | Debounce 2s, force on tab hide |
| NFR-3 | Resolucao de conflito: local com mais dados vence | Previne perda de dados |
| NFR-4 | Multi-tenant: dados isolados por empresa (RLS) | Supabase empresa_id |
| NFR-5 | PWA: Entregador e Estoque Mobile funcionam como app | Service Workers |
| NFR-6 | Performance: renderizacao < 500ms para listas | localStorage read instantaneo |
| NFR-7 | Deploy continuo via Vercel | Push to master = deploy |

---

## 8. METRICAS DO SISTEMA (PRODUCAO)

| Metrica | Valor Atual |
|---------|-------------|
| Contratos ativos | 35 |
| Itens contratados | 340 |
| Valor total contratado | R$ 268.901,19 |
| Produtos cadastrados | 153 (150 comuns + 3 criticos) |
| Clientes cadastrados | 72 |
| Notas fiscais emitidas | 16 |
| Contas a receber | 12 (7 recebidas, 5 atrasadas) |

---

## 9. SUB-PRDs

| PRD | Escopo | Status |
|-----|--------|--------|
| PRD-006 | Inteligencia de Precos (Epic 6) | Draft |

---

## 10. DEBITO TECNICO CONHECIDO

Ver `docs/architecture/system-architecture.md` secao 7 para lista completa de 16 itens priorizados.

**Resumo:** ~1.460 linhas de codigo duplicado + ~200 linhas de dead code para limpar na Fase 4 (Refatoracao).

---

*PRD Master gerado pela Fase 3 do Brownfield Discovery*
*@pm (Morgan) — 2026-05-05*
*Referencia: docs/architecture/system-architecture.md*
