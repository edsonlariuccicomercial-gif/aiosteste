# Licit-AIX — Arquitetura do Sistema (Documento Definitivo)

> Gerado em 2026-05-03 | Brownfield Discovery Phase 2 (Completa)
> Substitui versao anterior de 2026-04-20
> Fonte de verdade: codigo em producao no commit 098d547

---

## 1. Visao Geral

**Licit-AIX** e um sistema de inteligencia comercial para fornecedores da educacao publica. Cobre todo o ciclo pos-licitacao: captacao de orcamentos, precificacao, envio de propostas, gestao de contratos, pedidos, notas fiscais, estoque, financeiro, portal escolar e entregas.

### Modulos

| Modulo | Pagina | Proposito |
|--------|--------|-----------|
| **Home** | dashboard-home.html | Painel inicial com acesso rapido |
| **RADAR** | index.html | Captacao de orcamentos via SGD + varredura automatica |
| **Intel Precos** | index.html | Inteligencia de precos, banco de produtos, analise competitiva |
| **GDP** | gdp-contratos.html | Gestao Pos-Licitacao completa |
| **Portal Escolar** | gdp-portal.html | Acesso das escolas para pedidos e acompanhamento |
| **Entregador** | gdp-entregador.html | App mobile para motoristas (PWA) |
| **Estoque Mobile** | gdp-estoque-intel-mobile.html | Inventario via codigo de barras (PWA) |

### Stack Tecnica

- **Frontend:** HTML + CSS + Vanilla JS (sem framework)
- **Backend:** Vercel Serverless Functions (Node.js)
- **Database:** Supabase (PostgreSQL + RLS)
- **Storage:** localStorage (offline-first) + Supabase sync
- **Deploy:** Vercel (painel-caixa-escolar.vercel.app)

---

## 2. Mapa de Arquivos

### Frontend — Total: ~45.672 linhas

```
squads/caixa-escolar/dashboard/
│
│── PAGINAS HTML (9 arquivos)
│   ├── index.html                    # RADAR + Intel Precos (1.317 linhas)
│   ├── gdp-contratos.html            # GDP principal (1.659 linhas)
│   ├── gdp-portal.html               # Portal Escolar (2.405 linhas, JS inline)
│   ├── gdp-entregador.html           # App Entregador (576 linhas)
│   ├── gdp-estoque-intel-mobile.html # Estoque Mobile (515 linhas)
│   ├── gdp-dashboard.html            # Dashboard operacional (836 linhas)
│   ├── gdp-gestao.html               # Gestao (475 linhas)
│   ├── dashboard-home.html           # Home (522 linhas)
│   └── login.html                    # Login (142 linhas)
│
│── JS MODULO RADAR + INTEL PRECOS (12 arquivos, ~10.410 linhas)
│   ├── app.js                        # Orquestrador principal (2.889 linhas)
│   ├── app-sgd-integration.js        # Integracao SGD (1.421 linhas)
│   ├── app-results.js                # Resultados licitacao (1.113 linhas)
│   ├── app-import.js                 # Import multi-formato (1.006 linhas)
│   ├── app-banco.js                  # Banco de Precos UI (825 linhas)
│   ├── app-config.js                 # Configuracoes (744 linhas)
│   ├── pricing-intel.js              # Dashboard Intel Precos (737 linhas)
│   ├── app-state.js                  # Estado global + constantes (420 linhas)
│   ├── app-utils.js                  # Utilitarios UI (320 linhas)
│   ├── radar-matcher.js              # Equivalencias produto (243 linhas)
│   ├── app-sync.js                   # Sync RADAR cloud (156 linhas)
│   └── app-sgd-client.js             # Cliente SGD browser (97 linhas)
│
│── JS MODULO GDP (13 arquivos, ~19.523 linhas)
│   ├── js/gdp-init.js               # Boot + UI global GDP (3.231 linhas)
│   ├── js/gdp-contratos-module.js   # Contratos + import mapa (3.188 linhas)
│   ├── js/gdp-pedidos.js            # Pedidos + Financeiro render (2.758 linhas)
│   ├── js/gdp-estoque-intel.js      # Estoque inteligente (2.662 linhas)
│   ├── js/gdp-notas-fiscais.js      # NF-e + regras fiscais (2.294 linhas)
│   ├── js/gdp-banco-produtos.js     # Central de Produtos (1.824 linhas)
│   ├── js/gdp-core.js               # Core: storage, sync, state (1.707 linhas)
│   ├── js/gdp-entregas.js           # Entregas operacionais (667 linhas)
│   ├── js/gdp-usuarios.js           # Clientes/Usuarios (608 linhas)
│   ├── gdp-api.js                   # Camada Supabase REST (338 linhas)
│   ├── js/banco-precos-client.js    # Precos Supabase (287 linhas)
│   ├── js/supabase-auth.js          # Auth Supabase (166 linhas)
│   └── js/supabase-config.js        # Config Supabase (15 linhas)
│
│── OUTROS
│   ├── auth.js                      # Auth legacy (33 linhas)
│   ├── js/gdp-integrations-client.js # Integracoes client (116 linhas)
│   ├── sw-entregador.js             # Service Worker entregador (37 linhas)
│   └── sw-estoque-intel.js          # Service Worker estoque (31 linhas)
```

### Backend (APIs Serverless)

```
api/
├── caixa-proxy.js          # Proxy consolidado (SGD, PNCP, Bank, SEFAZ) — PRINCIPAL
├── ai-parse-price.js       # Parsing IA de precos (GPT-4o)
├── ai-ncm.js               # Classificacao NCM por IA
├── b2b-scrape.js            # Scraping B2B
├── send-order-email.js      # Email de pedidos
├── gdp-integrations.js      # Eventos de integracao fiscal/bancaria
├── db-migrate.js            # Migracoes Supabase
├── sync-pedidos.js          # Sync pedidos Portal Escolar
├── sync-entregas.js         # Sync provas entrega
├── tiny-produtos.js         # Sync Tiny ERP
└── olist/order.js           # Integracao Olist/Tiny

server-lib/
├── nfe-sefaz-client.js      # Geracao XML NF-e + SEFAZ SOAP
├── asaas-charge-client.js   # Gateway Asaas (boleto/PIX)
├── bank-provider-config.js  # Config provedores bancarios (Inter, Asaas, BB, EFI)
└── product-utils.js         # Normalizacao produto/NCM
```

---

## 3. Entidades de Dados

### 3.1 Entidades com Supabase (sync cloud)

| Entidade | localStorage | Supabase Table | ID Format | Campos-chave |
|----------|-------------|----------------|-----------|--------------|
| **Contrato** | gdp.contratos.v1 | contratos | CTR-YYYYMMDD-XXXX | escola, processo, edital, objeto, status, itens[{num, descricao, unidade, qtdContratada, qtdEntregue, precoUnitario, ncm}], saldoVisivelEscola |
| **Pedido** | gdp.pedidos.v1 | pedidos | PED-YYYYMMDD-XXXX | contratoId(FK), escola, cliente{nome,cnpj,ie,...}, itens[{itemNum, descricao, qtd, precoUnitario}], valor, status, pagamento{forma, vencimento}, saldoDeduzido |
| **Nota Fiscal** | gdp.notas-fiscais.v1 | notas_fiscais | NF-XXXXX | pedidoId(FK), numero, serie, valor, status, tipoNota, sefaz{cStat,nProt,chaveAcesso}, cobranca{status,forma,linhaDigitavel}, cliente{}, itens[] |
| **Conta Receber** | gdp.contas-receber.v1 | contas_receber | CR-XXXXX | origemTipo, origemId(FK), descricao, cliente, valor, vencimento, status, forma, cobranca{}, automacao{} |
| **Conta Pagar** | gdp.contas-pagar.v1 | contas_pagar | CP-XXXXX | descricao, categoria, forma, valor, vencimento, status |
| **Cliente** | gdp.usuarios.v1 | clientes | UUID | nome, cnpj, ie, uf, cep, email, telefone, contratos_vinculados[], contribuinte_icms |
| **Entrega** | gdp.entregas.provas.v1 | entregas | UUID | pedidoId(FK), escola, dataEntrega, recebedor, foto(base64), assinatura(base64) |

### 3.2 Entidades Locais (localStorage only, sync via sync_data)

| Entidade | localStorage | ID Format | Campos-chave |
|----------|-------------|-----------|--------------|
| **Produto (Central)** | gdp.estoque-intel.produtos.v1 | PROD-XXXXX | nome, unidade_base, sku, ncm, categoria, origem, produto_critico, preco_referencia |
| **Embalagem** | gdp.estoque-intel.embalagens.v1 | EMB-XXXXX | produto_id(FK), descricao, codigo_barras, quantidade_base, preco_referencia |
| **Movimentacao** | gdp.estoque-intel.movimentacoes.v1 | MOV-XXXXX | produto_id(FK), tipo(entrada/saida/ajuste), quantidade, data |
| **Fornecedor** | gdp.estoque-intel.fornecedores.v1 | FORN-XXXXX | nome, contato, email, embalagens[{embalagem_id, preco}] |
| **Compra** | gdp.estoque-intel.compras.v1 | COMP-XXXXX | fornecedor_id(FK), data_compra, itens[], valor_total |
| **Banco Produtos (Legacy)** | gdp.produtos.v1 | PROD-XXXXX | descricao, sku, ncm, unidade, custoBase, precoReferencia, produto_critico |
| **Equivalencia** | gdp.equivalencias.v1 | N/A | {descricao_normalizada: sku} (objeto key-value) |

### 3.3 Entidades RADAR/Intel (localStorage only)

| Entidade | localStorage | Campos-chave |
|----------|-------------|--------------|
| **Orcamento** | caixaescolar.orcamentos | id, escola, municipio, sre, objeto, itens[], status |
| **Pre-Orcamento** | caixaescolar.preorcamentos.v1 | {orcId: {status, itens[], margem, frete, enviadoEm}} |
| **Banco Precos** | caixaescolar.banco.v1 | {itens: [{nome, grupo, custo, margem, marca, fonte}]} |
| **Resultado** | caixaescolar.resultados.v1 | {orcId: {tipo(ganho/perdido), delta, data}} |
| **Descartados** | caixaescolar.descartados | Set de IDs |
| **Itens Mestres** | caixaescolar.itens-mestres | [{id, nome, aliases[], sku}] |
| **Arquivos** | caixaescolar.arquivos-importados | [{nomeArquivo, fornecedor, tipo, qtdItens, data}] |

### 3.4 Relacionamentos

```
Contrato 1──N Pedido 1──1 NotaFiscal 1──1 ContaReceber
    │                        │
    └── N Cliente(escola)    └── SEFAZ(transmissao)
    
Produto 1──N Embalagem
    │           │
    │           └── N FornecedorOferta
    │
    └── N Movimentacao
    
Orcamento 1──1 PreOrcamento 1──1 Resultado 1──1 Contrato
```

---

## 4. Fluxos de Negocio

### A. Licitacao (RADAR → Contrato)
```
1. Varrer SGD → captar orcamentos abertos
2. Selecionar orcamento → criar Pre-Orcamento
3. Precificar itens (custo + margem + frete)
4. Revisar cotacao (validar unidades/precos)
5. Enviar proposta ao SGD
6. Aguardar resultado (ganho/perdido)
7. Se ganho → gerar Contrato GDP com itens e saldo
```

### B. Pedido → Faturamento
```
1. Criar Pedido vinculado ao Contrato
2. Deduzir saldo do contrato (qtdEntregue += qtdPedido)
3. Gerar Nota Fiscal (NF-e ou manual)
4. Transmitir NF-e ao SEFAZ (se real)
5. Criar Conta a Receber automaticamente
6. Gerar cobranca bancaria (boleto/PIX via Inter ou Asaas)
7. Registrar recebimento (baixa)
```

### C. Portal Escolar
```
1. Escola faz login (Supabase Auth)
2. Seleciona contrato vinculado
3. Navega catalogo de produtos disponiveis
4. Monta carrinho respeitando saldo
5. Submete pedido → sync com fornecedor
6. Acompanha saldo em tempo real
```

### D. Entrega
```
1. Motorista acessa app PWA (gdp-entregador.html)
2. Ve lista de pedidos para entrega
3. Registra entrega: foto + assinatura digital
4. Dados sincronizam quando online
5. Estoque atualizado automaticamente
```

### E. Financeiro
```
1. Caixa: saldo = entradas - saidas
2. Contas a Pagar: cadastro manual, baixa, atraso automatico
3. Contas a Receber: auto-gerada da NF, cobranca automatica
4. Conciliacao: importar extrato bancario, match com titulos
```

---

## 5. Integracoes Externas

| Sistema | Proposito | Auth | Status |
|---------|-----------|------|--------|
| **SGD (MG)** | Captacao orcamentos educacao publica | CNPJ + senha → sessionToken | Ativo |
| **SEFAZ** | Transmissao NF-e (SOAP) | Certificado A1 (PEM/PFX) | Ativo (homolog) |
| **Banco Inter** | Boleto, PIX, extrato | OAuth2 (clientId/secret) | Parcial |
| **Asaas** | Gateway pagamentos | API Key | Configurado |
| **Supabase** | Database + Auth + RLS | Anon key (browser) + service key (server) | Ativo |
| **Tiny ERP** | Sync produtos/pedidos | API Token | Opcional |
| **Olist** | Marketplace | API Key | Framework pronto |
| **PNCP** | Busca licitacoes publicas | Sem auth (publico) | Ativo |
| **OpenAI** | NCM auto, parsing precos | API Key | Opcional |

---

## 6. Sincronizacao (Offline-First)

### Estrategia
1. **Leitura:** sempre do localStorage (instantaneo)
2. **Escrita:** localStorage + fila de sync (debounce 2s)
3. **Sync:** Supabase REST API (upsert com on_conflict)
4. **Conflito:** local com mais itens vence (previne perda)
5. **Keys compartilhadas:** cloud sempre vence

### Camadas de Sync
- **Direto Supabase:** contratos, pedidos, notas_fiscais, clientes, contas_*, entregas
- **Via sync_data:** estoque intel, config, equivalencias, categorias, formas
- **Local only:** orcamentos SGD, pre-orcamentos (muito grandes para sync)

### Identidade Multi-tenant
- User ID resolvido por: syncUserId → nomeFantasia → cnpj → "default"
- RLS do Supabase filtra por empresa_id

---

## 7. Debito Tecnico

### Critico (deve corrigir)

| # | Problema | Arquivo | Impacto |
|---|---------|---------|---------|
| 1 | `excluirContrato()` definida 2x | gdp-contratos-module.js:2506,2961 | Segunda sobrescreve primeira |
| 2 | `editarBancoItem()` definida 2x com logica diferente | pricing-intel.js:475 + app-banco.js:789 | Comportamento imprevisivel |
| 3 | 2 funcoes similaridade incompativeis | gdp-banco-produtos.js:656,1350 | Retornos diferentes ({score,tipo} vs number) |

### Alto (duplicacao massiva)

| # | Problema | Arquivo | Linhas duplicadas |
|---|---------|---------|-------------------|
| 4 | 14+ pares funcoes CR/CP identicas | gdp-init.js:281-810 | ~600 linhas |
| 5 | getSyncUserId() repetida em 3+ HTMLs | portal, entregador, mobile | ~60 linhas |
| 6 | mergeImport/mergeMapaIntoBanco duplicadas | app-import.js | ~250 linhas |
| 7 | 3 funcoes geracao contrato duplicadas | app-results.js | ~250 linhas |
| 8 | load/save identicos nunca chamados | app-state.js:295-309 | ~100 linhas |

### Medio (dead code)

| # | Problema | Arquivo | Linhas |
|---|---------|---------|--------|
| 9 | syncPedidosGDPToEstoqueIntel() dead | gdp-core.js:1338 | 1 |
| 10 | 11 funcoes stub vazias | gdp-core.js:1339-1404 | 11 |
| 11 | 4 funcoes teste/demo | gdp-estoque-intel.js:427-536 | ~110 |
| 12 | 3 noops migrados | app.js:2586-2653 | ~70 |
| 13 | toggleSimulator dead | pricing-intel.js:295-303 | ~10 |
| 14 | setTextSafe duplicado | pricing-intel.js:701 + app-utils.js:180 | 6 |
| 15 | Typo schedulCloudSync | gdp-core.js:376 | 1 |
| 16 | 6 APIs desabilitadas | api/_disabled/ | Pendente limpeza |

### Estimativa de Limpeza: ~1.460 linhas duplicadas, ~200 linhas dead code

---

## 8. Metricas

| Metrica | Valor |
|---------|-------|
| Total linhas codigo | ~45.672 |
| Arquivos JS | 29 + inline em 6 HTMLs |
| Paginas HTML | 9 |
| Funcoes declaradas | ~600+ |
| Variaveis globais | ~150+ |
| Chaves localStorage | ~50+ |
| Tabelas Supabase | 7 diretas + sync_data |
| APIs serverless ativas | 11 |
| APIs desabilitadas | 6 |
| Integracoes externas | 9 |

---

*Documento gerado pela Fase 2 do Brownfield Discovery*
*@architect (Aria) — 2026-05-03*
