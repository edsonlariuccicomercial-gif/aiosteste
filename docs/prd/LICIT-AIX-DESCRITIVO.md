# Licit-AIX — Descritivo do Sistema

> Documento para leitura. Descreve o que o sistema faz, modulo por modulo, de forma clara e direta.
> Baseado no PRD-001 e na arquitetura documentada em producao.
> Data: 2026-05-05

---

## O que e o Licit-AIX

O Licit-AIX e um sistema completo para fornecedores de alimentacao escolar que participam de licitacoes publicas em Minas Gerais. Ele cobre todo o ciclo de trabalho: desde encontrar os orcamentos abertos nas escolas ate receber o pagamento pela mercadoria entregue.

O sistema resolve um problema real: antes dele, tudo era feito em planilhas, copiar e colar do site do SGD, calcular preco na mao, emitir nota fiscal em outro sistema, cobrar por WhatsApp, e nunca saber ao certo quanto de saldo ainda tem em cada contrato.

Hoje o Licit-AIX faz tudo isso em um lugar so.

---

## Quem usa

**O fornecedor (Edson)** e o usuario principal. Ele participa de mais de 150 processos licitatorios por ano, atende 35 escolas com contratos ativos, e vende mais de 150 itens alimenticios diferentes. Opera com equipe pequena de 1 a 3 pessoas.

**As escolas (caixas escolares)** sao usuarios secundarios. Elas acessam o Portal Escolar para fazer pedidos de mercadoria e acompanhar quanto de saldo ainda tem no contrato.

**Os motoristas** usam o app de entregador no celular para registrar as entregas com foto e assinatura digital.

---

## Os Modulos

O sistema tem 7 modulos principais, cada um com uma funcao especifica.

---

### 1. HOME

A pagina inicial. Mostra cards de acesso rapido para os 3 modulos principais: RADAR, Intel Precos e GDP. Tambem mostra indicadores resumidos de quantos orcamentos estao abertos, quantos contratos ativos existem e quantos pedidos estao pendentes.

E o ponto de partida — o painel de controle do fornecedor.

---

### 2. RADAR

O RADAR e o modulo de captacao de orcamentos. Ele se conecta ao SGD (Sistema de Gestao de Demandas do governo de MG) e faz uma varredura automatica para encontrar todos os orcamentos abertos nas escolas.

**Como funciona na pratica:**

O fornecedor clica em "Varrer SGD" e o sistema busca automaticamente todos os orcamentos disponiveis. Eles aparecem em uma lista com filtros por regiao (SRE), escola, municipio, grupo de despesa e status.

No topo da tela aparecem KPIs importantes: quantos orcamentos estao abertos, quantos sao urgentes (prazo curto), qual o faturamento potencial se ganhar todos, e qual a margem media.

Quando o fornecedor escolhe um orcamento, ele cria um Pre-Orcamento. O sistema tenta automaticamente preencher os precos dos itens usando o banco de precos (matching automatico em 3 camadas: primeiro busca no dicionario de equivalencias, depois nos contratos anteriores, e por ultimo faz busca fuzzy por nome similar). Se nao encontrar, o fornecedor pode vincular manualmente.

Antes de enviar a proposta, o sistema faz uma revisao automatica: verifica se as unidades estao compativeis (ex: a escola pede em CX mas o fornecedor vende em UN), se os precos fazem sentido comparado ao custo, e se as quantidades estao corretas.

Depois de enviar, o fornecedor acompanha o resultado: se ganhou ou perdeu. Se ganhou, o sistema gera automaticamente um contrato no GDP com todos os itens e saldos.

**Fluxo completo:**
Varrer SGD > Filtrar > Selecionar orcamento > Pre-Orcar (definir precos) > Revisar > Enviar proposta > Aguardar resultado > Se ganhou, gerar contrato

---

### 3. INTEL PRECOS

O Intel Precos e o modulo de inteligencia de precos. Ele mantem um banco de precos unificado com historico de custos de fornecedores, precos de concorrentes, e precos aceitos/recusados em licitacoes anteriores.

**O que ele faz:**

Mantem um banco de precos com todos os itens que o fornecedor ja vendeu ou cotou. Cada item tem custo base (quanto o fornecedor paga), margem alvo (quanto quer ganhar), e preco de referencia (quanto cobrar).

Permite importar precos de varias fontes: planilhas Excel, PDFs de tabelas de fornecedores, fotos de tabelas (OCR), e ate documentos Word. Tambem importa Mapas de Apuracao (resultado de licitacoes com os precos dos vencedores).

Tem um dashboard de inteligencia que mostra evolucao de custos ao longo do tempo, competitividade por grupo de produto, e alertas quando um preco esta muito acima ou abaixo do mercado.

Tem um simulador de margem: o fornecedor pode testar cenarios (ex: "e se eu baixar a margem para 25%?") e ver o impacto no preco final de cada item.

Tambem faz scraping de sites B2B para buscar precos de fornecedores online.

O objetivo final: quando o fornecedor for preencher um pre-orcamento no RADAR, o sistema sugere automaticamente o preco ideal para cada item, baseado em tudo que sabe.

---

### 4. GDP — Contratos

GDP significa Gestao Pos-Licitacao. E o modulo principal do sistema, onde o fornecedor gerencia tudo depois de ganhar a licitacao.

A sessao de Contratos e o ponto de partida do GDP. Cada contrato representa um acordo com uma escola: tem um processo, um edital, uma lista de itens com quantidades e precos, e um saldo que vai sendo consumido conforme os pedidos sao feitos.

**O que ele faz:**

Permite importar contratos de varias formas: via Mapa de Apuracao (Excel/PDF/DOCX com OCR), via cronograma de entrega, ou criacao manual. O sistema detecta automaticamente as colunas e os fornecedores no documento.

Cada contrato aparece como um card com o nome da escola, quantidade de itens, valor total, barra de progresso do saldo executado, e quantos pedidos estao pendentes.

Ao abrir o detalhe do contrato, o fornecedor ve cada item com quantidade contratada, quantidade ja entregue, e saldo disponivel. Pode editar itens, vincular a escola/cliente, e habilitar o acompanhamento de saldo pelo Portal Escolar.

O saldo e recalculado automaticamente sempre que um pedido e criado ou cancelado.

---

### 5. GDP — Pedidos

A sessao de Pedidos e onde o fornecedor cria e gerencia os pedidos de entrega para as escolas.

**Como funciona:**

O fornecedor cria um pedido vinculado a um contrato. Seleciona o cliente (escola), escolhe os itens do contrato com as quantidades desejadas, define a data de entrega e a forma de pagamento.

Ao salvar, o saldo do contrato e deduzido automaticamente. Se o pedido for cancelado, o saldo volta.

Os pedidos passam por um fluxo de status representado por bolinhas coloridas: Em Aberto (amarelo) > Agendado (azul) > Separando (azul) > Preparando Envio (amarelo) > Pronto para Envio (azul) > Faturado (verde) > Entregue (verde). Tambem pode ser marcado como Nao Entregue (vermelho) ou Cancelado (vermelho).

O fornecedor pode alterar o status de varios pedidos ao mesmo tempo, gerar lista de compras a partir dos pedidos selecionados, gerar relatorio de demanda, gerar notas fiscais, e imprimir pedidos.

Cada pedido tem um menu lateral com acesso rapido a: alterar status (bolinhas coloridas clicaveis), imprimir, clonar e excluir.

---

### 6. GDP — Notas Fiscais

A sessao de Notas Fiscais e onde o fornecedor emite e gerencia as NF-e (Notas Fiscais Eletronicas).

**Como funciona:**

O fornecedor pode gerar uma NF-e a partir de um pedido. O sistema preenche automaticamente todos os dados fiscais: dados do cliente (nome, CNPJ, IE, endereco), itens com NCM e CFOP, natureza da operacao, e regime tributario.

Tem dois modos: NF-e real (transmite ao SEFAZ via certificado digital A1) ou manual externa (apenas registra uma NF que ja foi emitida em outro sistema).

Ao autorizar uma NF-e, o sistema automaticamente cria uma Conta a Receber e pode gerar uma cobranca bancaria (boleto ou PIX).

O fornecedor pode gerar e imprimir a DANFE (documento auxiliar da NF-e), cancelar notas, inutilizar numeracao, e baixar o XML autorizado.

Tambem tem a funcao de Notas de Entrada: importar NF-e de fornecedores (XML) para alimentar o historico de custos no banco de precos.

---

### 7. GDP — Financeiro

A sessao Financeira tem 3 sub-abas: Caixa, Contas a Pagar e Contas a Receber.

**Caixa:** Mostra o saldo do periodo com entradas, saidas e divergencias. Tem integracao com a API do Banco Inter para sincronizar o extrato bancario e fazer conciliacao automatica (comparar o extrato com os titulos registrados no sistema).

**Contas a Pagar:** O fornecedor cadastra as despesas (contas de fornecedores, aluguel, etc.) com valor, vencimento, categoria e forma de pagamento. As contas tem status com bolinhas coloridas: Emitidas (azul), Em Aberto (amarelo), Pagas (verde), Atrasadas (vermelho). Pode dar baixa manual, estornar, clonar e excluir.

**Contas a Receber:** Sao geradas automaticamente quando uma NF-e e autorizada, ou cadastradas manualmente. Tem os mesmos status com bolinhas coloridas: Emitidas, Em Aberto, Recebidas, Atrasadas. Tem cards de resumo mostrando "Vencendo Hoje" e "Contas Vencidas" com botoes para cobrar via WhatsApp ou Email.

KPIs do topo mostram: Faturamento do Mes, Total Recebido, A Receber, e quantidade Em Atraso.

---

### 8. GDP — Central de Produtos

A Central de Produtos e o cadastro unificado de todos os produtos que o fornecedor trabalha.

**Como funciona:**

Cada produto tem: nome, unidade base, SKU (codigo gerado automaticamente), NCM (classificacao fiscal com busca inteligente), categoria, e origem para NF-e.

Existem dois tipos de produto:
- **Produto Comum:** vendido em unidades inteiras (UN, CX, PCT, KG, etc.)
- **Produto Critico:** vendido em unidades de peso ou volume (g, ml) que precisam de conversao de embalagem. Ex: o contrato pede 170g de arroz, mas no mercado so existe pacote de 360g. O produto critico permite cadastrar essas embalagens com descricao, codigo de barras, quantidade base e preco de referencia.

Tem edicao em massa: abre uma tabela fullscreen com todos os produtos e campos editaveis por linha (unidade, SKU, NCM, categoria, origem). Cada produto pode ter valores diferentes.

Tambem importa produtos via Excel (com modelo para download) e tem preenchimento automatico de SKU e NCM por IA.

---

### 9. GDP — Estoque

A sessao de Estoque gerencia as entradas e saidas de mercadoria.

**Como funciona:**

Permite registrar movimentacoes: entrada de mercadoria (compra), saida (entrega), e ajuste (inventario). Cada movimentacao fica no historico com data, produto, operacao, quantidade e origem.

Tem funcao de inventario: contagem fisica dos produtos com ajuste automatico do saldo.

As demandas sao geradas automaticamente a partir dos pedidos do GDP. O sistema consolida as demandas em uma lista de compras por fornecedor, e permite gerar pedidos de compra.

---

### 10. GDP — Clientes

O cadastro de escolas/clientes com todos os dados fiscais necessarios para emissao de NF-e: nome, CNPJ, IE, UF, CEP, municipio, email, telefone, endereco completo, e indicador de contribuinte ICMS.

Cada cliente pode ter contratos vinculados e login/senha para acessar o Portal Escolar.

---

### 11. Portal Escolar

O Portal Escolar e a interface que as escolas usam para fazer pedidos e acompanhar o saldo do contrato.

**Como funciona:**

A escola faz login com email e senha. Seleciona o contrato vinculado e ve o catalogo de produtos disponiveis com preco e saldo.

Monta um carrinho de compras (o sistema valida se o saldo e suficiente) e submete o pedido. O pedido e sincronizado automaticamente com o fornecedor.

Tem 3 abas:
- **Catalogo:** navegar e selecionar produtos
- **Saldo:** ver o valor total do contrato, quanto ja foi utilizado, e quanto esta disponivel, com detalhamento por item
- **Meus Pedidos:** historico de todos os pedidos feitos, com status, badge de NF-e, e barra visual do saldo restante

O saldo so aparece quando o fornecedor habilita essa opcao no contrato (toggle "Permitir escola acompanhar saldo").

---

### 12. Entregador

App mobile (PWA) para os motoristas que fazem as entregas.

**Como funciona:**

O motorista abre o app no celular e ve a lista de pedidos para entrega. Ao chegar na escola, registra a entrega com: nome do recebedor, observacoes, foto da mercadoria (camera do celular), e assinatura digital (tela touch).

O app funciona offline: se o motorista estiver sem internet, os dados ficam salvos no celular e sincronizam automaticamente quando a conexao voltar.

---

### 13. Estoque Mobile

App mobile (PWA) para gestao de estoque via codigo de barras.

**Como funciona:**

O operador abre o app no celular, aponta a camera para o codigo de barras do produto, e o sistema identifica automaticamente. Pode registrar entrada ou saida de mercadoria, e consultar o saldo atual do produto.

Tambem funciona offline com sincronizacao automatica.

---

## Integracoes com Sistemas Externos

O Licit-AIX se conecta com 9 sistemas externos:

**SGD (Sistema de Gestao de Demandas):** O sistema do governo de MG onde as escolas publicam orcamentos e os fornecedores enviam propostas. O RADAR se conecta automaticamente para buscar orcamentos e enviar propostas.

**SEFAZ:** O sistema da Secretaria da Fazenda para transmissao de NF-e. O Licit-AIX gera o XML, assina com certificado digital A1, e transmite via SOAP. Atualmente funciona em homologacao (testes), pronto para producao.

**Banco Inter:** Integracao para gerar boletos, cobrar via PIX, e sincronizar o extrato bancario para conciliacao automatica. Parcialmente implementado.

**Asaas:** Gateway de pagamentos alternativo para gerar boletos e cobrar via PIX. Configurado como opcao.

**Supabase:** Banco de dados na nuvem (PostgreSQL) com autenticacao e sincronizacao. Todos os dados principais (contratos, pedidos, notas fiscais, clientes, contas) ficam no Supabase e sincronizam com o localStorage do navegador.

**Tiny ERP:** Integracao para sincronizar produtos e pedidos com o ERP Tiny. Opcional.

**Olist:** Integracao com marketplace. Framework pronto para uso futuro.

**PNCP:** Portal Nacional de Compras Publicas. O sistema busca licitacoes publicas nacionais para identificar oportunidades.

**OpenAI:** Inteligencia artificial para classificar NCM automaticamente, extrair precos de documentos, e fazer OCR inteligente de tabelas. Opcional.

---

## Como os Dados Funcionam (Offline-First)

O sistema foi feito para funcionar mesmo sem internet. Todos os dados ficam salvos no navegador (localStorage) e sao sincronizados com a nuvem (Supabase) quando tem conexao.

Quando o fornecedor faz qualquer alteracao (cria pedido, emite nota, cadastra produto), o dado e salvo instantaneamente no navegador. Em seguida, o sistema tenta sincronizar com o Supabase. Se nao conseguir (sem internet), guarda na fila e tenta novamente depois.

Se houver conflito (ex: o fornecedor editou no computador e no celular ao mesmo tempo), o sistema mantem a versao que tem mais dados (previne perda).

Os dados de cada empresa sao isolados — um fornecedor nao ve os dados de outro.

---

## Numeros do Sistema em Producao

- 34 contratos ativos
- 338 itens contratados
- R$ 267.831,19 em valor total contratado
- 155 produtos cadastrados (151 comuns + 4 criticos)
- 72 clientes (escolas) cadastrados
- 16 notas fiscais emitidas
- 18 notas de entrada importadas (R$ 10.022,95)
- 12 contas a receber (7 recebidas, 5 atrasadas)
- 60 pedidos no historico

---

*Documento descritivo do Licit-AIX — gerado em 2026-05-05*
*Baseado no sistema em producao (commit 4ba0bb3)*
