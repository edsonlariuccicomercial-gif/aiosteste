# EPIC-21: Ajustes UX & Correção de Bugs GDP (Filtros, Salvar, Checkboxes, Contratos, Portal, Financeiro)

## Contexto

Conjunto de ajustes de usabilidade e correção de bugs no **GDP**, relatados pelo stakeholder (Edson) e investigados com causa-raiz por evidência de código pelo **@analyst (Atlas)**.

Brief de investigação: `docs/stories/DISCOVERY-EPIC21-UX-FIXES-GDP.md` + handoff `.aiox/handoffs/handoff-analyst-to-pm-ux-fixes-gdp-20260620.yaml` (2026-06-20).

Tema central: **padronizar o comportamento de UX em todo o sistema** (estado limpo ao reentrar, salvar sem fechar, checkbox que desmarca após a ação) e **corrigir bugs localizados** em Contratos, Portal Escolar e Financeiro. Assim como o EPIC-20, é majoritariamente **frontend + lógica de cliente**, sem novo DDL — com persistência no padrão `localStorage + Supabase`.

## Objetivo

Deixar o GDP consistente com o padrão de UX de sistemas modernos e eliminar os bugs que confundem o operador: filtros sempre limpos ao reentrar numa tela, formulários que salvam sem fechar (limpando campos para o próximo registro), checkboxes de ação em lote que se desmarcam após a ação, edição ágil de preços de contrato (batch), botão de recalcular saldo que de fato reseta, validação de estoque coerente no portal, filtro de contratos por status no portal, contrato São Benedito corrigido, e vencimento de contas a receber calculado a partir da emissão da NF.

## Decisões do Stakeholder (Edson — 2026-06-20)

Orientação geral: **seguir o padrão de UX de sistemas modernos**, sem re-elicitar o óbvio.

- **Salvar (F2):** botão **"Salvar"** = grava no banco + **limpa os campos** + **mantém a tela aberta** (padrão "save and create another"). Fechar é responsabilidade do usuário (X / Cancelar / Esc / clicar fora). **NÃO** adicionar botão "Salvar e fechar".
- **Recalcular saldo (F5):** **reset puro** — zera as entregas (`qtdEntregue=0`) e o saldo volta ao **total contratado original**. Remover a reconstrução a partir dos pedidos. Persistir em Supabase.
- **Filtro de status no portal (F7):** usar **exclusivamente o campo `c.status`** (ativo/encerrado) já definido no módulo Contratos do GDP e já exibido no badge do portal. **Sem** regra de vigência. Escopo: só adicionar o controle de filtro.
- **Contrato São Benedito (F8):** o cliente **fornecerá as quantidades reais** dos itens. Até lá: **endurecer o render** para sinalizar "sem quantidade contratada" em vez de R$ 0,00/saldo enganoso; corrigir o dado-fonte ao receber as quantidades.
- **Filtros (F1):** ao sair de aba/fechar modal → resetar filtros (busca, selects, datas) para estado limpo ao reentrar.
- **Checkboxes (F3):** ação em lote desmarca automaticamente os checkboxes no sucesso.
- **Edição de preços (F4):** modo **batch** — edita todos os campos e salva tudo num único "Salvar"; sem toast/persistência por campo.
- **Estoque portal (F6):** validação **única** de estoque/saldo compartilhada entre catálogo e carrinho.
- **Vencimento (F9):** conta a receber de NF = **`invoice.emitidaEm` + `prazoRecebimentoDias`** (config Finanças); ignorar/recalcular o vencimento herdado do pedido.

## Arquitetura Atual (AS-IS)

```
Filtros:    resetTabState() cobre só busca-* e checkboxes; selects/datas de Pedidos, NF, Estoque,
            Integrações, Entregas e o fecharModalContrato não resetam.
Salvar:     9 saves chamam fecharModal/toggleForm(false) após sucesso (CR/CP detalhe e registro,
            Contrato, Estoque Intel fornecedor/produto/embalagem/compra).
Checkboxes: bulkImprimirBoletos não limpa o Set nem re-renderiza (permanecem marcados).
Preços:     onchange por campo → salvarPrecoItemContrato → saveContratos + sync + toast(2s) por campo.
Recalcular: recalcularSaldoContrato zera e reconstrói qtdEntregue a partir dos pedidos (refresh, não reset);
            só localStorage.
Portal qtd: addToCart valida rígido; cartQty ajusta silencioso e não revalida ao diminuir → divergência.
Portal flt: c.status já exibido no badge, mas não há filtro por status.
SãoBenedito: itens sem quantidade/qtdContratada → total R$ 0,00, itens pendentes 0, saldo enganoso.
Vencimento: NF nasce com vencimento da data do pedido (gdp-notas-fiscais.js:789); ramo emissão+prazo
            (buildReceivableFromInvoice :850-853) nunca roda porque invoice.vencimento já vem preenchido.
```

## Arquitetura Proposta (TO-BE)

```
Filtros:    resetFilters(scope) central, chamado por switchTab() E por todo closeModal/fecharModal*;
            cobre busca + selects + datas + abas de status memorizadas.
Salvar:     padrão "salvar e continuar" — persistir → toast curto → reset dos campos → manter aberto.
Checkboxes: toda ação em lote, no sucesso: selectedSet.clear() + re-render.
Preços:     edição local de todos os campos → único "Salvar" (batch) → persistência Supabase; sem toast por campo.
Recalcular: reset puro — qtdEntregue=0 em todos os itens → saldo = total contratado; persistir Supabase.
Portal qtd: validarQuantidade(name, qtyDesejada) única, usada por addToCart E cartQty (teto estoque + saldo financeiro).
Portal flt: controle de filtro (Ativos/Encerrados/Todos) em showContractSelection() filtrando por c.status.
SãoBenedito: render sinaliza "sem quantidade contratada"; dado-fonte corrigido com quantidades reais (quando enviadas).
Vencimento: buildReceivableFromInvoice calcula sempre emitidaEm + prazoRecebimentoDias para a CR.
```

## Tabela Sintoma → Causa → Story

| Sintoma (stakeholder) | Causa-raiz (evidência) | Story | Onda |
|-----------------------|------------------------|-------|------|
| Vencimento da CR não conta da emissão da NF | `invoice.vencimento` herdado do pedido (`gdp-notas-fiscais.js:789`) faz o ramo emissão+prazo (`:850-853`) nunca rodar | **21.1** (UX-F9) | 1 |
| Estoque "disponível" no catálogo é furado no carrinho | `cartQty()` (`gdp-portal.html:1509-1531`) valida diferente de `addToCart()` (`:1351-1382`) | **21.2** (UX-F6) | 1 |
| "Recalcular saldo" não zera entregas | `recalcularSaldoContrato` reconstrói a partir dos pedidos (`gdp-contratos-module.js:3130-3166`) | **21.3** (UX-F5) | 1 |
| Editar preços de contrato "trava" a cada campo | `onchange`→`salvarPrecoItemContrato` salva+sync+toast por campo (`gdp-core.js:2503-2511`, render `:3007`) | **21.4** (UX-F4) | 1 |
| Contrato São Benedito mostra R$ 0,00/saldo errado | Itens sem `quantidade` no dado-fonte (`lariucci-arp-2025.json:523-553`) | **21.5** (UX-F8) | 1 |
| Falta filtro de contratos ativos/encerrados no portal | `showContractSelection()` (`gdp-portal.html:921-950`) não tem filtro por `c.status` | **21.6** (UX-F7) | 1 |
| Checkbox em lote continua marcado após a ação | `bulkImprimirBoletos` (`gdp-init.js:349-354`) não limpa o Set nem re-renderiza | **21.7** (UX-F3) | 2 |
| Salvar fecha a tela | 9 saves chamam `fecharModal/toggleForm(false)` (vários, ver story) | **21.8** (UX-F2) | 2 |
| Filtros não limpam ao sair da página | `resetTabState()` (`gdp-init.js:43-81`) não cobre selects/datas nem fechamento de modais | **21.9** (UX-F1) | 2 |

**Notas de priorização:** Onda 1 = bugs de maior impacto direto/financeiro e correções localizadas independentes. Onda 2 = padrões transversais (tocam muitos arquivos; maior risco de regressão, melhor consolidar regra única). Não há dependências fortes entre stories; 21.5 tem dependência externa (cliente enviar quantidades) mas a parte de render é independente.

---

# ONDA 1 — Bugs de impacto + correções localizadas

## STORY 21.1 — Contas a Receber: vencimento a partir da emissão da NF

**Resolve:** UX-F9 · **Prioridade:** P1 · **Risco:** ALTO (financeiro) · **Complexidade:** S

### Descrição
A conta a receber originada de uma NF deve ter vencimento = **data de emissão da NF + prazo configurado** (`prazoRecebimentoDias`). Hoje o vencimento herda a data do pedido, porque a NF já nasce com `vencimento` preenchido a partir de `pedido.data || pedido.dataEntrega`, e `buildReceivableFromInvoice` só calcula emissão+prazo quando o campo está vazio — então o ramo correto (Story 20.7) nunca executa.

### Requisitos Funcionais
- **FR-21.1.1:** `buildReceivableFromInvoice` (`gdp-notas-fiscais.js:846-854`) deve calcular o vencimento da CR **sempre** a partir de `invoice.emitidaEm + getFinancasConfig().prazoRecebimentoDias`, **não** reutilizando o `invoice.vencimento` herdado do pedido.
- **FR-21.1.2:** Preservar `prazoRecebimentoDias` configurável (Finanças) e o default já vigente; não reintroduzir prazos hardcoded.
- **FR-21.1.3:** Não alterar o vencimento de cobrança do pedido em si (apenas a CR derivada da NF).

### Critérios de Aceitação
- **AC1:** *Given* uma NF emitida em D com prazo configurado de N dias, *When* a CR é gerada, *Then* o vencimento da CR = D + N.
- **AC2:** *Given* um pedido com data anterior à emissão da NF, *When* a CR é gerada, *Then* o vencimento ignora a data do pedido e usa a emissão da NF.
- **AC3:** *Given* `prazoRecebimentoDias` alterado na config Finanças, *When* uma nova CR é gerada, *Then* o vencimento reflete o novo prazo.

### Escopo
- **IN:** cálculo do vencimento da CR derivada de NF. **OUT:** vencimento de cobrança do pedido; layout.

### Arquivos
- `js/gdp-notas-fiscais.js:846-854` (`buildReceivableFromInvoice`), `:789` (origem do `invoice.vencimento`), `:317-324` (`getFinancasConfig`)

---

## STORY 21.2 — Portal Escolar: validação única de quantidade/saldo (catálogo × carrinho)

**Resolve:** UX-F6 · **Prioridade:** P1 · **Risco:** ALTO (afeta pedido real) · **Complexidade:** M

### Descrição
No catálogo, um produto informa X unidades disponíveis; ao tentar adicionar X, o sistema barra e ajusta (ex.: para X-1). Porém, dentro do carrinho, o usuário consegue elevar a quantidade de volta para X (ou além), porque a validação do carrinho diverge da do catálogo. A validação de estoque/saldo deve ser **única e consistente** nas duas telas.

### Requisitos Funcionais
- **FR-21.2.1:** Extrair uma função única `validarQuantidade(name, qtyDesejada)` (single source of truth) que aplique teto de **estoque/saldo disponível** (`qtdDisponivel = qtdContratada - qtdEntregue`) **e** saldo financeiro (`saldo_disponivel`).
- **FR-21.2.2:** `addToCart()` e `cartQty()` devem ambos usar essa função, com o mesmo resultado para a mesma entrada.
- **FR-21.2.3:** Ao **diminuir** quantidade no carrinho, manter limites válidos (mínimo 1) sem permitir reentrar acima do teto.

### Critérios de Aceitação
- **AC1:** *Given* produto com 10 disponíveis, *When* tento adicionar 10 no catálogo, *Then* sou ajustado/barrado conforme o teto.
- **AC2:** *Given* a mesma situação, *When* tento elevar para 10 dentro do carrinho, *Then* sou barrado igual ao catálogo (não consigo ultrapassar o teto).
- **AC3:** *Given* saldo financeiro insuficiente, *When* aumento a quantidade em qualquer das telas, *Then* a ação é bloqueada com a mesma mensagem.

### Escopo
- **IN:** validação de quantidade/saldo no portal (catálogo e carrinho). **OUT:** mudança no cálculo de `qtdDisponivel`/`saldo_disponivel`.

### Arquivos
- `gdp-portal.html:1117-1146` (`qtdDisponivel`), `:1351-1382` (`addToCart`), `:1509-1531` (`cartQty`), `getMaxQty`/`getCartTotal`

---

## STORY 21.3 — Contratos: "Recalcular saldo" = reset puro (zera entregas)

**Resolve:** UX-F5 · **Prioridade:** P1 · **Risco:** MÉDIO · **Complexidade:** S

### Descrição
Na tela de Detalhes do Contrato, o botão "Recalcular saldo" deve **zerar as entregas** e fazer o **saldo voltar ao total contratado original**. Hoje a função zera `qtdEntregue` mas imediatamente reconstrói a partir dos pedidos existentes (vira um "refresh"), então o saldo não muda. Decisão do cliente: **reset puro**.

### Requisitos Funcionais
- **FR-21.3.1:** `recalcularSaldoContrato` deve zerar `qtdEntregue` de todos os itens e **não** reconstruir a partir dos pedidos.
- **FR-21.3.2:** O saldo exibido deve passar a refletir `total contratado` (entregue = 0).
- **FR-21.3.3:** Persistir a alteração em **Supabase** (não só localStorage).
- **FR-21.3.4:** Confirmar a ação com o operador (é destrutiva: zera entregas), com toast/aviso claro.

### Critérios de Aceitação
- **AC1:** *Given* um contrato com entregas registradas, *When* clico em "Recalcular saldo" e confirmo, *Then* todas as `qtdEntregue` ficam 0 e o saldo = total contratado.
- **AC2:** *Given* a ação concluída, *When* recarrego/reabro o contrato (inclusive em outra máquina), *Then* o estado zerado persiste (Supabase).
- **AC3:** *Given* o clique no botão, *When* não confirmo, *Then* nada é alterado.

### Escopo
- **IN:** comportamento e persistência do recálculo. **OUT:** alterar a lógica de pedidos/entregas em si.

### Arquivos
- `js/gdp-contratos-module.js:3130-3166` (`recalcularSaldoContrato`), `gdp-contratos.html:2955` (botão)

---

## STORY 21.4 — Contratos: edição de preços dos itens em modo batch (sem travar campo a campo)

**Resolve:** UX-F4 · **Prioridade:** P2 · **Risco:** MÉDIO · **Complexidade:** M

### Descrição
Ao alterar preços dos itens na tela de Detalhes do Contrato, cada campo dispara persistência + sync + toast no `onchange`, causando lentidão e a sensação de "parar pra pensar" entre campos. O esperado: editar todos os campos com agilidade e **salvar tudo ao fim** num único "Salvar".

### Requisitos Funcionais
- **FR-21.4.1:** Remover a persistência por campo (`onchange` → save imediato). A edição deve apenas atualizar o estado local da tela.
- **FR-21.4.2:** Adicionar um botão **"Salvar"** (batch) que persiste todas as alterações de preço de uma vez, com **um** toast de confirmação ao fim.
- **FR-21.4.3:** A persistência final deve gravar em **Supabase** (não só localStorage) e disparar o sync com pedidos uma única vez.
- **FR-21.4.4:** Sinalizar visualmente que há alterações não salvas (dirty state) e evitar perda silenciosa ao sair (consistente com o padrão de salvar do F2).

### Critérios de Aceitação
- **AC1:** *Given* a tabela de itens, *When* altero vários campos de preço em sequência, *Then* a digitação é fluida (sem toast/persistência por campo).
- **AC2:** *Given* alterações feitas, *When* clico em "Salvar", *Then* todas são persistidas (Supabase) com um único toast e o sync ocorre uma vez.
- **AC3:** *Given* alterações não salvas, *When* tento sair sem salvar, *Then* sou avisado/o save é oferecido.

### Escopo
- **IN:** fluxo de edição/persistência de preços de itens. **OUT:** mudar a fórmula de preço/regra de negócio.

### Arquivos
- `js/gdp-contratos-module.js:3007` (render do input), `js/gdp-core.js:2503-2511` (`salvarPrecoItemContrato`, `syncContratoItemToPedidos`)

---

## STORY 21.5 — Contratos: corrigir contrato "Caixa Escolar São Benedito"

**Resolve:** UX-F8 · **Prioridade:** P1 · **Risco:** MÉDIO (dado + render) · **Complexidade:** S

### Descrição
O contrato "São Benedito" exibe total R$ 0,00, nenhum item pendente e saldo enganoso porque os itens não têm `quantidade`/`qtdContratada` no dado-fonte (só preços). Correção em duas frentes: (a) endurecer o render para sinalizar a ausência de quantidade; (b) corrigir o dado-fonte com as quantidades reais (a serem fornecidas pelo cliente).

### Requisitos Funcionais
- **FR-21.5.1 (render):** Quando um item não tiver `quantidade`/`qtdContratada` (ou for 0 sem ser intencional), exibir indicador claro ("sem quantidade contratada") em vez de R$ 0,00 / saldo 0 enganoso. `sanitizeContratoLegacyData` deve sinalizar o caso.
- **FR-21.5.2 (dado):** Ao receber as quantidades reais do cliente, atualizar `data/lariucci-arp-2025.json` (contrato `sao-benedito`, e verificar `sao-benedito-proc`) com as `quantidade` corretas.
- **FR-21.5.3:** Evitar saldo negativo silencioso quando há entregas sem quantidade contratada (guarda explícita).

### Critérios de Aceitação
- **AC1:** *Given* itens sem quantidade, *When* abro o contrato São Benedito, *Then* a UI sinaliza "sem quantidade contratada" em vez de R$ 0,00/saldo 0.
- **AC2:** *Given* as quantidades reais fornecidas, *When* o dado-fonte é corrigido, *Then* o contrato exibe total, pendentes e saldo corretos.
- **AC3:** *Given* qualquer contrato sem quantidade, *When* renderizado, *Then* não há saldo negativo enganoso.

### Escopo
- **IN:** render defensivo + correção do dado-fonte São Benedito. **OUT:** refatorar todo o cálculo de contratos.

### Dependências
- **Externa:** quantidades reais dos itens do contrato São Benedito (cliente). A parte de render (FR-21.5.1/3) é independente.

### Arquivos
- `data/lariucci-arp-2025.json:523-553`, `js/gdp-contratos-module.js:2148-2171` (render card), `:2899-2950` (`abrirContrato`), `:2979-3014` (tabela de itens), `js/gdp-core.js:984-989` (`sanitizeContratoLegacyData`)

---

## STORY 21.6 — Portal Escolar: filtro de contratos Ativos/Encerrados

**Resolve:** UX-F7 · **Prioridade:** P2 · **Risco:** BAIXO · **Complexidade:** S

### Descrição
O portal escolar lista os contratos da escola mas não permite filtrar por status. Adicionar um controle de filtro **Ativos / Encerrados / Todos** usando exclusivamente o campo `c.status` (já vindo do módulo Contratos do GDP e já exibido no badge do card). Sem nova lógica de status nem regra de vigência.

### Requisitos Funcionais
- **FR-21.6.1:** Em `showContractSelection()`, adicionar um controle de filtro (Ativos/Encerrados/Todos) que filtra os cards por `c.status`.
- **FR-21.6.2:** Default do filtro = **Ativos** (esconde encerrados por padrão), com opção de ver Encerrados/Todos.
- **FR-21.6.3:** Normalizar a comparação de status (case-insensitive; `c.status || 'ativo'` como hoje no badge).

### Critérios de Aceitação
- **AC1:** *Given* contratos com status variados, *When* seleciono "Ativos", *Then* só aparecem os ativos.
- **AC2:** *Given* o filtro "Encerrados", *When* aplico, *Then* só aparecem os encerrados.
- **AC3:** *Given* "Todos", *When* aplico, *Then* aparecem todos os contratos da escola.

### Escopo
- **IN:** UI de filtro por status no portal. **OUT:** alterar como o status é definido (continua no módulo Contratos).

### Arquivos
- `gdp-portal.html:851-883` (`getSchoolContracts`), `:921-950` (`showContractSelection`, badge `:940`), `gdp-api.js:117` (campo `status`)

---

# ONDA 2 — Padrões transversais de UX

## STORY 21.7 — Checkboxes de ação em lote desmarcam após a ação

**Resolve:** UX-F3 · **Prioridade:** P2 · **Risco:** BAIXO · **Complexidade:** S

### Descrição
Em fluxos com seleção em lote por checkbox, após executar a ação os checkboxes deveriam desmarcar automaticamente (sinalizando que o item saiu da fila). Hoje há casos em que permanecem marcados, exigindo limpeza manual. Padronizar: toda ação em lote, no sucesso, limpa a seleção e re-renderiza.

### Requisitos Funcionais
- **FR-21.7.1:** Corrigir `bulkImprimirBoletos` (`gdp-init.js:349-354`) para, no sucesso, `_selectedContaReceberIds.clear()` + `renderContasReceber()`.
- **FR-21.7.2:** Auditar e padronizar os demais fluxos de ação em lote para o mesmo comportamento: verificar `sincronizarBancoProdutos` (`gdp-banco-produtos.js:1459`) e `adicionarSelecionadosAoCatalogo` (`gdp-contratos-module.js:2600`), além de pedidos/notas fiscais se houver bulk.
- **FR-21.7.3:** Onde já está correto (`bulkReceberContas`, `bulkExcluirContasReceber`), usar como referência de padrão — não regredir.

### Critérios de Aceitação
- **AC1:** *Given* itens selecionados, *When* executo "Imprimir Boletos", *Then* após a ação os checkboxes ficam desmarcados.
- **AC2:** *Given* qualquer ação em lote auditada, *When* concluída com sucesso, *Then* a seleção é limpa e a lista re-renderizada.
- **AC3:** Nenhum fluxo em lote permite re-executar a ação sobre itens já processados por seleção residual.

### Escopo
- **IN:** limpeza de seleção pós-ação em fluxos de lote. **OUT:** mudar a lógica das ações em si.

### Arquivos
- `js/gdp-init.js:349-354` (`bulkImprimirBoletos`), referência `:344-345` e `:382-383`; `js/gdp-banco-produtos.js:1459`; `js/gdp-contratos-module.js:2600`

---

## STORY 21.8 — Salvar mantém a tela aberta e limpa os campos (padrão "salvar e continuar")

**Resolve:** UX-F2 · **Prioridade:** P1 · **Risco:** MÉDIO (toca vários forms) · **Complexidade:** M

### Descrição
Em muitos formulários/modais, ao salvar uma alteração o sistema fecha a tela. O comportamento esperado: o botão "Salvar" grava no banco, **limpa os campos** para um novo registro e **mantém a tela aberta**; o usuário decide quando sair (X / Cancelar / Esc / clicar fora). Sem botão "Salvar e fechar" adicional.

### Requisitos Funcionais
- **FR-21.8.1:** Após salvar com sucesso, **não** fechar o modal/form. Em vez disso: persistir → toast curto → resetar os campos do formulário → manter a tela aberta com foco no primeiro campo.
- **FR-21.8.2:** Aplicar nos saves identificados:
  - `salvarEditCrDetalhe` (`gdp-init.js:512`), `salvarEditCpDetalhe` (`:1095`)
  - `registrarContaReceber` (`:784`), `registrarContaPagar` (`:744`)
  - `salvarContrato` (`gdp-contratos-module.js:2722`)
  - Estoque Intel: fornecedor/produto/embalagem/compra (`gdp-estoque-intel.js:1260/1689/1759/1498`)
- **FR-21.8.3:** Manter mecanismos de fechar (X/Cancelar/Esc/clicar fora) funcionando para a saída explícita.
- **FR-21.8.4:** Garantir que a lista subjacente reflita o novo registro sem fechar a tela (re-render em background).

### Critérios de Aceitação
- **AC1:** *Given* qualquer form listado, *When* salvo, *Then* a tela permanece aberta, os campos são limpos e um toast confirma o salvamento.
- **AC2:** *Given* a tela aberta pós-save, *When* preencho outro registro e salvo, *Then* o fluxo se repete sem reabrir o modal.
- **AC3:** *Given* a tela aberta, *When* uso X/Cancelar/Esc/clico fora, *Then* a tela fecha.
- **AC4:** Nenhum dado é perdido e a listagem reflete os registros salvos.

### Escopo
- **IN:** comportamento pós-save dos forms/modais listados. **OUT:** mudar regras de validação/persistência de cada entidade.

### Arquivos
- `js/gdp-init.js:512, 744, 784, 1095`; `js/gdp-contratos-module.js:2722`; `js/gdp-estoque-intel.js:1260, 1498, 1689, 1759`

---

## STORY 21.9 — Filtros resetam ao sair da página/aba/modal (estado limpo ao reentrar)

**Resolve:** UX-F1 · **Prioridade:** P1 · **Risco:** MÉDIO (transversal) · **Complexidade:** M

### Descrição
Regra geral de sistemas modernos: ao sair de uma tela, os filtros de busca são limpos e a tela volta ao estado padrão, para que sempre carregue "limpa" na próxima abertura. Hoje `resetTabState()` cobre só os `busca-*` e checkboxes; selects de filtro, datas e abas de status memorizadas permanecem ativos, e o reset não ocorre ao fechar modais/detalhes.

### Requisitos Funcionais
- **FR-21.9.1:** Estender/centralizar o reset de filtros (`resetFilters(scope)`), chamado por `switchTab()` **e** por todo `closeModal/fecharModal*` (incluindo `fecharModalContrato`).
- **FR-21.9.2:** Cobrir, além dos `busca-*` já tratados, os selects/datas: Pedidos (`filtro-contrato-pedido`, `filtro-entrega-pedido`), NF (`cp-filtro-categoria`), Estoque Intel (base/categoria/tipo/data/cliente), Integrações (`int-filtro-status`, `int-filtro-canal`), Entregas (`filtro-data-entrega`, `filtro-status-entrega`).
- **FR-21.9.3:** Resetar abas de status memorizadas (`contaPagarStatusTabAtual`, `contaReceberStatusTabAtual`) para o default ao reentrar.
- **FR-21.9.4:** Após o reset, re-renderizar a lista no estado padrão (sem filtros).

### Critérios de Aceitação
- **AC1:** *Given* filtros aplicados numa aba, *When* saio e volto, *Then* os filtros estão limpos e a lista no estado padrão.
- **AC2:** *Given* um modal/detalhe com busca, *When* fecho e reabro, *Then* o filtro está limpo.
- **AC3:** *Given* uma aba de status memorizada (CP/CR), *When* reentro, *Then* volta ao default.
- **AC4:** Cada módulo listado (Pedidos, NF, Estoque, Integrações, Entregas, Contratos) reseta seus filtros específicos.

### Escopo
- **IN:** reset de filtros ao trocar de aba/fechar modal nos módulos listados. **OUT:** mudar a lógica de cada filtro individual.

### Arquivos
- `js/gdp-init.js:43-81` (`resetTabState`), `:1164-1165`; `js/gdp-pedidos.js:185-207`, `:1850`; `js/gdp-estoque-intel.js:1972-2114`; `js/gdp-entregas.js:105-107`; `js/gdp-contratos-module.js:3074` (`fecharModalContrato`)

---

## Definition of Done (Epic)

- Todas as 9 stories implementadas, com AC verificados.
- Sem regressão nos fluxos de Caixa/CR/CP/Contratos/Portal/Estoque.
- Persistência no padrão `localStorage + Supabase` onde aplicável (21.1, 21.3, 21.4).
- Bump de versão dos scripts no HTML (`?v=N`) para os arquivos JS alterados; deploy com `npx vercel --prod --force`.
- QA gate PASS por story; validação em produção dos itens de risco ALTO (21.1, 21.2).

## Pendências externas

- **21.5:** quantidades reais dos itens do contrato São Benedito (cliente). Não bloqueia a parte de render nem as demais stories.

---

## Validação PO (Pax — 2026-06-20)

Status das stories: **Draft → Ready** (todas com verdito GO no checklist de 10 pontos).

| Story | Score | Verdito | Observação |
|-------|-------|---------|------------|
| 21.1 | 10/10 | GO | — |
| 21.2 | 10/10 | GO | — |
| 21.3 | 10/10 | GO | — |
| 21.4 | 10/10 | GO | — |
| 21.5 | 9/10 | GO condicional | DoD em 2 fases (ver abaixo) |
| 21.6 | 10/10 | GO | — |
| 21.7 | 9/10 | GO condicional | DoD exige veredito explícito por fluxo auditado |
| 21.8 | 10/10 | GO | — |
| 21.9 | 10/10 | GO | — |

### Ajustes solicitados pelo PO (não bloqueiam o início)

- **21.5 — DoD em 2 fases:**
  - **Fase A (entregável já):** render defensivo (FR-21.5.1 / FR-21.5.3) — sinalizar "sem quantidade contratada" e evitar saldo negativo. Independente do cliente.
  - **Fase B (após insumo do cliente):** correção do dado-fonte (FR-21.5.2) com as quantidades reais. Story só é "Done" quando ambas as fases concluírem **ou** quando a Fase B for explicitamente agendada como follow-up.
- **21.7 — DoD com veredito por fluxo:** ao auditar `sincronizarBancoProdutos`, `adicionarSelecionadosAoCatalogo` (e bulk de pedidos/NF se houver), o @dev deve **declarar o veredito de cada um** (corrigido / já-OK / fora-de-escopo) na File List / Dev Notes, para o QA validar objetivamente.

### Sequência de implementação recomendada (PO)

1. **Onda 1 primeiro**, priorizando os de risco ALTO com validação em produção:
   `21.1` (financeiro) → `21.2` (pedido real) → `21.3` → `21.5` (Fase A) → `21.4` → `21.6`.
2. **Onda 2 depois** (transversais, maior superfície de regressão):
   `21.8` → `21.9` → `21.7`.
3. A cada JS alterado: **bump `?v=N`** no HTML; deploy `npx vercel --prod --force`; validar em produção os itens de risco ALTO.

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-06-20 | @analyst (Atlas) | Discovery das 9 frentes (F1–F9) |
| 2026-06-20 | @pm (Morgan) | EPIC-21 criado com 9 stories |
| 2026-06-20 | @po (Pax) | Validação 10 pontos — 9 GO; Draft → Ready; DoD de 21.5/21.7 refinado |

---

*EPIC-21 criado por Morgan (@pm) a partir do discovery de Atlas (@analyst) — 2026-06-20.*
*Validado e marcado Ready por Pax (@po) — 2026-06-20.*
