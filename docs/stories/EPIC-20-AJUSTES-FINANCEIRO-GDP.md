# EPIC-20: Ajustes Financeiro GDP (Caixa, Contas a Receber, Conciliação, Config Finanças)

## Contexto

Conjunto de ajustes de usabilidade, correção de bugs e configurabilidade no módulo **GDP > Financeiro**, levantados pelo stakeholder (Edson) e investigados com causa-raiz por evidência de código pelo **@analyst (Atlas)**.

Brief de investigação: `.aiox/handoffs/handoff-analyst-to-pm-dev-financeiro-20260612.yaml` (2026-06-12).

Diferente do EPIC-16 (integridade transacional), este épico é majoritariamente **frontend + configuração**, sem novo DDL no Supabase. A boa notícia da investigação: várias capacidades já existem no código (matching de conciliação para CP/CR, busca por todos os candidatos com mesmo valor, aba financeira) — o trabalho é em grande parte **expor/corrigir** o que já está parcialmente pronto.

## Objetivo

Tornar o módulo financeiro mais usável e correto: busca por valor e impressão no Caixa, filtros de data padronizados, impressão de relatório respeitando o status, conciliação que permite escolher entre valores iguais, vencimento calculado a partir da NF, prazo de recebimento configurável por empresa (preparando o SaaS por assinatura) e ajuste de rótulo em Pedidos.

## Decisões do Stakeholder (Edson — 2026-06-12)

- **Config Finanças:** renomear a aba **"Contas Bancárias" → "Finanças"** e adicionar um card **"Preferências de Recebimento"** (não criar aba nova). Persistir no padrão `localStorage + Supabase` (app-config.js).
- **Vencimento:** conta a receber originada de NF = **data de emissão da NF + prazo configurado** na aba Finanças (novo default: **5 dias**; hoje hardcoded 28). **Não** recalcular a partir da data do pedido.
- **Conciliação:** quando houver **2+ contas com o mesmo valor** do extrato, mostrar **todos os candidatos** para o operador escolher (vale para CR **e** CP).
- **Priorização:** quick-wins primeiro (Onda 1), depois a base de config (Onda 2).
- **Dados legados (FIN-3):** corrigir via **fallback na exibição** (sem migration de backfill).

## Arquitetura Atual (AS-IS)

```
Caixa: busca só por cliente/descrição · sem botão imprimir · filtro de data em dropdown próprio (≠ CP/CR)
Contas a Receber: imprimir relatório usa o array inteiro (ignora aba de status) · modal mostra dataEmissao vazia em registros legados
Vencimento: buildReceivableFromInvoice usa data da NF mas crava +28 fixos · recalcularVencimentoPedido usa data do pedido
Prazo 28 dias: hardcoded em 6+ pontos (gdp-pedidos.js + gdp-notas-fiscais.js)
Conciliação: buscarSugestoesConciliacao já acha TODOS candidatos (CR e CP) mas render mostra só o 1º + "(+N)" não-clicável
Config: aba "Contas Bancárias" já é a aba financeira (contas, PIX, saldo, API) — falta card de preferências de recebimento
Pedidos: coluna "Data" (deveria ser "Emissão")
```

## Arquitetura Proposta (TO-BE)

```
Caixa: busca também por valor · botão Imprimir (lista dos lançamentos, reusa abrirJanelaRelatorioFinanceiro) · filtro de data no padrão CP/CR
Contas a Receber: imprimir respeita contaReceberStatusTabAtual + filtros ativos · modal com fallback de dataEmissao
Vencimento: CR de NF = emitidaEm + getFinancasConfig().prazoRecebimentoDias · sem recálculo pelo pedido
Prazo: leitura centralizada em getFinancasConfig() (fallback configurável) · hardcodes removidos
Conciliação: quando >1 candidato → lista de seleção (cliente/vencimento/valor) com escolha por item → conciliarComBaixa(contaId, tipo) · CR e CP
Config: aba "Finanças" (ex-Contas Bancárias) + card "Preferências de Recebimento" (prazo, condição padrão, conta de cobrança) · FINANCAS_CONFIG_STORAGE_KEY + load/save + sync
Pedidos: coluna "Emissão"
```

## Tabela Sintoma → Causa → Story

| Sintoma (stakeholder) | Causa-raiz (evidência) | Story | Onda |
|-----------------------|------------------------|-------|------|
| Coluna de pedidos diz "Data" | Rótulo do header | **20.1** (FIN-8) | 1 |
| Imprimir relatório de CR imprime tudo, ignora a aba de status | `imprimirRelatorioContasReceber()` mapeia `contasReceber` inteiro (gdp-init.js:993) sem usar `contaReceberStatusTabAtual` (gdp-pedidos.js:1908) | **20.2** (FIN-2) | 1 |
| Data de emissão vem vazia no modal de CR | Registros legados/de outra origem sem `dataEmissao` ou divergência snake_case↔camelCase | **20.3** (FIN-3) | 1 |
| Conciliação não deixa escolher entre 2+ valores iguais | Render usa só `sugestoes[0]` + "(+N)" não-clicável (gdp-core.js:2700-2706); lógica já acha todos | **20.4** (FIN-7) | 1 |
| Caixa: sem busca por valor, sem imprimir, filtro de data fora do padrão | Busca só por cliente (gdp-pedidos.js:2096); sem botão imprimir; dropdown próprio (gdp-contratos.html:919) | **20.5** (FIN-1) | 1 |
| Toda vez tenho que trocar 28→5 dias manualmente; precisa ser por empresa (SaaS) | Sem config de preferências; aba financeira existe mas sem o card | **20.6** (FIN-6) | 2 |
| Vencimento conta do pedido e crava 28 dias | NF usa +28 fixo (gdp-notas-fiscais.js:823); pedido usa `p.data` (gdp-pedidos.js:1179) | **20.7** (FIN-4) | 2 |
| Prazo padrão 28 espalhado pelo código | Hardcode em 6+ pontos | **20.8** (FIN-5) | 2 |

**Dependências:** 20.7 e 20.8 dependem de **20.6** (config Finanças precisa existir para o prazo ser configurável).

---

## ONDA 1 — Quick-wins (sem dependências)

## STORY 20.1 — Pedidos: renomear coluna "Data" → "Emissão"

**Resolve:** FIN-8 · **Prioridade:** P2 · **Risco:** BAIXO · **Complexidade:** XS

### Descrição
O cabeçalho da tabela de pedidos exibe "Data", mas a coluna representa a data de emissão do pedido. Renomear para "Emissão" alinha com a nomenclatura do restante do financeiro.

### Critérios de Aceitação
- **AC1:** *Given* a aba Pedidos, *When* a tabela é exibida, *Then* o cabeçalho da coluna mostra "Emissão" no lugar de "Data".
- **AC2:** Nenhuma lógica de ordenação/filtro que dependa do header quebra.

### Escopo
- **IN:** texto do `<th>`. **OUT:** mudança de dados ou lógica.

### Arquivos
- `gdp-contratos.html:562`

---

## STORY 20.2 — Contas a Receber: imprimir relatório respeita a aba de status

**Resolve:** FIN-2 · **Prioridade:** P1 · **Risco:** BAIXO · **Complexidade:** S

### Descrição
O botão "Imprimir Relatório" em Contas a Receber gera o relatório com **todas** as contas, independentemente da aba de status selecionada (pendente/recebido/vencido/todas). Deve respeitar o filtro ativo, igual à tabela exibida.

### Requisitos Funcionais
- **FR-20.2.1:** `imprimirRelatorioContasReceber()` deve aplicar o mesmo conjunto de filtros que `renderContasReceber()` antes de montar as linhas: `contaReceberStatusTabAtual` e, se viáveis, os filtros de data (emissão/vencimento) e busca ativos.
- **FR-20.2.2:** O título/subtítulo do relatório deve indicar o filtro aplicado (ex.: "Status: Pendentes").

### Critérios de Aceitação
- **AC1:** *Given* a aba "Pendentes" selecionada, *When* clico em "Imprimir Relatório", *Then* o relatório contém apenas contas pendentes.
- **AC2:** *Given* a aba "Todas", *When* imprimo, *Then* o relatório contém todas as contas.
- **AC3:** *Given* filtros de data/busca ativos, *When* imprimo, *Then* o relatório respeita esses filtros (consistente com a tabela na tela).

### Escopo
- **IN:** filtro no print. **OUT:** mudar o layout do relatório.

### Arquivos
- `gdp-init.js:993-999` (`imprimirRelatorioContasReceber`)
- referência: `gdp-pedidos.js:1880-1976` (`renderContasReceber`), `:1908` (filtro de status), `:2918` (`contaReceberStatusTabAtual`)

---

## STORY 20.3 — Contas a Receber: corrigir data de emissão vazia no modal

**Resolve:** FIN-3 · **Prioridade:** P1 · **Risco:** BAIXO · **Complexidade:** S

### Descrição
Ao abrir os detalhes de uma conta a receber, o campo "Data de Emissão" aparece vazio para parte dos registros. O modal lê `conta.dataEmissao` (correto), mas registros antigos ou criados por outro caminho podem não ter o campo, ou pode haver divergência de nome (`data_emissao` snake_case vindo do Supabase vs `dataEmissao` camelCase).

### Requisitos Funcionais
- **FR-20.3.1:** Normalizar a leitura ao carregar/exibir: aceitar `dataEmissao || data_emissao` e fazer **fallback** para a data de emissão da NF de origem (`notaFiscalId`/`origemId`) ou data de criação do registro, quando ausente.
- **FR-20.3.2:** Não alterar dados no Supabase (decisão: fallback só na exibição).

### Critérios de Aceitação
- **AC1:** *Given* uma conta com `dataEmissao` ausente, *When* abro os detalhes, *Then* o campo exibe uma data válida (NF/criação) e nunca vazio.
- **AC2:** *Given* uma conta com `dataEmissao` presente, *When* abro os detalhes, *Then* o valor original é exibido sem alteração.

### Escopo
- **IN:** normalização/fallback na exibição e edição. **OUT:** migration/backfill no banco.

### Arquivos
- `gdp-init.js:428` (display), `:460` (edit), `:486` (save)
- referência: `gdp-notas-fiscais.js:840` (origem `dataEmissao`)

---

## STORY 20.4 — Conciliação: seleção entre candidatos com mesmo valor (CR e CP)

**Resolve:** FIN-7 · **Prioridade:** P1 · **Risco:** MÉDIO · **Complexidade:** M

### Descrição
Quando o valor do extrato bate com mais de uma conta (mesmo valor), o sistema sugere automaticamente o primeiro candidato e mostra apenas "(+N)" não-clicável. O operador precisa **ver todos os candidatos** e escolher o correto antes da baixa — para Contas a Receber (crédito) e Contas a Pagar (débito).

### Requisitos Funcionais
- **FR-20.4.1:** Quando `buscarSugestoesConciliacao(t).length > 1`, renderizar uma **lista/seleção** de todos os candidatos com: cliente/descrição, vencimento e valor.
- **FR-20.4.2:** Cada candidato tem ação de escolha que chama `conciliarComBaixa(gi, contaId, tipo)` com o `contaId` selecionado.
- **FR-20.4.3:** A regra vale para `tipo='cr'` (crédito) e `tipo='cp'` (débito). O matching de CP já existe (gdp-core.js:2731).
- **FR-20.4.4:** Quando houver exatamente 1 candidato, manter o comportamento atual (sugestão direta).

### Critérios de Aceitação
- **AC1:** *Given* 2+ contas a receber com o mesmo valor de um crédito no extrato, *When* a linha é exibida, *Then* todos os candidatos aparecem e o operador pode escolher qual conciliar.
- **AC2:** *Given* 2+ contas a pagar com o mesmo valor de um débito no extrato, *When* a linha é exibida, *Then* todos os candidatos de CP aparecem para escolha.
- **AC3:** *Given* a escolha de um candidato específico, *When* confirmo, *Then* a baixa é dada na conta escolhida (não no primeiro automático).
- **AC4:** *Given* 1 único candidato, *When* a linha é exibida, *Then* o comportamento atual é preservado.

### Escopo
- **IN:** UI de seleção de candidatos no extrato + ligação ao `conciliarComBaixa`. **OUT:** mudar o algoritmo de matching (já funciona).

### Arquivos
- `gdp-core.js:2698-2722` (render do extrato), `:2726-2778` (`buscarSugestoesConciliacao`), `:2781-2817` (`conciliarComBaixa`)

---

## STORY 20.5 — Caixa: busca por valor + botão Imprimir + filtro de data padrão CP/CR

**Resolve:** FIN-1 · **Prioridade:** P1 · **Risco:** MÉDIO · **Complexidade:** M

### Descrição
Na seção Caixa (Financeiro), a busca só procura por cliente/descrição, não existe botão de impressão dos lançamentos, e o filtro de data usa um dropdown próprio diferente do padrão das páginas Contas a Pagar e Contas a Receber.

### Requisitos Funcionais
- **FR-20.5.1:** A busca do Caixa deve procurar **também por valor** (além de cliente/descrição). Considerar valor formatado e numérico.
- **FR-20.5.2:** Adicionar botão **"Imprimir"** que gera a lista dos lançamentos do caixa atualmente exibidos (respeitando busca e filtro de data), reutilizando `abrirJanelaRelatorioFinanceiro` (mesmo padrão de CP/CR).
- **FR-20.5.3:** Substituir o filtro de data do Caixa pelo **padrão CP/CR**: trigger + dropdown com `input[type=date]` "De/Até" e botões Limpar/Aplicar (`togglePeriodoDropdown`/`aplicarPeriodoFilter`/`limparPeriodoFilter`), posicionado ao lado do campo de busca.

### Critérios de Aceitação
- **AC1:** *Given* a busca do Caixa, *When* digito um valor, *Then* os lançamentos com aquele valor são filtrados.
- **AC2:** *Given* lançamentos exibidos, *When* clico em "Imprimir", *Then* abre o relatório em lista com os lançamentos visíveis (respeitando filtros).
- **AC3:** *Given* o filtro de data do Caixa, *When* comparo com CP/CR, *Then* tem o mesmo padrão visual e comportamental (trigger/dropdown De-Até/Limpar/Aplicar).

### Escopo
- **IN:** busca por valor, botão imprimir, filtro de data padronizado. **OUT:** mudar a lógica de lançamentos/estorno (EPIC-16).

### Arquivos
- `gdp-contratos.html:908-948` (bloco Caixa, busca `#caixa-busca-cliente:918`, filtro `#caixa-filtro-periodo:919`)
- `gdp-pedidos.js:2058-2152` (`renderCaixa`, busca `:2096`, filtro de data `:2100-2115`)
- referência padrão: `gdp-contratos.html:708-723` (CP), `:831-862` (CR); funções de período em `gdp-pedidos.js`

---

## ONDA 2 — Base de configuração (dependente)

## STORY 20.6 — Configurações: aba "Finanças" + card "Preferências de Recebimento"

**Resolve:** FIN-6 · **Prioridade:** P0 da Onda 2 (fundação) · **Risco:** MÉDIO · **Complexidade:** M
**Depende de:** — (habilita 20.7 e 20.8)

### Descrição
A aba "Contas Bancárias" na engrenagem já concentra o financeiro (contas, PIX, saldo, API bancária, conciliação). Renomeá-la para **"Finanças"** e adicionar um card **"Preferências de Recebimento"** com as configurações de prazo padrão por empresa — preparando a venda futura por assinatura (multi-empresa).

### Requisitos Funcionais
- **FR-20.6.1:** Renomear o label da aba `data-config-tab="contas-bancarias"` para **"Finanças"** (manter o `data-config-tab` e o id `#config-contas-bancarias` para não quebrar bindings, OU renomear consistentemente em HTML+JS — decisão técnica do @architect/@dev).
- **FR-20.6.2:** Novo card "Preferências de Recebimento" com campos: **prazo padrão de recebimento (dias)** (default 5), **condição de pagamento padrão**, **conta bancária de cobrança padrão** (select das contas já cadastradas).
- **FR-20.6.3:** Persistência no padrão existente: `FINANCAS_CONFIG_STORAGE_KEY = "nexedu.config.financas"` (localStorage) + cloud sync (`app-sync.js cloudSave`). Funções `loadFinancasConfig()`, `saveFinancasConfig()`, `getFinancasConfig()`.
- **FR-20.6.4:** Botão "Salvar" com binding em `app.js` (padrão dos demais saves de config).

### Critérios de Aceitação
- **AC1:** *Given* a engrenagem, *When* abro as configurações, *Then* a aba aparece como "Finanças" e mantém os cards existentes funcionando.
- **AC2:** *Given* o card "Preferências de Recebimento", *When* defino prazo = 5 e salvo, *Then* o valor persiste após reload e sincroniza (Supabase).
- **AC3:** *Given* `getFinancasConfig()`, *When* chamado, *Then* retorna `{ prazoRecebimentoDias, condicaoPagamentoPadrao, contaCobrancaPadraoId }` com defaults sãos quando vazio.

### Escopo
- **IN:** rename da aba, novo card, storage key, load/save/getter, sync, binding. **OUT:** alterar fluxo de vencimento (20.7) e remover hardcodes (20.8) — só **prover** a config.

### Arquivos
- `index.html:808` (tab), `:971-1048` (`#config-contas-bancarias`)
- `app-config.js` (keys :2-7, load `:105`, save padrão `:139-167`, getters `:332-347`)
- `app-sync.js:52-68` (`cloudSave`), `app.js:1893-1908` (bindings)

### Nota arquitetural
@architect valida: schema da config Finanças e **ponto único de leitura do prazo** (`getFinancasConfig()`) consumido por NF/Pedidos.

---

## STORY 20.7 — Vencimento da conta a receber a partir da emissão da NF

**Resolve:** FIN-4 · **Prioridade:** P1 · **Risco:** MÉDIO · **Complexidade:** S
**Depende de:** 20.6

### Descrição
A conta a receber originada de NF deve vencer a partir da **data de emissão da NF** + prazo configurado, e não a partir da data do pedido. Hoje `buildReceivableFromInvoice` já usa a data da NF, mas crava +28 dias fixos; e `recalcularVencimentoPedido` usa a data do pedido.

### Requisitos Funcionais
- **FR-20.7.1:** Em `buildReceivableFromInvoice`, calcular `vencimento = emitidaEm + getFinancasConfig().prazoRecebimentoDias` (quando não houver `invoice.vencimento` explícito).
- **FR-20.7.2:** Garantir que contas originadas de NF **não** sejam recalculadas a partir da data do pedido por `recalcularVencimentoPedido`.

### Critérios de Aceitação
- **AC1:** *Given* prazo configurado = 5, *When* emito uma NF em 12/06, *Then* a conta a receber vence em 17/06 (NF + 5).
- **AC2:** *Given* uma conta originada de NF, *When* o pedido sofre recálculo de vencimento, *Then* o vencimento da conta de NF não é sobrescrito pela data do pedido.

### Escopo
- **IN:** cálculo do vencimento na origem NF + isolamento do recálculo por pedido. **OUT:** UI de config (20.6).

### Arquivos
- `gdp-notas-fiscais.js:818-825` (`buildReceivableFromInvoice`)
- `gdp-pedidos.js:1170-1179` (`calcularVencimentoPagamento`/`recalcularVencimentoPedido`)

---

## STORY 20.8 — Centralizar prazo padrão (remover hardcode de 28 dias)

**Resolve:** FIN-5 · **Prioridade:** P2 · **Risco:** BAIXO · **Complexidade:** S
**Depende de:** 20.6

### Descrição
O prazo padrão de 28 dias está hardcoded em 6+ pontos. Centralizar a leitura na config Finanças (`getFinancasConfig().prazoRecebimentoDias`), com fallback, e substituir os hardcodes.

### Requisitos Funcionais
- **FR-20.8.1:** Criar/usar um ponto único de leitura do prazo padrão a partir de `getFinancasConfig()`.
- **FR-20.8.2:** Substituir os defaults `28`/`"28"` nos pontos identificados pelo valor configurado (mantendo fallback seguro).

### Critérios de Aceitação
- **AC1:** *Given* prazo configurado = 5, *When* crio um pedido sem alterar dados de pagamento, *Then* a condição padrão usada é 5 dias (não 28).
- **AC2:** *Given* config vazia, *When* o sistema lê o prazo, *Then* usa um fallback são sem quebrar.
- **AC3:** Nenhum dos pontos antigos mantém o `28` hardcoded como única fonte.

### Escopo
- **IN:** substituição dos hardcodes pela config. **OUT:** UI de config (20.6).

### Arquivos
- `gdp-pedidos.js:775, 964, 1096, 1171, 1178, 1429`
- `gdp-notas-fiscais.js:823`

---

---

## ONDA 3 — Bugs reportados pelo stakeholder (2026-06-18)

> Investigação por causa-raiz: @analyst (Atlas) — `handoff-analyst-to-pm-4bugs-20260618.yaml`.
> **Descoberta-chave:** 20.16 e 20.19 compartilham a mesma raiz (normalização de acento). Corrigir o helper resolve os dois.

| Sintoma (stakeholder) | Causa-raiz (evidência) | Story | Risco |
|-----------------------|------------------------|-------|-------|
| Busca ainda exige acento/pontuação | Regex frágil em `normalizeSearch` (gdp-core.js:32) + 5 buscas não migradas | **20.16** | BAIXO |
| Pedido faturado não troca de aba + status manual reverte | UI não navega ao faturar + race condition de realtime sobrescreve edição local (gdp-realtime.js:196-217) | **20.17** | MÉDIO |
| Datas ao contrário (mm/dd) em vários lugares | `formatDateTimeLocal` locale-dependente + `'T12:00:00'` hardcoded | **20.18** | BAIXO |
| Cobrança WhatsApp "telefone não encontrado" (Escola América) c/ telefone cadastrado | `_buscarTelefoneCliente` casa nome sem remover acento (gdp-core.js:2013) — consequência da 20.16 | **20.19** | BAIXO |

**Decisões do stakeholder (2026-06-18):**
- **Datas (20.18):** escopo MÍNIMO — corrigir só os pontos invertidos, NÃO centralizar os 83+ `toLocaleDateString('pt-BR')` já corretos.
- **Faturar (20.17):** ao faturar, navegar automaticamente para a aba "Faturado".
- **Granularidade:** 4 stories separadas (validar/deployar independentemente).

**Dependências:** 20.19 depende de 20.16 (mesmo helper). 20.17 recomenda validação @architect (correlato 20.15b).

---

## Delegação (Workflow SDC)

| Fase | Agente | Ação |
|------|--------|------|
| Arquitetura (pré-dev) | @architect (Aria) | Validar 20.6 (schema config + ponto único de leitura) e 20.7 (regra de origem do vencimento) |
| Story drafting | @sm (River) | `*draft` de 20.1 a 20.8 (a partir deste épico) |
| Validação | @po (Pax) | `*validate-story-draft` (10-point) → Draft→Ready |
| Implementação | @dev (Dex) | Onda 1 (20.1–20.5) → Onda 2 (20.6 → 20.7/20.8) |
| QA | @qa (Quinn) | `*qa-gate` por story |
| Deploy | @devops (Gage) | commits/push + `vercel --prod` (sem DDL novo) |

## Riscos & Notas

- **Sem novo DDL:** config Finanças usa `sync_data` (já existe). Confirmar com @data-engineer apenas se algo escapar do padrão de config.
- **Produção:** Caixa e Conciliação tocam fluxo financeiro em produção — Onda 1 com QA atento a regressão.
- **Multi-tenant:** a config Finanças é o primeiro passo do prazo "por empresa" (alinha com EPIC-18 Multi-tenant SaaS).

## Change Log

| Data | Autor | Mudança |
|------|-------|---------|
| 2026-06-12 | @pm (Morgan) | Criação do EPIC-20 a partir do brief do @analyst (handoff-analyst-to-pm-dev-financeiro-20260612.yaml) |
| 2026-06-18 | @pm (Morgan) | Onda 3: stories 20.16-20.19 criadas a partir do handoff @analyst (4 bugs de produção). 20.16 (busca s/ acento), 20.17 (status pedido reverte/faturar), 20.18 (datas dd/mm escopo mínimo), 20.19 (cobrança WhatsApp telefone). |
