# PDR/PRD - LicitIA MG

## 1. Visao do Produto

Criar uma plataforma de inteligencia e operacao para fornecedores de caixas escolares de MG, integrada ao fluxo real do SGD, para:

- organizar oportunidades por SRE e municipio;
- encontrar cotações por objeto com busca inteligente;
- sugerir cotação competitiva com base em dados reais;
- reduzir tempo operacional;
- aumentar taxa de vitoria;
- conectar pre-licitacao e pos-licitacao no mesmo sistema.

Nome de trabalho: `LicitIA MG`.

## 2. Problemas Reais (Dores do Usuario)

1. O SGD nao organiza como voce pensa o negocio (SRE x municipio), dificultando priorizacao regional.
2. Nao ha filtro por objeto, dificultando achar oportunidades aderentes ao seu catalogo.
3. Cotacao precisa ser preenchida manualmente no SGD, com alto custo operacional.
4. Precos de referencia ficam espalhados (Excel, PDF, historico, memoria de equipe).
5. Pos-licitacao (pedidos, saldos, entrega, ateste) fica separado da fase de cotacao.

## 2.1 Cobertura do SRD (Dores x Solucao)

1. Perder oportunidades por falta de acompanhamento.
- Solucao: monitoramento automatico SGD + painel unico + fila priorizada.

2. Perder prazo de envio de proposta.
- Solucao: alerta de prazo critico e ordenacao automatica por urgencia.

3. Participar de processos com pouca chance de ganhar.
- Solucao: score de oportunidade (chance de vitoria x margem) e ranking.

4. Dificuldade para definir o preco ideal.
- Solucao: motor de preco ideal com custo, historico, mercado e faixa sugerida.

5. Falta de historico estrategico.
- Solucao: historico unificado por escola/SRE/objeto, com analise de vencedores e padrao de compra.

6. Desorganizacao apos ganhar o processo.
- Solucao: modulo pos-licitacao integrado (ARP, saldo, pedidos, entrega, ateste).

7. Retrabalho operacional.
- Solucao: geracao de pedidos prontos para importacao e fluxo semi-automatico no SGD.

8. Falta de visao clara do potencial de faturamento.
- Solucao: dashboard com receita potencial, margem estimada, prioridade e funil.

Resumo em uma frase:
"O sistema elimina perda de oportunidades, melhora a decisao de preco, organiza contratos e reduz retrabalho, aumentando as chances de ganhar e faturar mais com seguranca."

## 3. Objetivos de Negocio

1. Pilotar na sua distribuidora e comprovar ganho financeiro.
2. Transformar em SaaS para outros fornecedores de MG.
3. Atingir previsibilidade comercial com funil: oportunidade -> proposta -> contrato -> pedido -> entrega.

## 4. Usuarios-Alvo

1. Dono/gestor comercial do fornecedor.
2. Analista de licitacoes/cotacoes.
3. Operador de pedidos pos-licitacao.
4. Gestor financeiro (margem e risco).

## 5. Proposta de Valor

"A plataforma que transforma o SGD em operacao inteligente: organiza por SRE, encontra objetos certos, sugere preco competitivo com base real e acelera envio de cotacoes com controle de margem e compliance."

## 6. Escopo Funcional (MVP -> V2)

### 6.1 Modulo A - Espelho SGD (MVP)

- Login assistido no SGD.
- Coleta de cotações da tela de Orcamento.
- Armazenamento local com historico.
- Status e prazos centralizados.

### 6.2 Modulo B - Inteligencia Territorial (MVP)

- Normalizacao de escolas por SRE + municipio.
- Filtro por SRE, municipio, escola, prazo e status.
- Mapa de calor de oportunidades por regional.

### 6.3 Modulo C - Busca por Objeto (MVP)

- Classificacao automatica do objeto/itens da cotacao.
- Busca por palavra-chave e sinonimos.
- Match entre objeto e seu catalogo de produtos.

### 6.4 Modulo D - Banco de Precos Inteligente (MVP)

- Importacao de Excel e PDF (fornecedores e historicos).
- Tabela unificada de preco por item, marca, regiao e data.
- Referencias externas (historico de compras/licitações) quando disponiveis.
- Faixa de preco sugerida (piso, alvo, teto) com justificativa.

### 6.5 Modulo E - Copiloto de Cotacao (MVP+)

- Preenchimento sugerido item a item: marca, preco, prazo, observacoes.
- Score de competitividade e risco de margem.
- Checklist antes do envio.
- Export de resumo para aprovacao humana.

### 6.6 Modulo F - Execucao no SGD (V2)

- Assistente semi-automatico para preencher cotacao no SGD.
- Modo seguro: "revisar e confirmar" antes de enviar.
- Log completo das alteracoes.

### 6.7 Modulo G - Pos-Licitacao Integrado (V2)

- Reuso do que voce ja modelou no squad `gdp`.
- Controle de ARP, pedidos, saldo, entrega, ateste e pendencias.
- Visao unica: da cotacao ao recebimento final.

### 6.8 Modulo H - Faturamento e Cobranca Nativos do GDP (V2 Prioritario)

- Descontinuar o fluxo principal de sincronizacao de pedidos para Tiny/Olist para emissao fiscal e cobranca.
- Emitir nota fiscal a partir do proprio pedido dentro do GDP.
- Exigir que cada pedido contenha os dados fiscais e cadastrais obrigatorios para emissao legal da NF.
- Incluir acao explicita no pedido para `Gerar Nota Fiscal`.
- Ao gerar a NF, registrar automaticamente o documento na aba `Notas Fiscais` com status inicial `pendente_autorizacao`.
- Preparar payload e trilha para autorizacao na SEFAZ, com status como `rascunho`, `pendente_autorizacao`, `autorizada`, `rejeitada`, `cancelada`.
- Ao gerar a NF, emitir tambem a cobranca via API bancaria, priorizando boleto.
- Manter rastreabilidade cruzada entre `pedido_id`, `nota_fiscal_id` e `cobranca_id`.

### 6.9 Modulo I - Financeiro Operacional (V2 Prioritario)

- Criar aba `Contas a Pagar` com cadastro manual e categorizacao de despesas.
- Criar aba `Contas a Receber` com registros originados de notas fiscais e tambem inclusao manual.
- Suportar formas de pagamento e recebimento: `boleto`, `pix`, `ted` e `incluir`.
- Habilitar cobranca automatica em contas a receber via e-mail e restringir o uso de WhatsApp a cobrancas de titulos vencidos/em atraso.
- Preparar conciliacao bancaria via API bancaria, conciliando cobrancas emitidas, recebimentos e baixas.
- Permitir classificacao financeira por categoria, origem, status e vencimento.

### 6.10 Modulo J - Estoque Hibrido (V2 Prioritario)

- Criar controle de estoque nativo no GDP.
- Suportar duas operacoes:
- Modo 1: entrada por nota fiscal de fornecedor e saida por nota fiscal emitida pela empresa.
- Modo 2: entrada por bipagem de codigo de barras e saida por bipagem de codigo de barras.
- O modo 2 deve atender operacoes sem estoque proprio ou com estoque parcial, nas quais a empresa compra e entrega em seguida.
- Associar movimentacoes de estoque a pedido, nota fiscal, fornecedor ou referencia operacional.
- Garantir saldo, historico de movimentacoes e rastreabilidade por SKU/codigo de barras.

### 6.11 Decisao de Prioridade (19/03/2026)

- Pos-licitacao deixa de depender de ERP externo para faturamento.
- GDP passa a incorporar fiscal, cobranca, financeiro e estoque como camada nativa do produto.
- Integracoes com SEFAZ e banco tornam-se parte do escopo do modulo operacional, nao apenas integracoes futuras.
- Integracao com Tiny/Olist deixa de ser prioridade de produto e passa a ser legado/opcional, se houver caso de uso especifico.

### 6.11.1 Provedores-Alvo da Fase Operacional (19/03/2026)

- Emissao e autorizacao de NF-e: `Focus NFe` como integrador entre GDP e SEFAZ.
- Cobranca, Pix, boleto, TED e conciliacao: `Banco Inter` via APIs oficiais da conta PJ.
- E-mail transacional para pedidos, notas e cobrancas: `Resend`.
- WhatsApp: uso restrito a cobrancas de recebimentos em atraso, via API Business com opt-in do destinatario.
- Politica operacional: e-mail permanece como canal padrao de cobranca; WhatsApp so entra em inadimplencia.

### 6.12 Decisao de Prioridade (03/03/2026)

- Prioridade absoluta: Modulos A, B, C, D e E (editais/cotacoes/preco).
- Pos-licitacao (Modulos G, H, I e J) entra em Fase 2 apos Modulo 1 ficar 100% estavel.
- Regra de foco: nao abrir novas features de pos-licitacao ate fechar criterios de aceite do modulo de editais.

## 7. Requisitos Nao Funcionais

1. Seguranca: credenciais protegidas, criptografia em repouso e em transito.
2. Rastreabilidade: log de decisoes de IA e acao do usuario.
3. Performance: abertura de painel em <3s e busca em <1s no dataset local.
4. Confiabilidade: execucao agendada de coleta com retentativas.
5. Auditabilidade: trilha de "preco sugerido -> preco enviado -> resultado".
6. Integridade fiscal: mesma operacao nao pode gerar NF duplicada para o mesmo pedido.
7. Integridade financeira: mesma cobranca nao pode ser emitida duas vezes para a mesma NF sem versao/reemissao rastreada.
8. Observabilidade: logs de integracao com codigo de erro, payload e timestamp para SEFAZ e APIs bancarias.
9. Conciliacao: eventos bancarios devem permitir reconciliacao por identificador unico da cobranca.
10. Estoque: toda entrada e saida deve deixar trilha de origem, operador, data e referencia fiscal/operacional.

## 8. Regras de Compliance

1. IA sugere, humano aprova.
2. Nunca enviar automaticamente sem confirmacao explicita.
3. Manter evidencias da formacao de preco (fonte, data, fornecedor, documento).
4. Alinhar operacao a Lei 14.133/2021 e normas especificas das caixas escolares de MG.
5. Nao permitir emissao fiscal sem os campos obrigatorios exigidos em lei para NF-e/NFS-e aplicavel.
6. Manter trilha completa entre pedido, nota fiscal, cobranca, recebimento e conciliacao.
7. Separar claramente status interno, status SEFAZ e status bancario para evitar baixa indevida.

## 9. KPIs (Sucesso)

1. Tempo medio por cotacao (meta: reduzir >= 60%).
2. Taxa de cotações enviadas dentro do prazo (meta: >= 98%).
3. Taxa de vitoria (meta: aumentar 20-30% no piloto).
4. Margem media por contrato ganho (meta: manter/elevar).
5. Receita mensal recorrente (MRR) apos abertura SaaS.
6. Taxa de emissao fiscal sem retrabalho manual >= 95%.
7. Taxa de cobrancas emitidas automaticamente apos geracao da NF >= 95%.
8. Taxa de conciliacao bancaria automatica >= 90% no piloto.
9. Tempo medio entre pedido liberado e NF pronta para autorizacao <= 2 min.
10. Divergencia de estoque por item critico <= 2% no fechamento mensal.

## 10. Roadmap de Entrega (90 dias)

### Fase 1 - Fundacao (Semanas 1-3)

- Modelo de dados (SGD + SRE + objeto + preco).
- Coletor da tela de Orcamento.
- Painel base com filtros SRE/municipio/escola.
- Exportacao CSV da fila priorizada.

### Fase 2 - Inteligencia de Preco (Semanas 4-7)

- Ingestao de Excel/PDF.
- Normalizacao de itens.
- Motor de sugestao de preco e score competitivo.
- Regra de prioridade: chance de ganho x margem x prazo.

### Fase 3 - Operacao Assistida (Semanas 8-10)

- Fluxo de aprovacao da cotacao.
- Assistente de preenchimento no SGD (sem envio automatico cego).
- Dashboard de resultados (ganhou/perdeu/margem).
- Modulo 1 considerado "100%" para entrada da Fase 2 operacional (pos-licitacao).

### Fase 4 - Piloto Comercial (Semanas 11-13)

- Operar em producao na sua distribuidora.
- Ajustar algoritmo com dados reais.
- Empacotar oferta SaaS (plano, onboarding, suporte).

## 11. Estrategia de Monetizacao

### Etapa 1 - Validacao Interna

- Meta: provar ROI real em 60-90 dias.

### Etapa 2 - Oferta SaaS B2B MG

- Plano Basico: monitoramento + filtros + dashboard.
- Plano Pro: banco de precos + IA de cotacao.
- Plano Premium: pos-licitacao integrado + suporte dedicado.

### Etapa 3 - Escala

- Canais: indicacao entre fornecedores, parceria com consultores de licitacao, conteudo tecnico.

## 12. Riscos e Mitigacoes

1. Mudanca no SGD quebrar automacao.
- Mitigacao: adaptadores de coleta e testes diarios de saude.

2. Dados de preco ruins.
- Mitigacao: score de confianca por fonte + revisao humana.

3. Risco legal/compliance.
- Mitigacao: trilha de aprovacao e justificativa de preco por item.

4. Escopo grande demais.
- Mitigacao: MVP enxuto focado em "tempo + acerto de preco".

5. Falhas de integracao com SEFAZ ou API bancaria.
- Mitigacao: fila de eventos + retentativa + dead-letter + monitoramento.

6. Duplicidade de NF ou cobranca.
- Mitigacao: chave idempotente por pedido/NF e validacao antes de emitir novamente.

7. Divergencia de estoque entre fiscal e operacao.
- Mitigacao: dupla trilha de origem (nota fiscal e bipagem), auditoria de saldo e relatorio de diferencas.

## 13. Reuso dos Squads Ja Criados

### `squads/licit-pro`

- Base para pre-licitacao: monitoramento, analise, pesquisa e precificacao.
- Aproveitar especialmente `monitor-caixas-mg` e `precificador`.

### `squads/gdp`

- Base para pos-licitacao: ARP, pedidos, logistica e analytics.
- Aproveitar fluxo de estados de pedidos e regras de validacao.
- Expandir para fiscal, financeiro, cobranca e estoque nativos.

## 14. Backlog Inicial (Epicos)

1. Epico E1: Ingestao e Espelho SGD.
2. Epico E2: Classificacao por SRE/municipio e filtro por objeto.
3. Epico E3: Banco de precos e normalizacao de itens.
4. Epico E4: Copiloto de cotacao com aprovacao humana.
5. Epico E5: Pos-licitacao integrado.
6. Epico E6: Produto SaaS e onboarding de novos fornecedores.
7. Epico E7: Emissao fiscal e cobranca bancaria nativas no GDP.
8. Epico E8: Contas a pagar, contas a receber e conciliacao bancaria.
9. Epico E9: Controle de estoque hibrido (NF + bipagem).

## 14.1 Ordem de Execucao Atual

1. E1 -> E2 -> E3 -> E4 (foco total imediato)
2. E5 -> E7 -> E8 -> E9 (somente apos Modulo 1 pronto)
3. E6 em paralelo leve (material comercial e onboarding)

## 15. Definicao de MVP Comercial

MVP esta pronto quando:

1. voce consegue ver todas as cotações em um painel unico;
2. filtra por SRE/municipio/objeto;
3. recebe sugestao de preco por item com fonte;
4. aprova e executa cotacao com menos trabalho manual;
5. mede ganho de tempo e resultado financeiro.

## 16. Orquestracao de Squads (Padrao AIOS + Custom)

O projeto vai operar com dois niveis de squads:

1. Squads padrao AIOS (base):
- `@architect`: arquitetura tecnica e integracoes.
- `@dev`: implementacao de frontend/backend.
- `@qa`: qualidade, testes e risco.
- `@devops`: pipeline, execucao agendada, observabilidade.
- `@pm`, `@po`, `@sm`, `@analyst`: produto, backlog e validacao continua.

2. Squads custom do projeto:
- `squads/licit-pro`: pre-licitacao e inteligencia de cotacao.
- `squads/gdp`: pos-licitacao e operacao de pedidos.

Regra de trabalho:
- AIOS padrao comanda engenharia, qualidade e entrega.
- Squads custom comandam regras de dominio do negocio.
- Orquestracao central via agente mestre para evitar trabalho manual de chamada agente a agente.
