# GDP Fiscal / Financeiro / Estoque Architecture

**Fase:** Evolucao do GDP  
**Agente:** @architect  
**Data:** 2026-03-19  
**Versao:** 1.0

---

## 1. Objetivo

Reposicionar o GDP como modulo operacional nativo de faturamento, cobranca, financeiro e estoque, removendo Tiny/Olist como dependencia principal do fluxo pos-licitacao.

---

## 2. Decisao Arquitetural

### 2.1 Nova direcao

- Pedido continua sendo o gatilho central do fluxo.
- A partir do pedido, o GDP passa a gerar:
- nota fiscal
- cobranca bancaria
- conta a receber
- saida de estoque fiscal

### 2.2 Integracoes

- `SEFAZ`: integracao futura para autorizacao fiscal
- `API bancaria`: integracao futura para boleto, Pix, TED e conciliacao
- `Tiny/Olist`: legado/opcional, fora do fluxo principal

---

## 3. Modelo de Dominio

### 3.1 Entidades

#### `pedido`
- `id`
- `contratoId`
- `cliente`
- `itens[]`
- `valor`
- `status`
- `fiscal.notaFiscalId`
- `fiscal.cobrancaId`

#### `nota_fiscal`
- `id`
- `numero`
- `serie`
- `pedidoId`
- `contratoId`
- `cliente`
- `itens[]`
- `valor`
- `status`
- `sefaz.status`
- `sefaz.protocolo`
- `sefaz.chaveAcesso`

#### `conta_receber`
- `id`
- `origemTipo`
- `origemId`
- `notaFiscalId`
- `pedidoId`
- `categoria`
- `forma`
- `valor`
- `vencimento`
- `status`
- `automacao.whatsapp`
- `automacao.email`

#### `conta_pagar`
- `id`
- `descricao`
- `categoria`
- `forma`
- `valor`
- `vencimento`
- `status`

#### `movimento_estoque`
- `id`
- `tipo` (`entrada` | `saida`)
- `modo` (`nota_fiscal` | `bipagem`)
- `sku`
- `descricao`
- `categoria`
- `quantidade`
- `referencia`
- `data`

---

## 4. Fluxos

### 4.1 Pedido -> NF -> Cobranca

```text
Pedido liberado
  -> validacao fiscal minima
  -> gerar nota fiscal
  -> persistir NF
  -> gerar cobranca bancaria
  -> abrir conta a receber
  -> registrar saida de estoque por NF
```

### 4.2 Financeiro

```text
NF gerada
  -> conta a receber automatica
  -> cobranca via boleto/Pix/TED
  -> disparo WhatsApp/e-mail
  -> retorno bancario futuro
  -> conciliacao
```

### 4.3 Estoque hibrido

```text
Modo 1:
NF fornecedor -> entrada
NF empresa -> saida

Modo 2:
Bipagem entrada -> saldo
Bipagem saida -> saldo
```

---

## 5. Persistencia

Persistencia local/cloud usando o padrao wrapper ja existente do GDP:

- `gdp.notas-fiscais.v1`
- `gdp.contas-pagar.v1`
- `gdp.contas-receber.v1`
- `gdp.estoque.movimentos.v1`

Todos devem manter:
- `_v`
- `updatedAt`
- `items[]`

---

## 6. Regras de Integridade

- Um pedido nao pode gerar duas NFs ativas sem fluxo explicito de reemissao.
- Uma NF deve sempre apontar para exatamente um pedido de origem.
- Uma conta a receber originada de NF deve apontar para a NF e o pedido.
- Movimentos de estoque por NF devem ser reconciliaveis com os itens da NF.
- A conciliacao bancaria deve operar sobre identificador unico de cobranca.

---

## 7. Riscos Tecnicos

- `gdp-contratos.html` continua monolitico e concentra dominio demais.
- A integracao real com SEFAZ e banco exigira backend dedicado ou functions autenticadas.
- O uso de `localStorage` e wrapper JSON serve para MVP, mas nao e modelo final ideal para financeiro/fiscal.
- Conciliacao bancaria real exigira idempotencia forte e trilha de auditoria.

---

## 8. Recomendacao de Proxima Arquitetura

### Sprint curta
- consolidar fluxo no frontend atual
- estabilizar modelo
- validar operacao interna

### Sprint seguinte
- extrair camada de dominio fiscal/financeiro para modulos JS dedicados
- mover integracoes externas para functions/backend
- desenhar fila de eventos para SEFAZ e banco

---

## 9. File List

| File | Papel |
|------|-------|
| `squads/caixa-escolar/dashboard/gdp-contratos.html` | shell funcional atual |
| `docs/strategy/PDR-PRD-LicitIA-MG.md` | direcao de produto |
| `docs/stories/4.18.story.md` | emissao fiscal |
| `docs/stories/4.19.story.md` | notas fiscais + cobranca |
| `docs/stories/4.20.story.md` | financeiro |
| `docs/stories/4.21.story.md` | estoque |
