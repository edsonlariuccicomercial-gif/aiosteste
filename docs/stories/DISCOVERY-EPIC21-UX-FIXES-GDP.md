# Discovery Report — Ajustes UX/Bugs GDP (candidato a Epic 21)

**Autor:** Atlas (@analyst)
**Data:** 2026-06-20
**Branch:** feature/epic20-ajustes-financeiro-gdp
**Status:** Investigação concluída → handoff para @pm

> Relatório de investigação técnica dos pontos relatados pelo cliente. Todas as evidências são `arquivo:linha`. Nenhum arquivo foi alterado nesta fase. Serve de insumo direto para o @pm criar o Epic + stories.

---

## Contexto do sistema

Sistema multi-página (HTML estático + módulos JS) sob
`painel-caixa-escolar/squads/caixa-escolar/dashboard/`. Persistência via Supabase
(`gdp-api.js`) + localStorage como cache/fallback. Produção em
`painel-caixa-escolar.vercel.app` (deploy com `--force`, bump de `?v=N`).

---

## Achados (8 frentes)

### F1 — Filtros não resetam ao sair da página (transversal)

**Comportamento desejado:** ao sair de uma aba/página/modal, limpar filtros e voltar
ao estado padrão ("limpo"), evitando que pesquisas anteriores travem/confundam.

**Reset existente (parcial):** `resetTabState()` em `js/gdp-init.js:43-81` é chamado por
`switchTab()` e limpa CORRETAMENTE alguns inputs de busca (`busca-*`) e checkboxes —
mas NÃO cobre os selects de filtro avançado nem o reset ao fechar modais/detalhes.

Pontos que NÃO resetam:
- `js/gdp-pedidos.js:185-207` — `renderPedidos`: `filtro-contrato-pedido` e `filtro-entrega-pedido` ficam ativos.
- `js/gdp-pedidos.js:1850` — `renderNotasFiscais`: `cp-filtro-categoria` não reseta.
- `js/gdp-estoque-intel.js:1972-2114` — `renderEstoque`: filtros base/categoria/tipo/data/cliente persistem.
- `js/gdp-init.js:1164-1165` — `renderIntegracoesGdp`: `int-filtro-status` e `int-filtro-canal` persistem.
- `js/gdp-entregas.js:105-107` — `renderEntregas`: `filtro-data-entrega` e `filtro-status-entrega` persistem.
- `js/gdp-contratos-module.js:3074` — `fecharModalContrato`: volta à listagem sem limpar a busca de contratos.
- Contas a Pagar/Receber: aba de status (`contaPagarStatusTabAtual`/`contaReceberStatusTabAtual`) fica memorizada (`gdp-init.js:745`, `:785`).

**Recomendação:** centralizar um `resetFilters(scope)` chamado por `switchTab()` E por todo
`closeModal/fecharModal*`, cobrindo selects/date/inputs além dos `busca-*` já cobertos.

---

### F2 — Telas fecham ao salvar (deveriam permanecer abertas)

**Comportamento desejado:** ao salvar, gravar no banco, LIMPAR campos para novo registro,
e MANTER a tela aberta (o usuário decide quando sair).

Saves que fecham a tela:
- `js/gdp-init.js:512` — `salvarEditCrDetalhe` → `fecharDetalheCr()` (comentário "Auto-close after save").
- `js/gdp-init.js:1095` — `salvarEditCpDetalhe` → `fecharDetalheCp()`.
- `js/gdp-init.js:784` — `registrarContaReceber` → `toggleContaReceberForm(false)`.
- `js/gdp-init.js:744` — `registrarContaPagar` → `toggleContaPagarForm(false)`.
- `js/gdp-contratos-module.js:2722` — `salvarContrato` → `fecharModalContrato()`.
- `js/gdp-estoque-intel.js:1260/1689/1759/1498` — fornecedor/produto/embalagem/compra: modal escondido após salvar.

**Recomendação:** padrão "salvar e continuar" — após sucesso: persistir → toast curto →
`reset` dos campos do form → manter modal aberto. Opcional: botão secundário
"Salvar e fechar" para o fluxo antigo.

---

### F3 — Checkboxes não desmarcam após a ação (transversal)

**Comportamento desejado:** após a ação em lote, desmarcar automaticamente (item saiu da fila).

- `js/gdp-init.js:354` — `bulkImprimirBoletos`: **BUG confirmado** — não chama
  `_selectedContaReceberIds.clear()` nem re-render; checkboxes permanecem marcados.
- OK (referência de padrão correto): `bulkReceberContas` (`gdp-init.js:344-345`) e
  `bulkExcluirContasReceber` (`:382-383`) limpam o Set e re-renderizam.
- A verificar (mesmo padrão): `sincronizarBancoProdutos` (`gdp-banco-produtos.js:1459`),
  `adicionarSelecionadosAoCatalogo` (`gdp-contratos-module.js:2600`) — risco de re-ação/duplicação sem reset.

**Recomendação:** toda ação em lote deve, no sucesso, `selectedSet.clear()` + re-render.

---

### F4 — Edição de preços dos itens do contrato salva campo-a-campo (lentidão)

Tela: Contratos → Detalhes do contrato → campos de preço dos itens.

- Render do input: `js/gdp-contratos-module.js:3007` —
  `onchange="salvarPrecoItemContrato('${c.id}',${idx},this.value)"`.
- Handler: `js/gdp-core.js:2503-2511` — `salvarPrecoItemContrato` salva a cada campo
  (`saveContratos()`), chama `syncContratoItemToPedidos()` e exibe `showToast('Preco atualizado...', 2000)`.

**Causa:** persistência + sync + toast disparados no `onchange` de CADA campo →
sensação de "parar pra pensar" entre um campo e outro.

**Recomendação:** editar localmente todos os campos sem persistir e gravar TUDO num único
"Salvar" ao fim (batch). Alternativa: debounce + atualização silenciosa (sem toast por campo).
Garantir persistência em Supabase no save final (hoje é só localStorage).

---

### F5 — Botão "Recalcular saldo" não zera entregas / não volta ao original

Tela: Contratos → Detalhes do contrato → botão "Recalcular saldo" (`gdp-contratos.html:2955`).

- Função: `js/gdp-contratos-module.js:3130-3166` — `recalcularSaldoContrato`.
  Linha 3138-3139 zera `qtdEntregue`, mas 3141-3150 **reconstrói** `qtdEntregue` somando
  os pedidos existentes. Resultado: o saldo volta ao mesmo valor (é um "refresh", não um "reset").
- Persistência: `saveContratos()` (`:3157`) grava só em localStorage (não sincroniza Supabase).

**Ambiguidade de requisito (decisão p/ @pm):** o cliente diz que "deveria zerar as entregas e o
saldo voltar ao original do contrato". Isso conflita com reconstruir a partir de pedidos reais.
Definir a semântica correta do botão: (a) **reset puro** (zera entregas → saldo = contratado), ou
(b) **reconciliar** com pedidos reais (comportamento atual). Provável intenção: (a).

---

### F6 — Portal escolar: validação de estoque inconsistente catálogo × carrinho

Arquivo: `gdp-portal.html`.

- `qtdDisponivel = qtdContratada - qtdEntregue` (`:1117-1118`).
- Catálogo `addToCart()` (`:1351-1382`): valida rigorosamente — ajusta `qty>max`, bloqueia `max<=0`, valida saldo financeiro.
- Carrinho `cartQty()` (`:1509-1531`): ajusta silenciosamente, e ao **diminuir** (`delta<0`) não revalida limite.

**Bug:** usuário é barrado em 10 no catálogo (ajustado p/ 9) mas no carrinho consegue subir de
volta para 10 via `cartQty('+1')`. Validação divergente entre as duas telas.

**Recomendação:** extrair função única `validarQuantidade(name, qtyDesejada)` usada por ambos
catálogo e carrinho (single source of truth), aplicando teto de estoque E saldo financeiro.

---

### F7 — Portal escolar: falta filtro de contratos Ativos/Encerrados

Arquivo: `gdp-portal.html`.

- Contratos carregados em `getSchoolContracts()` (`:851-883`) e exibidos em
  `showContractSelection()` (`:921-950`).
- Campos disponíveis na tabela `contratos`: `status` e `vigencia` (`gdp-api.js:117`).
  Exibição já usa `${c.status || 'ativo'}` (`:940`) e `c.vigencia` (`:946,:1179`).

**Recomendação:** adicionar UI de filtro (Ativos/Encerrados/Todos) em `showContractSelection()`
(~`:885`).

**DECISÃO DO CLIENTE (2026-06-20):** o filtro deve usar EXCLUSIVAMENTE o campo `c.status`
(ativo/encerrado), que já é definido no módulo Contratos do GDP e já é exibido no badge do portal
(`gdp-portal.html:940`). NÃO derivar de vigência. Escopo: apenas adicionar o controle de filtro
(Ativos/Encerrados/Todos) que filtra os cards por `c.status`. Sem nova lógica de status.

---

### F8 — Contrato "Caixa Escolar São Benedito" com dados quebrados

Dados: `data/lariucci-arp-2025.json:523-553`.

- Contrato `id: "sao-benedito"` (6 itens) tem preços mas **sem `quantidade`/`qtdContratada`**
  (todos `estoque:0`, sem quantidade contratada).
- Efeito no render (`js/gdp-contratos-module.js:2148-2171`, `abrirContrato` `:2899-2950`,
  tabela de itens `:2979-3014`):
  - Total contratado = R$ 0,00 (sem crash — há guarda contra divisão por zero).
  - Itens pendentes = 0 (lógica `0 < 0` falsa).
  - Saldo pode ficar negativo se houver entregas (`totalContratado - totalEntregue`).

**Causa raiz:** integridade de dados (campo `quantidade` ausente nesse contrato), não lógica.
**Recomendação:** (a) corrigir o dado-fonte com as quantidades reais do contrato São Benedito; e
(b) endurecer o render para sinalizar "sem quantidade contratada" em vez de exibir R$ 0,00 / saldo
enganoso. `sanitizeContratoLegacyData` (`gdp-core.js:984-989`) não valida quantidade ausente.

---

### F9 — Vencimento das contas a receber NÃO conta a partir da emissão da NF

Pedido do cliente (sessão anterior, Story 20.7): vencimento das contas a receber deve contar
a partir da **data de emissão da NF** + prazo. Não está acontecendo.

**Causa raiz (confirmada):**
- `buildReceivableFromInvoice` (`js/gdp-notas-fiscais.js:846-854`) só calcula
  `emissão + prazoRecebimentoDias` **quando `invoice.vencimento` está vazio** (`:848` `let dueDateStr = invoice.vencimento;`).
- Mas o `vencimento` da NF já é preenchido na criação (`:789`) a partir de
  `pedido.data || pedido.dataEntrega` (data do PEDIDO/entrega) via `calcularVencimentoPagamento`.
- Logo, o ramo da Story 20.7 (`:850-853`) **nunca executa** — o vencimento herda a base errada
  (data do pedido), não a emissão da NF.

**Recomendação:** em `buildReceivableFromInvoice`, calcular o vencimento SEMPRE a partir de
`invoice.emitidaEm + prazoRecebimentoDias`, ignorando (ou recalculando) o `vencimento` herdado do
pedido para a conta a receber. Validar interação com `getFinancasConfig().prazoRecebimentoDias`
(`gdp-notas-fiscais.js:317-324`).

---

## Mapa de impacto / risco

| # | Frente | Tipo | Arquivos-chave | Risco |
|---|--------|------|----------------|-------|
| F1 | Reset de filtros | Transversal/UX | gdp-init.js, gdp-pedidos.js, gdp-estoque-intel.js, gdp-entregas.js, gdp-contratos-module.js | Médio |
| F2 | Salvar mantém tela | Transversal/UX | gdp-init.js, gdp-contratos-module.js, gdp-estoque-intel.js | Médio |
| F3 | Checkboxes desmarcam | Transversal/UX | gdp-init.js (+verificar banco-produtos, contratos) | Baixo |
| F4 | Edição preço batch | Contratos/Perf | gdp-contratos-module.js, gdp-core.js | Médio |
| F5 | Recalcular saldo | Contratos/Lógica | gdp-contratos-module.js | Médio (requisito a confirmar) |
| F6 | Estoque catálogo×carrinho | Portal/Lógica | gdp-portal.html | Alto (afeta pedido real) |
| F7 | Filtro ativo/encerrado | Portal/Feature | gdp-portal.html, gdp-api.js | Baixo |
| F8 | São Benedito | Dados | lariucci-arp-2025.json, gdp-contratos-module.js | Médio (dado + render) |
| F9 | Vencimento via emissão NF | Financeiro/Lógica | gdp-notas-fiscais.js | Alto (financeiro) |

---

## Decisões fechadas com o cliente (2026-06-20)

Cliente orientou seguir o **padrão de UX de sistemas modernos** nessas questões (sem
re-perguntar o óbvio). Decisões registradas:

1. **F2 (salvar):** botão **"Salvar"** = grava + limpa campos + mantém a tela aberta
   (padrão "save and create another"). Fechar é responsabilidade do usuário (X / Cancelar /
   Esc / clicar fora). **NÃO** adicionar botão "Salvar e fechar". Aplicar em todos os
   formulários/modais listados em F2.
2. **F5:** "Recalcular saldo" = **reset puro** — zera entregas (`qtdEntregue=0`) → saldo volta
   ao total contratado original. Remover a reconstrução a partir de pedidos. Persistir em Supabase.
3. **F7:** filtro Ativos/Encerrados no portal usa **exclusivamente `c.status`** (já vindo do
   módulo Contratos do GDP e já exibido no badge). Sem regra de vigência.
4. **F8:** cliente **fornecerá as quantidades reais** dos itens do contrato São Benedito.
   Até lá: endurecer o render para sinalizar "sem quantidade contratada" em vez de R$ 0,00/saldo
   enganoso; ao receber as quantidades, corrigir o dado-fonte.

### Convenções modernas a aplicar nas demais frentes (sem nova elicitação)

- **F1:** ao sair de aba/fechar modal, resetar filtros (busca, selects, datas) → estado limpo ao reentrar.
- **F3:** ação em lote desmarca os checkboxes automaticamente no sucesso (item saiu da fila).
- **F4:** edição de preços em **batch** (edita todos os campos, salva tudo num único "Salvar");
  sem toast/persistência por campo. Persistência final em Supabase.
- **F6:** validação ÚNICA de estoque/saldo compartilhada entre catálogo (`addToCart`) e carrinho (`cartQty`).
- **F9:** vencimento da conta a receber sempre a partir de `invoice.emitidaEm` + `prazoRecebimentoDias`
  (ignorar/recalcular o vencimento herdado do pedido).

---

— Atlas, investigando a verdade 🔎
