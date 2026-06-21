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
| Categorias do filtro (tela principal) ≠ categorias do form "Novo Produto" | Duas fontes e duas chaves localStorage distintas: filtro deriva de `_customCategorias` (`gdp.produto-categorias-custom.v1`, `gdp-estoque-intel.js:1980`) sem base; form usa lista **hardcoded** + `_loadCategoriasCustom()` (`gdp.categorias-produto.custom.v1`, `gdp-init.js:3579-3582`) menos removidas | **21.10** (UX-F10) | 3 |
| Falta "+ Nova Categoria" no padrão Contas a Pagar/Receber no form Novo Produto | "+" → `adicionarCategoriaCustom()` via `prompt()` (`gdp-init.js:3622, 3778`); padrão desejado = `promptNovaCategoriaConta()` (`gdp-core.js:877-941`) | **21.11** (UX-F11) | 3 |
| Clone de pedido salva igual ao original (ignora edições feitas antes do 1º Salvar) | `salvarClonePedido()` faz `pedidos.push(_pendingClone)` sem reler o form (`gdp-pedidos.js:342-353`) | **21.12** (UX-F12) | 3 |
| Setinha "voltar" do Contrato fica embaixo (diferente de Pedidos) | `← Voltar` renderizado no rodapé em `abrirContrato()` (`gdp-contratos-module.js:3057-3062`) | **21.13** (UX-F13) | 3 |
| Setinha "voltar" do card "Detalhes da Conta a Pagar" tem contorno/caixa diferente | Usa `.btn .btn-outline .btn-sm` com `border:1px solid var(--bdr)` (`gdp-contratos.html:758`) vs `border:none` inline das demais | **21.14** (UX-F14) | 3 |

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

# ONDA 3 — Central de Produtos (categorias) + Clone de Pedido + Padronização da setinha "voltar"

> Discovery por **@analyst (Atlas)** em 2026-06-21, a partir de relato do stakeholder (Edson) com evidências de tela. Root-cause confirmado por leitura de código (`file:line`).

## STORY 21.10 — Central de Produtos: unificar a fonte das categorias (filtro × form Novo Produto)

**Resolve:** UX-F10 · **Prioridade:** P1 · **Risco:** MÉDIO (dado/UX) · **Complexidade:** M

### Descrição
Na Central de Produtos do GDP, a lista de categorias do **filtro da tela principal** ("Todas Categorias") é diferente da lista do **`<select>` Categoria do form "Novo Produto"**. São duas fontes e duas chaves de `localStorage` distintas: o filtro deriva apenas de `_customCategorias` + categorias em uso (chave `gdp.produto-categorias-custom.v1`), sem lista-base; o form usa uma lista-base **hardcoded** + `_loadCategoriasCustom()` (chave `gdp.categorias-produto.custom.v1`) menos as removidas. Resultado: categorias aparecem em uma tela e não na outra (ex.: "Limpeza/Higiene" no filtro vs "Limpeza"/"Outros"/"Ovos"/"Sem Categoria" no form). O cliente afirma já ter pedido esse ajuste antes — houve regressão.

### Requisitos Funcionais
- **FR-21.10.1:** Definir uma **única fonte de verdade** de categorias de produto (uma função compartilhada `getCategoriasProduto()`) consumida por **ambos**: o filtro da tela principal (`gdp-estoque-intel.js:1980`) e o `<select>` do form Novo Produto (`gdp-init.js:3579-3582` e o segundo render em `:1970`/`:3298`).
- **FR-21.10.2:** Consolidar para **uma única chave** de `localStorage` (definir a canônica — ex.: `gdp.categorias-produto.custom.v1`) e **migrar** os valores existentes da chave divergente (`gdp.produto-categorias-custom.v1`) para a canônica no boot (uma vez), sem perder categorias já criadas.
- **FR-21.10.3:** Unificar a lista-base de categorias (uma só), eliminando a divergência (presença/ausência de "Limpeza/Higiene", "Outros", "Ovos", "Polpas/Frutas", etc.). A opção "Sem Categoria" permanece **apenas** como placeholder do `<select>` (valor vazio), não como categoria do filtro.
- **FR-21.10.4:** Categorias removidas via engrenagem (`gdp.categorias-produto.removed.v1`) devem sumir **das duas** telas de forma consistente.
- **FR-21.10.5:** Persistir alterações de categoria no padrão `localStorage + Supabase` (manter o `cloudSave()` já existente).

### Critérios de Aceitação
- **AC1:** *Given* a Central de Produtos, *When* abro o filtro "Todas Categorias" e o `<select>` de "Novo Produto", *Then* ambos exibem **exatamente a mesma lista** de categorias (exceto o placeholder "Sem Categoria" do form).
- **AC2:** *Given* que crio uma categoria nova, *When* ela é salva, *Then* aparece **nas duas** telas imediatamente.
- **AC3:** *Given* que removo uma categoria pela engrenagem, *When* confirmo, *Then* ela desaparece **das duas** telas.
- **AC4:** *Given* categorias já existentes na chave antiga, *When* o sistema sobe após o fix, *Then* nenhuma categoria criada anteriormente é perdida (migração).

### Escopo
- **IN:** unificação da fonte/chave/lista-base de categorias de produto e consumo nas duas telas. **OUT:** categorias do Financeiro (CP/CR), que têm store próprio.

### Arquivos
- `js/gdp-estoque-intel.js:7-9, 18, 24, 1980` (fonte do filtro, chave `gdp.produto-categorias-custom.v1`)
- `js/gdp-init.js:1970, 3298, 3579-3583, 3757-3759, 3768-3835` (lista-base hardcoded, `_loadCategoriasCustom`/`_loadCategoriasRemoved`, chaves `gdp.categorias-produto.custom.v1` / `.removed.v1`, gerenciador de categorias)
- `js/gdp-banco-produtos.js:429` (`grupo: dados.categoria`)

---

## STORY 21.11 — Form Novo Produto: botão "+ Nova Categoria" no padrão Contas a Pagar/Receber

**Resolve:** UX-F11 · **Prioridade:** P2 · **Risco:** BAIXO · **Complexidade:** S

### Descrição
No form "Novo Produto" da Central de Produtos, ao final da lista de categorias deve haver um botão/opção **"+ Nova Categoria"** seguindo o **mesmo padrão** já usado em Contas a Pagar e Contas a Receber (opção `+ Nova categoria` no próprio select → `promptNovaCategoriaConta()`). Hoje existe um botão "+" solto ao lado do select que abre um `prompt()` (`adicionarCategoriaCustom()`). Decisão do stakeholder: **remover** esse "+" ao lado do campo (mantendo **somente a engrenagem ⚙** para editar/excluir categorias) e mover a criação para o padrão "+ Nova Categoria" integrado, idêntico ao do Financeiro.

### Requisitos Funcionais
- **FR-21.11.1:** Adicionar a criação de categoria no padrão do Financeiro: opção `+ Nova Categoria` ao final do `<select>` de categoria (ou botão equivalente ao padrão de CP/CR), que ao ser escolhida abre o fluxo de criação e já seleciona a nova categoria. Referência: `promptNovaCategoriaConta()` / `ensureContaCategoria()` / `renderContaCategoriaOptions()` (`gdp-core.js:866-941`).
- **FR-21.11.2:** **Remover** o botão "+" ao lado do campo de categoria (`gdp-init.js:3622`, handler `adicionarCategoriaCustom`), deixando **apenas** a engrenagem ⚙ (`abrirGerenciadorCategorias`) para edição/exclusão.
- **FR-21.11.3:** A nova categoria criada deve persistir na **fonte unificada** definida na Story 21.10 (mesma chave canônica) e refletir nas duas telas.
- **FR-21.11.4:** Manter validação de unicidade e o feedback (toast) já existentes.

### Critérios de Aceitação
- **AC1:** *Given* o form Novo Produto, *When* abro o campo Categoria, *Then* existe "+ Nova Categoria" ao final, no mesmo padrão visual/UX de Contas a Pagar/Receber.
- **AC2:** *Given* que uso "+ Nova Categoria", *When* informo o nome, *Then* a categoria é criada, **já fica selecionada** e aparece nas duas telas (filtro + form).
- **AC3:** *Given* o form Novo Produto, *When* observo o campo Categoria, *Then* **não** há mais o botão "+" ao lado — apenas a engrenagem ⚙.
- **AC4:** *Given* a engrenagem ⚙, *When* clico, *Then* continuo conseguindo editar e excluir categorias.

### Escopo
- **IN:** padrão de criação "+ Nova Categoria" no form Novo Produto + remoção do "+" lateral. **OUT:** alterar o gerenciador (⚙), que permanece.

### Dependências
- **21.10** (fonte unificada de categorias) — recomendável implementar junto/depois para a nova categoria refletir nas duas telas.

### Arquivos
- `js/gdp-init.js:3622` (markup `<select>` + botões `+`/`⚙`), `:3778-3794` (`adicionarCategoriaCustom`, a remover), `:3832-3859` (`abrirGerenciadorCategorias`, manter)
- Referência de padrão: `js/gdp-core.js:866-941` (`ensureContaCategoria`, `promptNovaCategoriaConta`, `renderContaCategoriaOptions`)

---

## STORY 21.12 — Pedidos: clone aceita edições feitas antes do primeiro "Salvar"

**Resolve:** UX-F12 · **Prioridade:** P1 · **Risco:** ALTO (pedido real) · **Complexidade:** S

### Descrição
Ao "Clonar venda", o sistema mostra "Clone de PED-XXXX. Revise os dados e clique em Salvar". O usuário edita os campos do clone e clica em **Salvar** — mas o pedido é salvo **idêntico ao original**, ignorando as edições. As alterações só "pegam" se o usuário salvar o clone, fechar e reabrir para editar de novo. Causa: `salvarClonePedido()` faz `pedidos.push(_pendingClone)` empurrando o objeto capturado em `clonarPedido()`, **sem reler os campos do formulário** no momento do salvar (diferente de `salvarPedidoCompleto`, que relê o DOM).

### Requisitos Funcionais
- **FR-21.12.1:** `salvarClonePedido()` deve **reler todos os campos do formulário** (dados fiscais, itens — qtd/preço/descrição/NCM/SKU/unidade, forma/vencimento/prazo de pagamento, data prevista, observações/anotações) e aplicá-los ao `_pendingClone` **antes** de persistir — exatamente como `salvarPedidoCompleto` faz (`gdp-pedidos.js:1535-1563`).
- **FR-21.12.2:** Preferencialmente, **reutilizar** a coleta de campos já existente em `salvarPedidoCompleto` (extrair função compartilhada `coletarPedidoDoForm(id)`), evitando divergência futura entre os dois caminhos de salvar.
- **FR-21.12.3:** Manter a geração do novo ID, status `em_aberto`, data de hoje e a limpeza de referências de NF já feitas no clone.
- **FR-21.12.4:** Após salvar, a mensagem de sucesso e a navegação permanecem; o pedido salvo já reflete as edições (sem necessidade de fechar/reabrir).

### Critérios de Aceitação
- **AC1:** *Given* um clone com "Revise os dados e clique em Salvar", *When* edito campos (ex.: quantidade, preço, data prevista, dados fiscais) e clico em **Salvar**, *Then* o pedido é salvo **com as edições** aplicadas.
- **AC2:** *Given* o clone salvo, *When* o reabro, *Then* os valores exibidos são os que editei antes do salvar (não os do original).
- **AC3:** *Given* o clone, *When* não altero nada e salvo, *Then* o pedido é um clone fiel do original (novo ID, status em aberto, data de hoje, sem NF).
- **AC4:** Nenhuma regressão no salvar de pedido normal (`salvarPedidoCompleto`).

### Escopo
- **IN:** coleta dos campos do form no salvar do clone. **OUT:** mudar o fluxo de criação de pedido do zero.

### Arquivos
- `js/gdp-pedidos.js:326-340` (`clonarPedido`, `_pendingClone`), `:342-353` (`salvarClonePedido` — bug), `:1372-1528` (`verPedidoDetalhe` render do form do clone), `:1535-1563` (`salvarPedidoCompleto` — referência de coleta do DOM)

---

## STORY 21.13 — Contratos: mover a setinha "voltar" para o topo (padrão Pedidos)

**Resolve:** UX-F13 · **Prioridade:** P3 · **Risco:** BAIXO · **Complexidade:** XS

### Descrição
Padronizar a posição da setinha "voltar". Em **Pedidos**, a seta "←" fica no **topo**, à esquerda do título (referência desejada). Em **Contratos**, o botão "← Voltar" hoje fica no **rodapé** do detalhe. Mover para o **topo**, no mesmo padrão de Pedidos.

### Requisitos Funcionais
- **FR-21.13.1:** Mover o botão "← Voltar" do detalhe de contrato do rodapé (`gdp-contratos-module.js:3057-3062`) para o **header** do detalhe (junto ao título), no mesmo padrão de Pedidos (`gdp-pedidos.js:1520`): seta transparente, `border:none`, à esquerda do título.
- **FR-21.13.2:** Manter o handler `fecharContratoDetalhe()` intacto; apenas reposicionar.
- **FR-21.13.3:** Não duplicar o botão (remover do rodapé ao adicionar no topo).

### Critérios de Aceitação
- **AC1:** *Given* o detalhe de um contrato, *When* abro, *Then* a setinha "voltar" aparece no **topo**, à esquerda do título, igual a Pedidos.
- **AC2:** *Given* a setinha no topo, *When* clico, *Then* volto à listagem de contratos (comportamento inalterado).
- **AC3:** *Given* o detalhe, *When* observo o rodapé, *Then* não há mais botão "voltar" duplicado embaixo.

### Escopo
- **IN:** reposicionar a setinha do detalhe de Contrato. **OUT:** demais botões do rodapé (Salvar/Excluir/etc.).

### Arquivos
- `js/gdp-contratos-module.js:2915` (`abrirContrato`), `:3050-3063` (header/footer render), `:3057-3062` (botão atual no rodapé)
- Referência: `js/gdp-pedidos.js:1520` (seta no topo)

---

## STORY 21.14 — Financeiro: padronizar a setinha "voltar" do card "Detalhes da Conta a Pagar"

**Resolve:** UX-F14 · **Prioridade:** P3 · **Risco:** BAIXO · **Complexidade:** XS

### Descrição
No card "Detalhes da Conta a Pagar" (Financeiro → Contas a Pagar), o botão "← Voltar" tem um **contorno/caixa** (classes `.btn .btn-outline .btn-sm`, `border:1px solid var(--bdr)`) diferente das demais setinhas do sistema, que usam seta transparente sem borda. Padronizar: **remover o contorno** do botão, deixando-o com a mesma aparência das demais (Pedidos/Contratos).

### Requisitos Funcionais
- **FR-21.14.1:** Remover o contorno/caixa do botão "← Voltar" do card "Detalhes da Conta a Pagar" (`gdp-contratos.html:758`): trocar as classes `.btn .btn-outline .btn-sm` por estilo inline transparente sem borda (`background:transparent; border:none; color:var(--mut)`), no padrão de Pedidos/Contratos.
- **FR-21.14.2:** Manter o handler `fecharDetalheCp()` e a posição (já está no topo do card).
- **FR-21.14.3:** Não introduzir regressão visual em outros usos de `.btn-outline` (alterar **apenas** este botão, não a classe global).

### Critérios de Aceitação
- **AC1:** *Given* o card "Detalhes da Conta a Pagar", *When* abro, *Then* a setinha "voltar" não tem mais contorno/caixa e está visualmente igual às demais do sistema.
- **AC2:** *Given* a setinha, *When* clico, *Then* fecho o detalhe (comportamento inalterado).
- **AC3:** *Given* outros botões `.btn-outline` no sistema, *When* renderizados, *Then* permanecem inalterados (sem regressão).

### Escopo
- **IN:** estilo do botão "voltar" do card Detalhes da Conta a Pagar. **OUT:** redefinir a classe `.btn-outline` globalmente.

### Arquivos
- `gdp-contratos.html:755-758` (modal `cp-detalhe-modal`, botão "← Voltar"), definição `.btn-outline` (inline no mesmo HTML)
- Referência: `js/gdp-pedidos.js:1520` / `js/gdp-contratos-module.js` header (após 21.13)

---

## Definition of Done (Epic)

- Todas as 14 stories implementadas (9 da v1 + 5 da Onda 3), com AC verificados.
- Sem regressão nos fluxos de Caixa/CR/CP/Contratos/Portal/Estoque/Central de Produtos.
- Persistência no padrão `localStorage + Supabase` onde aplicável (21.1, 21.3, 21.4, 21.10, 21.11).
- Onda 3: filtro de categorias e form Novo Produto exibem a **mesma lista** (21.10); clone de pedido salva com as edições (21.12); setinhas "voltar" padronizadas (21.13/21.14).
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

---

## Validação PO (Pax — 2026-06-21) — Onda 3

Status: **Draft → Ready** (todas as 5 stories com verdito GO no checklist de 10 pontos).

| Story | Score | Verdito | Observação |
|-------|-------|---------|------------|
| 21.10 | 10/10 | GO | AC4 (migração de categorias) é o maior risco — QA validar com dado real |
| 21.11 | 10/10 | GO | Implementar em par com 21.10 (depende da fonte unificada) |
| 21.12 | 10/10 | GO | P1/risco ALTO — validar em produção (pedido real) |
| 21.13 | 10/10 | GO | XS — pode ir junto com 21.14 |
| 21.14 | 10/10 | GO | XS — alterar só este botão, não a classe `.btn-outline` global |

### Sequência de implementação recomendada (Onda 3)

1. **Par categorias:** `21.10` (fonte/chave unificada + migração) → `21.11` ("+ Nova Categoria" padrão CP/CR + remover "+" lateral).
2. **Clone (P1/ALTO):** `21.12` — reutilizar `coletarPedidoDoForm(id)`; validar em produção com pedido real.
3. **Setinhas (XS, mesmo commit):** `21.13` + `21.14`.
4. A cada JS alterado: **bump `?v=N`** no HTML; deploy `npx vercel --prod --force`; **Ctrl+Shift+R** no navegador.

## Dev Agent Record (Dex)

### Onda 1 (commit 62e9594 — deployada e testada em produção)
- 21.1, 21.2, 21.3, 21.4, 21.5A, 21.6 implementadas. Testes em produção via Playwright (verificação do código servido + cenários de lógica): todos verdes. Caso real dos "10 disponíveis" do portal confirmado corrigido.
- Correção adicional na 21.2 (reforço do cliente): o bug não era só divergência catálogo×carrinho — o catálogo barrava quantidade que existe. Causa: trava financeira (saldo do contrato inteiro, arredondado) cortava 1 unidade por centavos. Fix: item com estoque próprio (qtdDisponivel>0) é limitado pelo ESTOQUE; trava financeira só no ARP, com tolerância de 1 centavo.

### Onda 2
- **21.8 (salvar sem fechar):** removido o fechamento pós-save em `registrarContaPagar`/`registrarContaReceber` (já limpavam campos), e o auto-close em `salvarEditCpDetalhe`/`salvarEditCrDetalhe`. `salvarContratoManual` agora salva + persiste Supabase + reabre form limpo (save-and-create-another).
  - **Veredito Estoque Intel:** `registrarFornecedorEstoqueIntel`, `registrarProdutoEstoqueIntel`, `registrarProdutoUnificado`, `registrarEmbalagemEstoqueIntel`, `registrarPedidoEstoqueIntel` → **já-OK** (já faziam clear-fields + render sem fechar modal). A flag do discovery (`:1260/1689/1759/1498`) não se confirmou.
- **21.9 (reset de filtros):** `resetTabState()` estendido para resetar selects/datas (Pedidos, NF, Estoque Intel, Integrações, Entregas) e abas de status memorizadas (CP/CR → "todas", o default original). `fecharContratoDetalhe` limpa `busca-contrato`/`filtro-status-contrato` ao voltar à listagem.
- **21.7 (checkboxes desmarcam) — veredito por fluxo auditado (DoD FR-21.7.2):**
  - `bulkImprimirBoletos` → **CORRIGIDO** (faltava `_selectedContaReceberIds.clear()` + `renderContasReceber()`).
  - `bulkReceberContas`, `bulkExcluirContasReceber` → **já-OK** (referência de padrão: clear + render).
  - `confirmarSync` (gdp-banco-produtos.js, sync em lote) → **já-OK** (chama `abrirContrato()`, que re-renderiza o detalhe do zero, descartando a seleção).
  - `criarPedidoCatalogo` (gdp-contratos-module.js) → **já-OK / fora-de-escopo** (usa inputs de quantidade, não checkboxes; fecha o modal e `renderAll()` após criar o pedido).

### Onda 3 (21.10–21.14) — 2026-06-21

- **21.10 (unificar fonte das categorias):** criada a fonte de verdade `getCategoriasProduto()` em `gdp-init.js` (base única `CATEGORIAS_PRODUTO_BASE` + custom + em uso − removidas). Migração one-time da chave legada `gdp.produto-categorias-custom.v1` → canônica `gdp.categorias-produto.custom.v1` (`_migrarCategoriasLegado`, sem perder categorias). `_saveCategoriasCustom` agora espelha a chave legada e atualiza `_customCategorias` para o filtro. Consumidores migrados: filtro (`gdp-estoque-intel.js:1980`), form Novo Produto (`gdp-init.js`), modal "Cadastrar Produto" (vincular, `:1983`), "Editar Produto" (`:3339`) e gerenciador ⚙ (`abrirGerenciadorCategorias`). Agora todas exibem a mesma lista.
- **21.11 (+ Nova Categoria padrão CP/CR):** adicionados `buildCategoriaProdutoOptions(selected)` (placeholder "Sem Categoria" + opção `__nova__` "+ Nova Categoria" ao final), `criarCategoriaProduto(nome)` e o handler `onCategoriaProdutoChange(selectEl)`. Os 3 selects de categoria de produto usam `onchange="onCategoriaProdutoChange(this)"`. **Removido** o botão "+" lateral do form Novo Produto (`gdp-init.js:3622`); mantida apenas a ⚙. `adicionarCategoriaCustom` virou alias fino sobre `criarCategoriaProduto`.
- **21.12 (clone aceita edições):** `salvarClonePedido()` agora faz `pedidos.push(_pendingClone)` e delega a `salvarPedidoCompleto(id)`, que relê todo o form (FR-21.12.2: reuso da coleta existente, sem duplicar). O clone precisa estar no array antes da coleta porque os helpers buscam o pedido por id. Mantidos novo ID, status `em_aberto`, data de hoje e limpeza de NF.
- **21.13 (setinha Contrato no topo):** botão `←` movido do rodapé para o header de `abrirContrato()` (`gdp-contratos-module.js`), no padrão de Pedidos (transparente, `border:none`); rodapé mantém só Excluir/Salvar.
- **21.14 (setinha Conta a Pagar sem contorno):** botão "← Voltar" do modal `cp-detalhe-modal` trocou `.btn .btn-outline .btn-sm` por estilo inline transparente sem borda (`gdp-contratos.html:758`). Classe `.btn-outline` global intacta.
- **Versões bumpadas em `gdp-contratos.html`:** gdp-init `v31→v32`, gdp-estoque-intel `v15→v16`, gdp-pedidos `v25→v26`, gdp-contratos-module `v20→v21`.
- **Validações:** `node --check` em todos os JS alterados → OK. Sem leftovers de `CAT_OPTS.map`; `esc` disponível em gdp-init.js. Pendente: deploy `npx vercel --prod --force` (@devops) + validação em produção de 21.12 (risco ALTO) e 21.10 (migração).

#### File List (Onda 3)
- `js/gdp-init.js` (categorias: fonte única, migração, builder, handler; remoção do "+")
- `js/gdp-estoque-intel.js` (filtro usa `getCategoriasProduto`)
- `js/gdp-pedidos.js` (`salvarClonePedido` reusa `salvarPedidoCompleto`)
- `js/gdp-contratos-module.js` (setinha voltar no topo)
- `gdp-contratos.html` (setinha CP sem contorno; bump de versões)

## Change Log

| Data | Agente | Ação |
|------|--------|------|
| 2026-06-20 | @analyst (Atlas) | Discovery das 9 frentes (F1–F9) |
| 2026-06-20 | @pm (Morgan) | EPIC-21 criado com 9 stories |
| 2026-06-20 | @po (Pax) | Validação 10 pontos — 9 GO; Draft → Ready; DoD de 21.5/21.7 refinado |
| 2026-06-20 | @dev (Dex) | Onda 1 implementada/deployada/testada (62e9594); Onda 2 (21.7/21.8/21.9) implementada |
| 2026-06-21 | @analyst (Atlas) | Discovery da Onda 3 (F10–F14): root-cause de categorias, clone de pedido e setinhas "voltar" por evidência de código |
| 2026-06-21 | @pm (Morgan) | Onda 3 adicionada ao EPIC-21: stories 21.10–21.14 (Draft) |
| 2026-06-21 | @po (Pax) | Validação 10 pontos Onda 3 — 5 GO (10/10); Draft → Ready |
| 2026-06-21 | @dev (Dex) | Onda 3 (21.10–21.14) implementada; node --check OK; versões bumpadas; commit 44f2cf9; Ready for Review → handoff @devops |
| 2026-06-21 | @devops (Gage) | Push + PR #19 + merge em master (58c8b7b); deploy prod `--force` (painel-caixa-escolar.vercel.app); versões v32/v16/v26/v21 confirmadas servidas |
| 2026-06-21 | @devops (Gage) | Validação em produção (Playwright/fetch do bundle servido): 21.10 (getCategoriasProduto+migração), 21.11 (+ Nova Categoria, "+" removido, ⚙ mantida), 21.12 (salvarClonePedido delega a salvarPedidoCompleto), 21.13 (voltar no header), 21.14 (CP sem btn-outline/border:none) — todos confirmados |

---

*EPIC-21 criado por Morgan (@pm) a partir do discovery de Atlas (@analyst) — 2026-06-20.*
*Validado e marcado Ready por Pax (@po) — 2026-06-20.*
