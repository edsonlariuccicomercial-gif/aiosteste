# SPEC-GDP-GAPS: Especificacao dos 4 Gaps Operacionais do GDP

**Versao:** 1.0
**Status:** Approved (Spec Pipeline Phase 4)
**Data:** 2026-04-20
**Autor:** @pm (Morgan) — Spec Pipeline *write-spec
**Fonte:** SOP-GDP-000 (Fluxo Operacional Completo) + Brownfield Discovery Phase 1

---

## 1. Visao Geral

### 1.1 Contexto

O GDP (Gestao de Demanda e Precos) e a plataforma operacional de um fornecedor de Caixas Escolares de MG. O sistema possui um pipeline de 14 etapas (SOP-GDP-000) que cobre desde o monitoramento de orcamentos no SGD ate a formacao de series historicas de precos.

Apos auditoria completa (Brownfield Discovery + SOP mapping), foram identificados **4 gaps criticos** no pipeline que impactam diretamente a operacao:

| Gap | Etapa SOP | Problema | Impacto |
|-----|-----------|----------|---------|
| G1 | Etapa 5 (Revisao) | Sem validacao de unidade pre-envio | Perda de licitacoes por erro de unidade |
| G2 | Etapas 6-7 (C.A. + Central) | Dois sistemas sobrepostos | Dados divergentes, confusao operacional |
| G3 | Etapa 11 (Contrato) | Contrato manual apos vitoria | Tempo desperdicado, risco de perda de dados |
| G4 | Etapa 14 (Serie Historica) | Historico em arrays localStorage | Sem analytics por cidade/SRE/escola |

### 1.2 Abordagem

Cada gap sera resolvido com mudancas incrementais no frontend vanilla JS existente e no backend Supabase. Nao sera introduzido nenhum framework novo. As solucoes seguem o padrao dual-layer (Supabase-first + localStorage fallback) ja estabelecido no sistema (ref: `gdp-api.js`).

### 1.3 Rastreabilidade

Todos os requisitos neste documento tracem para etapas especificas do SOP-GDP-000. Nenhuma funcionalidade e inventada — cada FR, NFR e CON tem origem documentada.

---

## 2. Avaliacao de Complexidade

### 2.1 Dimensoes (escala 1-5)

| Dimensao | G1 | G2 | G3 | G4 |
|----------|:--:|:--:|:--:|:--:|
| **Escopo** (arquivos afetados) | 2 | 4 | 3 | 3 |
| **Integracao** (APIs externas) | 2 | 1 | 1 | 1 |
| **Infraestrutura** (mudancas DB/deploy) | 1 | 2 | 2 | 3 |
| **Conhecimento** (familiaridade time) | 2 | 3 | 2 | 3 |
| **Risco** (criticidade) | 4 | 3 | 2 | 2 |
| **Total** | **11** | **13** | **10** | **12** |
| **Classe** | STANDARD | STANDARD | STANDARD | STANDARD |

### 2.2 Justificativas

- **G1 (11):** Risco alto (P0) porque erro de unidade causa perda imediata de receita. Escopo pequeno (2 arquivos), mas integracao com SGD payload exige cuidado.
- **G2 (13):** Escopo grande — deprecar `banco-precos-client.js` e migrar dados para `gdp-banco-produtos.js`. Conhecimento medio porque envolve dois sistemas que poucos entendem completamente.
- **G3 (10):** Logica ja existe parcialmente em `criarContratoGdp()` no `app-results.js`. Precisa tornar automatico e persistir no Supabase.
- **G4 (12):** Infraestrutura media — tabela `preco_historico` ja existe (migration 005), mas faltam views de agregacao e populacao sistematica.

---

## 3. G1: Revisao de Cotacao — Validacao de Unidade

**Referencia SOP:** Etapa 5 — Revisao da Cotacao
**Prioridade:** P0
**Status SOP:** &#10060; Nao existe no sistema

### 3.1 Problema Detalhado

Quando o operador monta o pre-orcamento e envia a proposta ao SGD, nao ha nenhuma etapa de validacao que compare:
- A **unidade do SGD** (ex: "CAIXA C/ 12 UNIDADES") com a **unidade da Central** (ex: "UN")
- A **quantidade SGD** com a **quantidade cotada**
- O **preco unitario** considerando a conversao de unidade

**Consequencia direta:** O operador cota "R$ 3,50 por unidade" quando o SGD espera "R$ 42,00 por caixa com 12". A proposta e rejeitada ou perde para concorrentes que cotaram corretamente.

**Funcao atual sem validacao:** `buildSgdPayload()` em `app-sgd-integration.js:58` simplesmente mapeia os itens do pre-orcamento para o payload SGD sem nenhuma checagem de consistencia de unidades.

### 3.2 Requisitos Funcionais

**FR-G1-001: Modal de Revisao Pre-Envio**
Antes de enviar a proposta ao SGD (funcao `enviarParaSgd()` em `app-sgd-integration.js:120`), o sistema DEVE exibir um modal de revisao que liste todos os itens com os campos: nome, unidade SGD, unidade Central, quantidade SGD, quantidade cotada, preco unitario e preco total.

**FR-G1-002: Deteccao de Divergencia de Unidade**
O sistema DEVE comparar a unidade de cada item do orcamento SGD (campo `unit` do item retornado pelo SGD) com a unidade do produto na Central de Produtos (`bancoProdutos.itens[].unidade` em `gdp-banco-produtos.js`). Se houver divergencia, o item DEVE ser destacado visualmente com badge de alerta.

**FR-G1-003: Regras de Conversao de Unidade**
O sistema DEVE manter uma tabela de conversao para os pares mais comuns:

| De | Para | Fator | Direcao |
|----|------|-------|---------|
| CX C/ 12 | UN | 12 | dividir preco |
| CX C/ 6 | UN | 6 | dividir preco |
| PCT C/ 10 | UN | 10 | dividir preco |
| FD C/ 12 | UN | 12 | dividir preco |
| KG | UN | peso_medio | calcular |
| LT | ML | 1000 | multiplicar |
| CX | UN | qtd_embalagem | lookup Central |

A tabela sera extensivel via configuracao em `localStorage` (chave: `gdp.unit-conversion.v1`).

**FR-G1-004: Sugestao de Preco Corrigido**
Quando uma divergencia de unidade e detectada, o sistema DEVE sugerir o preco unitario corrigido aplicando o fator de conversao. O operador pode aceitar a sugestao ou manter o preco original.

**FR-G1-005: Bloqueio Condicional de Envio**
Se houver pelo menos 1 item com divergencia de unidade NAO resolvida (operador nao confirmou ciencia), o botao "Enviar ao SGD" DEVE permanecer desabilitado com tooltip explicando a pendencia.

**FR-G1-006: Resumo de Revisao**
O modal DEVE exibir um resumo com:
- Total de itens revisados
- Itens com divergencia de unidade
- Itens com divergencia de quantidade
- Valor total original vs. valor total corrigido
- Checkbox "Li e confirmo que as unidades estao corretas"

### 3.3 Requisitos Nao-Funcionais

**NFR-G1-001: Tempo de Carregamento**
O modal de revisao DEVE abrir em menos de 500ms, mesmo com 50+ itens.

**NFR-G1-002: Sem Perda de Estado**
Se o operador fechar o modal sem enviar, todas as correcoes feitas DEVEM ser preservadas no pre-orcamento.

**NFR-G1-003: Offline-First**
A tabela de conversao de unidades DEVE funcionar offline (armazenada em localStorage). A deteccao de divergencia NAO depende de chamadas de API.

### 3.4 Restricoes

**CON-G1-001:** O modal de revisao DEVE ser inserido ANTES da chamada `enviarParaSgd()` e DEPOIS da aprovacao do pre-orcamento (status = "aprovado"). Nao e uma etapa separada — e um gate no fluxo de envio existente.

**CON-G1-002:** A logica de matching entre item SGD e produto Central DEVE reutilizar o `RadarMatcher` existente (`radar-matcher.js`), nao criar um novo mecanismo de matching.

**CON-G1-003:** O modal DEVE seguir o design system existente (CSS variables, dark theme, classes `.modal`, `.badge-danger`, `.badge-warn`).

### 3.5 UI Mockup (ASCII)

```
+--------------------------------------------------------------------+
|  REVISAO DE COTACAO — PRE-ENVIO SGD                           [X]  |
+--------------------------------------------------------------------+
|                                                                    |
|  Escola: E.E. Joao Pinheiro — Uberaba/MG                         |
|  Orcamento: #12345 — 8 itens — R$ 3.450,00                       |
|                                                                    |
|  +------+---------------------+--------+--------+--------+------+ |
|  | #    | Item                | Un.SGD | Un.Cot | Preco  | Flag | |
|  +------+---------------------+--------+--------+--------+------+ |
|  | 1    | Papel A4 75g        | RESMA  | RESMA  | 28,50  |  OK  | |
|  | 2    | Lapis preto n2      | CX/12  | UN     |  1,50  |  !!  | |
|  |      |   > Sugestao: R$ 18,00 (CX c/ 12)    [Aceitar]       | |
|  | 3    | Borracha branca      | UN     | UN     |  1,20  |  OK  | |
|  | 4    | Caneta esf. azul     | CX/50  | UN     |  0,90  |  !!  | |
|  |      |   > Sugestao: R$ 45,00 (CX c/ 50)    [Aceitar]       | |
|  +------+---------------------+--------+--------+--------+------+ |
|                                                                    |
|  Resumo:                                                           |
|  - 8 itens revisados                                               |
|  - 2 divergencias de unidade (!)                                   |
|  - Valor original: R$ 3.450,00                                     |
|  - Valor corrigido: R$ 3.510,00                                    |
|                                                                    |
|  [x] Li e confirmo que as unidades e precos estao corretos         |
|                                                                    |
|  [Cancelar]                    [Enviar ao SGD ->]                  |
+--------------------------------------------------------------------+
```

### 3.6 Integracao

- **Entrada:** `preOrcamentos[id].itens` (app-state) + `orcamentos[].itens` (dados SGD)
- **Matching:** `RadarMatcher.match(item.nome)` para vincular ao produto Central
- **Saida:** `buildSgdPayload()` recebe itens revisados com precos corrigidos
- **Ponto de insercao:** Entre o clique em "Enviar ao SGD" (`enviarParaSgd()` linha 120) e a chamada real ao proxy

### 3.7 Criterios de Aceitacao

- [ ] AC-1: Modal de revisao abre automaticamente ao clicar "Enviar ao SGD"
- [ ] AC-2: Divergencias de unidade sao destacadas com badge vermelho
- [ ] AC-3: Sugestao de preco corrigido aparece para itens com divergencia
- [ ] AC-4: Botao "Enviar" fica desabilitado ate operador confirmar checkbox
- [ ] AC-5: Precos corrigidos aceitos sao salvos no pre-orcamento
- [ ] AC-6: Funciona offline (conversoes em localStorage)
- [ ] AC-7: Modal fecha sem perder correcoes ja feitas

---

## 4. G2: Consolidacao Banco de Precos para Central Unica

**Referencia SOP:** Etapas 6 (C.A. Referencia) e 7 (Central de Produtos) + Decisao Pendente "Banco de Precos (deprecar)"
**Prioridade:** P1
**Status SOP:** &#10060; Deprecar `banco-precos-client.js` / Migrar para Central

### 4.1 Problema Detalhado

Existem dois sistemas sobrepostos que gerenciam dados similares:

**Sistema 1: Banco de Precos** (`app-banco.js` + `js/banco-precos-client.js`)
- Armazenado em localStorage chave `caixaescolar.banco.v1`
- Estrutura: `bancoPrecos.itens[]` com campos `item`, `custoBase`, `precoReferencia`, `custosFornecedor[]`, `concorrentes[]`, `propostas[]`
- Conecta a API externa `cotacoes-lariucci.vercel.app` via `BancoPrecos` SDK
- Renderizado por `renderBanco()` em `app-banco.js`
- Carregado como `<script src="js/banco-precos-client.js?v=1">` no `index.html:1346`

**Sistema 2: Central de Produtos** (`js/gdp-banco-produtos.js`)
- Armazenado em localStorage chave `gdp.produtos.v1`
- Estrutura: `bancoProdutos.itens[]` com campos `descricao`, `sku`, `ncm`, `unidade`, `marca`
- Sem conexao com API externa
- Renderizado por `renderBancoProdutos()` em `gdp-banco-produtos.js`

**Divergencias:**
- O Banco de Precos tem historico de custos (`custosFornecedor[]`) que a Central nao tem
- A Central tem NCM e SKU que o Banco de Precos nao tem
- O Banco de Precos tem concorrentes e propostas; a Central nao
- O `RadarMatcher` referencia o Banco de Precos; a Central nao e usada no matching

### 4.2 Requisitos Funcionais

**FR-G2-001: Schema Unificado na Central de Produtos**
Cada produto na Central de Produtos (`gdp.produtos.v1`) DEVE conter os campos unificados:

```javascript
{
  id: "string",                    // UUID (ja existe)
  descricao: "string",            // Nome normalizado (ja existe)
  sku: "string",                  // SKU interno (ja existe)
  ncm: "string",                  // NCM fiscal (ja existe)
  unidade: "string",              // UN, CX, KG, etc (ja existe)
  marca: "string",                // Marca preferencial (ja existe)
  // --- Campos migrados do Banco de Precos ---
  custoBase: "number",            // Custo de aquisicao (C.A.)
  precoReferencia: "number",      // Preco de venda sugerido
  margemAlvo: "number",           // % margem alvo
  custosFornecedor: "array",      // Historico de custos de fornecedores
  concorrentes: "array",          // Precos de concorrentes
  propostas: "array",             // Historico de propostas enviadas
  historicoResultados: "array",   // Resultados ganho/perdido
  precoReferenciaHistorico: "number", // Media de precos ganhos
  taxaConversao: "number",        // % de propostas ganhas
  grupo: "string",                // Grupo de despesa
  fonte: "string",                // Origem dos dados
}
```

**FR-G2-002: Script de Migracao One-Time**
O sistema DEVE executar uma migracao automatica na inicializacao (`gdp-init.js`) que:
1. Le `caixaescolar.banco.v1` (Banco de Precos)
2. Para cada item, busca correspondencia em `gdp.produtos.v1` (Central) por nome/SKU
3. Se encontrar: merge dos campos do Banco de Precos no produto Central
4. Se nao encontrar: cria novo produto na Central com todos os campos
5. Marca migracao como concluida em `localStorage.setItem('banco-precos-migrated.v1', 'true')`
6. NAO exclui `caixaescolar.banco.v1` imediatamente (manter por 30 dias como backup)

**FR-G2-003: Deprecar Interface do Banco de Precos**
Apos migracao:
- A aba "Banco de Precos" no dashboard DEVE ser removida ou redirecionada para "Central de Produtos"
- O script `banco-precos-client.js` DEVE ter suas funcoes redirecionadas para a Central (facade pattern)
- `renderBanco()` em `app-banco.js` DEVE ser substituido por `renderBancoProdutos()` enriquecido

**FR-G2-004: Central de Produtos Enriquecida**
A UI da Central de Produtos (`renderBancoProdutos()`) DEVE exibir as colunas adicionais:
- Custo Base (C.A.)
- Preco Referencia
- Margem Real (%)
- Tendencia (badge)
- Competitividade (badge)

Essas colunas ja existem em `renderBanco()` do `app-banco.js` e serao portadas.

**FR-G2-005: Atualizacao do RadarMatcher**
O `RadarMatcher` (`radar-matcher.js`) DEVE ser atualizado para buscar produtos na Central unificada (`gdp.produtos.v1`) em vez do Banco de Precos (`caixaescolar.banco.v1`).

**FR-G2-006: BancoPrecos SDK como Facade**
O SDK `BancoPrecos` em `banco-precos-client.js` DEVE continuar funcionando como facade que:
- Recebe chamadas existentes (ex: `BancoPrecos.calcularPreco()`)
- Internamente consulta a Central de Produtos unificada
- Chamadas a API externa (`cotacoes-lariucci.vercel.app`) permanecem opcionais via feature flag

### 4.3 Requisitos Nao-Funcionais

**NFR-G2-001: Migracao Idempotente**
A migracao DEVE ser segura para executar multiplas vezes sem duplicar dados.

**NFR-G2-002: Compatibilidade Retroativa**
Funcoes que leem `bancoPrecos.itens` (ex: `alimentarBancoComResultado()` em `app-results.js:667`) DEVEM continuar funcionando durante o periodo de transicao via alias/proxy.

**NFR-G2-003: Performance de Renderizacao**
A Central unificada com campos extras DEVE renderizar em menos de 300ms para ate 500 produtos.

### 4.4 Restricoes

**CON-G2-001:** Nao remover `caixaescolar.banco.v1` do localStorage por 30 dias apos migracao. Permitir rollback se necessario.

**CON-G2-002:** A API externa `cotacoes-lariucci.vercel.app` NAO sera desligada nesta fase. O SDK continua podendo consultar precos sugeridos remotamente.

**CON-G2-003:** O campo `grupo` (grupo de despesa: alimentacao, limpeza, papelaria) DEVE ser preservado na migracao — e a chave de priorizacao no pipeline (SOP Etapa 2).

### 4.5 Modelo de Dados (Migracao)

```
+-------------------------------------------+
|  ANTES: Dois sistemas                     |
+-------------------------------------------+
|                                           |
|  caixaescolar.banco.v1                    |
|  ├── itens[].item                         |
|  ├── itens[].custoBase                    |
|  ├── itens[].precoReferencia              |
|  ├── itens[].custosFornecedor[]           |
|  ├── itens[].concorrentes[]               |
|  └── itens[].propostas[]                  |
|                                           |
|  gdp.produtos.v1                          |
|  ├── itens[].descricao                    |
|  ├── itens[].sku                          |
|  ├── itens[].ncm                          |
|  └── itens[].unidade                      |
|                                           |
+-------------------------------------------+
|  DEPOIS: Central Unica                    |
+-------------------------------------------+
|                                           |
|  gdp.produtos.v1 (enriquecido)           |
|  ├── itens[].descricao   (= item)        |
|  ├── itens[].sku                          |
|  ├── itens[].ncm                          |
|  ├── itens[].unidade                      |
|  ├── itens[].marca                        |
|  ├── itens[].custoBase         <-- merge  |
|  ├── itens[].precoReferencia   <-- merge  |
|  ├── itens[].custosFornecedor  <-- merge  |
|  ├── itens[].concorrentes      <-- merge  |
|  ├── itens[].propostas         <-- merge  |
|  ├── itens[].historicoResultados <-- merge|
|  ├── itens[].grupo             <-- merge  |
|  └── itens[].taxaConversao     <-- merge  |
|                                           |
|  caixaescolar.banco.v1 (backup, read-only)|
+-------------------------------------------+
```

### 4.6 Integracao

- **Arquivos afetados:**
  - `js/gdp-banco-produtos.js` — Enriquecer schema e UI
  - `js/banco-precos-client.js` — Converter para facade
  - `app-banco.js` — Deprecar ou redirecionar
  - `radar-matcher.js` — Atualizar fonte de dados
  - `app-results.js` — `alimentarBancoComResultado()` atualizar referencia
  - `js/gdp-init.js` — Adicionar script de migracao
  - `index.html` — Remover ou ajustar aba "Banco de Precos"

### 4.7 Criterios de Aceitacao

- [ ] AC-1: Migracao automatica executa no boot sem intervencao do usuario
- [ ] AC-2: Todos os itens do Banco de Precos aparecem na Central de Produtos
- [ ] AC-3: Campos custoBase, precoReferencia, custosFornecedor migrados corretamente
- [ ] AC-4: RadarMatcher busca na Central unificada
- [ ] AC-5: alimentarBancoComResultado() grava na Central unificada
- [ ] AC-6: Migracao e idempotente (rodar 2x nao duplica)
- [ ] AC-7: Backup do Banco de Precos original preservado por 30 dias
- [ ] AC-8: Central exibe colunas de custo, margem e competitividade

---

## 5. G3: Resultado para Contrato Automatico

**Referencia SOP:** Etapa 11 — Contrato (pos-vitoria)
**Prioridade:** P1
**Status SOP:** &#9888;&#65039; Manual

### 5.1 Problema Detalhado

Quando um orcamento e marcado como "ganho" (`resultado === "ganho"` em `app-results.js:138`), a criacao do contrato depende de:

1. O operador marcar manualmente o checkbox "Gerar contrato GDP" (`res-gerar-contrato-gdp`)
2. O operador opcionalmente digitar o numero do contrato (`res-numero-contrato`)
3. A funcao `criarContratoGdp()` (`app-results.js:392`) e chamada

**Problemas atuais:**
- O contrato e criado apenas em localStorage (`gdp.contratos.v1`) — nao persiste no Supabase
- Se o operador esquecer de marcar o checkbox, o contrato nao e criado
- A funcao `criarContratoGdp()` nao vincula os produtos ja normalizados da Central
- O contrato criado nao tem referencia ao SKU/NCM da Central (somente nome e preco)
- A checagem automatica de status SGD (`checarStatusSgd()` em `app-results.js:220`) detecta ganho mas NAO cria contrato automaticamente

### 5.2 Requisitos Funcionais

**FR-G3-001: Criacao Automatica de Contrato**
Quando `resultado === "ganho"` (seja por registro manual via modal ou deteccao automatica via `checarStatusSgd()`), o sistema DEVE criar automaticamente um contrato no GDP sem necessidade de checkbox manual.

**FR-G3-002: Vinculacao com Central de Produtos**
Cada item do contrato DEVE incluir referencia ao produto da Central unificada:

```javascript
{
  nome: "Papel A4 75g",
  produtoCentralId: "prod-abc123",  // ID na Central de Produtos
  sku: "BANK-PAPEL-A4-001",        // SKU da Central
  ncm: "48025610",                 // NCM da Central
  marca: "Chamex",
  unidade: "RESMA",
  quantidade: 50,
  precoUnitario: 28.50,
  precoTotal: 1425.00,
  entregue: 0,
  pendente: 50,
}
```

**FR-G3-003: Persistencia Dual-Layer**
O contrato DEVE ser salvo:
1. Em localStorage (`gdp.contratos.v1`) — imediato
2. No Supabase (tabela `contratos`) — async com retry

Seguindo o padrao de `_SB_RESULTADOS.upsert()` ja implementado em `app-results.js`.

**FR-G3-004: Contrato a partir de Deteccao Automatica**
Quando `checarStatusSgd()` detecta `supplierStatus === "APRO"` (linhas 284-293 de `app-results.js`), o sistema DEVE tambem criar o contrato automaticamente, nao apenas registrar o resultado.

**FR-G3-005: Numero do Contrato Auto-Gerado**
O numero do contrato DEVE seguir o padrao: `CTR-{ANO}{MES}{DIA}-{SEQ4}` (padrao ja existente em `criarContratoGdp()` linha 406). O operador PODE editar o numero posteriormente na tela de contratos.

**FR-G3-006: Notificacao de Contrato Criado**
Apos criacao automatica, o sistema DEVE exibir toast com link para o contrato:
"Contrato CTR-20260420-0001 criado automaticamente! [Ver no GDP]"

**FR-G3-007: Preservar Checkbox como Override**
O checkbox "Gerar contrato GDP" DEVE continuar existindo no modal de resultado, mas com comportamento invertido: marcado por padrao. Desmarcar = opt-out explicito (operador nao quer gerar contrato neste caso).

### 5.3 Requisitos Nao-Funcionais

**NFR-G3-001: Idempotencia**
A criacao de contrato DEVE ser idempotente — se chamada 2x para o mesmo orcamento, nao duplica o contrato. Verificar por `preOrcId` existente.

**NFR-G3-002: Persistencia Async**
O upsert no Supabase NAO DEVE bloquear a UI. Falha no Supabase NAO impede a criacao local.

### 5.4 Restricoes

**CON-G3-001:** O contrato gerado automaticamente DEVE ter `origem: 'auto-resultado'` para diferenciar de contratos criados manualmente.

**CON-G3-002:** A funcao `criarContratoGdp()` DEVE ser refatorada para aceitar criacao sem interacao de modal (chamada programatica).

**CON-G3-003:** O contrato DEVE herdar o `empresa_id` do resultado para compatibilidade com RLS do Supabase.

### 5.5 Modelo de Dados

Tabela `contratos` no Supabase (ja existe via migration 001):

```sql
-- Campos adicionais necessarios no JSONB `itens`:
-- Cada item dentro de contratos.itens (JSONB array) deve incluir:
--   produto_central_id TEXT  -- referencia ao ID na Central de Produtos
--   sku TEXT                 -- SKU da Central
--   ncm TEXT                 -- NCM fiscal

-- Campo adicional no contrato:
-- origem TEXT               -- 'manual' | 'auto-resultado' | 'caixa-escolar'
-- resultado_id TEXT         -- referencia ao resultado que originou
```

Nao requer nova migration — os campos sao adicionados dentro do JSONB `itens` existente e como campos opcionais na tabela.

### 5.6 Integracao

- **Ponto de insercao (manual):** `salvarResultado()` em `app-results.js:138` — chamar `criarContratoGdp()` automaticamente quando `resultado === "ganho"`
- **Ponto de insercao (auto):** `checarStatusSgd()` em `app-results.js:284` — apos detectar `APRO`, tambem criar contrato
- **Matching Central:** Usar `RadarMatcher.match(item.nome)` para vincular ao produto Central e obter SKU/NCM
- **Supabase:** Seguir padrao de `_SB_RESULTADOS` para criar `_SB_CONTRATOS` com upsert async

### 5.7 Criterios de Aceitacao

- [ ] AC-1: Contrato criado automaticamente ao registrar resultado "ganho"
- [ ] AC-2: Contrato criado automaticamente na deteccao SGD status APRO
- [ ] AC-3: Itens do contrato incluem produtoCentralId, SKU e NCM
- [ ] AC-4: Contrato persiste no Supabase (tabela contratos)
- [ ] AC-5: Criacao e idempotente (nao duplica para mesmo orcamento)
- [ ] AC-6: Toast com link "Ver no GDP" aparece apos criacao
- [ ] AC-7: Checkbox "Gerar contrato" marcado por padrao, permite opt-out

---

## 6. G4: Serie Historica Dedicada

**Referencia SOP:** Etapa 14 — Serie Historica
**Prioridade:** P2
**Status SOP:** &#9888;&#65039; Parcial (tabela existe, populacao insuficiente)

### 6.1 Problema Detalhado

O historico de precos existe em dois lugares com problemas distintos:

**localStorage (Banco de Precos):**
- `bancoPrecos.itens[].custosFornecedor[]` — array de `{ fornecedor, preco, data, fonte }`
- Nao e queryable por cidade/SRE/escola
- Perde-se se o operador limpar o browser

**Supabase (tabela `preco_historico`):**
- Criada na migration `005_preco_historico.sql`
- Schema: `id, empresa_id, sku, escola, sre, tipo, valor, custo_base, margem_pct, fonte, metadata, created_at`
- Indices: `sku`, `tipo`, `sku+sre`, `created_at`
- RLS ativo por `empresa_id`
- **Problema:** So e populada a partir de NFs de entrada (`gdp-init.js:1682-1683`). NAO recebe dados de propostas enviadas, resultados de orcamentos ou contratos.

**Consequencia:** O operador nao consegue responder perguntas como:
- "Qual o preco medio de papel A4 nas escolas de Uberaba?"
- "Minha margem esta melhorando ou piorando nesta SRE?"
- "Quais produtos tenho perdido por preco?"

### 6.2 Requisitos Funcionais

**FR-G4-001: Populacao Sistematica da Tabela preco_historico**
O sistema DEVE inserir registros em `preco_historico` nos seguintes pontos do fluxo:

| Evento | tipo | Ponto de Insercao | Dados |
|--------|------|-------------------|-------|
| Proposta enviada ao SGD | `proposta` | `enviarParaSgd()` em `app-sgd-integration.js:150` | sku, valor proposto, escola, sre, custo_base, margem |
| Resultado ganho | `ganho` | `salvarResultado()` em `app-results.js:168` | sku, valor praticado, escola, sre, custo_base |
| Resultado perdido | `perdido` | `salvarResultado()` em `app-results.js:168` | sku, valor proposto, valor vencedor, escola, sre |
| Contrato criado | `contrato` | `criarContratoGdp()` em `app-results.js:392` | sku, valor unitario, escola, sre |
| NF saida emitida | `nf_saida` | `emitirNfe()` em `gdp-notas-fiscais.js` | sku, valor NF, escola, ncm |
| NF entrada processada | `nf_entrada` | Ja implementado em `gdp-init.js:1682` | sku, custo, ncm |

**FR-G4-002: Metadata Enriquecida**
O campo `metadata` (JSONB) DEVE conter dados contextuais para analytics:

```javascript
{
  orcamento_id: "12345",          // ID do orcamento SGD
  municipio: "Uberaba",           // Municipio da escola
  grupo_despesa: "papelaria",     // Grupo de classificacao
  marca: "Chamex",                // Marca do produto
  concorrente_vencedor: "XYZ Ltd", // Se perdeu
  delta_percent: 12.5,            // % diferenca do vencedor
  unidade: "RESMA",               // Unidade cotada
  quantidade: 50,                 // Quantidade cotada
}
```

**FR-G4-003: View de Agregacao por Municipio**
O sistema DEVE criar uma funcao RPC no Supabase ou query client-side que retorne:

```sql
-- Preco medio por SKU por municipio (ultimos 6 meses)
SELECT
  sku,
  metadata->>'municipio' as municipio,
  AVG(valor) as preco_medio,
  MIN(valor) as preco_min,
  MAX(valor) as preco_max,
  COUNT(*) as total_registros,
  COUNT(*) FILTER (WHERE tipo = 'ganho') as total_ganhos,
  COUNT(*) FILTER (WHERE tipo = 'perdido') as total_perdidos
FROM preco_historico
WHERE empresa_id = :empresa_id
  AND created_at >= NOW() - INTERVAL '6 months'
GROUP BY sku, metadata->>'municipio'
ORDER BY sku, municipio;
```

**FR-G4-004: View de Agregacao por SRE**
Query similar agrupando por `sre` em vez de municipio.

**FR-G4-005: View de Tendencia Temporal**
Query que retorna evolucao de preco por SKU por mes:

```sql
SELECT
  sku,
  DATE_TRUNC('month', created_at) as mes,
  AVG(valor) as preco_medio,
  AVG(margem_pct) as margem_media
FROM preco_historico
WHERE empresa_id = :empresa_id
  AND tipo IN ('proposta', 'ganho')
GROUP BY sku, DATE_TRUNC('month', created_at)
ORDER BY sku, mes;
```

**FR-G4-006: Dashboard de Serie Historica**
Uma nova secao no GDP (aba ou sub-aba na Central de Produtos) DEVE exibir:
- Tabela de precos medios por SKU/municipio
- Grafico de tendencia temporal (linha simples com Chart.js ou ASCII se Chart.js nao estiver disponivel)
- Filtros por: SKU, municipio, SRE, periodo, tipo (proposta/ganho/perdido)
- Indicadores: taxa de conversao por SKU, margem media por regiao

**FR-G4-007: Migracao de Dados Historicos**
O sistema DEVE executar uma migracao one-time que popule `preco_historico` a partir de:
1. `bancoPrecos.itens[].custosFornecedor[]` — tipo `nf_entrada` (historico de custos)
2. `bancoPrecos.itens[].propostas[]` — tipo `proposta` (propostas antigas)
3. `bancoPrecos.itens[].historicoResultados[]` — tipo `ganho` ou `perdido`
4. `resultados_orcamento` do Supabase — resultados ja persistidos

### 6.3 Requisitos Nao-Funcionais

**NFR-G4-001: Insercao Async**
Todas as insercoes em `preco_historico` DEVEM ser async e nao bloquear a UI. Falha no Supabase NAO impede a operacao principal.

**NFR-G4-002: Queries Paginadas**
Views de agregacao DEVEM suportar paginacao (max 100 registros por pagina) para evitar queries pesadas.

**NFR-G4-003: Cache de Agregacoes**
Resultados de agregacao DEVEM ser cacheados por 15 minutos (seguindo padrao de `cachedFetch()` com TTL heavy de 15min).

**NFR-G4-004: Indice para metadata->municipio**
Criar indice GIN em `metadata` para queries JSONB performantes:

```sql
CREATE INDEX IF NOT EXISTS idx_preco_hist_metadata ON preco_historico USING GIN (metadata);
```

### 6.4 Restricoes

**CON-G4-001:** As queries de agregacao DEVEM respeitar o RLS existente (filtro por `empresa_id`). Nao criar views que bypassem RLS.

**CON-G4-002:** A migracao de dados historicos DEVE usar `ON CONFLICT DO NOTHING` para evitar duplicatas se executada multiplas vezes.

**CON-G4-003:** O dashboard de serie historica DEVE usar o design system existente (variaveis CSS, dark theme, classes existentes).

### 6.5 Modelo de Dados

Tabela `preco_historico` ja existe (migration 005). Mudancas necessarias:

```sql
-- Nova migration: 006_preco_historico_enhancements.sql

-- Indice GIN para queries JSONB (metadata->>'municipio', metadata->>'grupo_despesa')
CREATE INDEX IF NOT EXISTS idx_preco_hist_metadata
  ON preco_historico USING GIN (metadata);

-- Indice para queries temporais por SKU
CREATE INDEX IF NOT EXISTS idx_preco_hist_sku_created
  ON preco_historico(sku, created_at DESC);

-- View materializada: preco medio por SKU + municipio (ultimos 6 meses)
-- NOTA: Supabase free tier nao suporta materialized views com refresh.
-- Alternativa: funcao RPC que retorna a agregacao on-demand.

CREATE OR REPLACE FUNCTION preco_medio_por_municipio(
  p_empresa_id TEXT,
  p_meses INTEGER DEFAULT 6
)
RETURNS TABLE (
  sku TEXT,
  municipio TEXT,
  preco_medio NUMERIC,
  preco_min NUMERIC,
  preco_max NUMERIC,
  total_registros BIGINT,
  total_ganhos BIGINT,
  total_perdidos BIGINT,
  taxa_conversao NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.sku,
    ph.metadata->>'municipio' as municipio,
    ROUND(AVG(ph.valor), 2) as preco_medio,
    MIN(ph.valor) as preco_min,
    MAX(ph.valor) as preco_max,
    COUNT(*)::BIGINT as total_registros,
    COUNT(*) FILTER (WHERE ph.tipo = 'ganho')::BIGINT as total_ganhos,
    COUNT(*) FILTER (WHERE ph.tipo = 'perdido')::BIGINT as total_perdidos,
    CASE
      WHEN COUNT(*) FILTER (WHERE ph.tipo IN ('ganho','perdido')) > 0
      THEN ROUND(
        COUNT(*) FILTER (WHERE ph.tipo = 'ganho')::NUMERIC /
        COUNT(*) FILTER (WHERE ph.tipo IN ('ganho','perdido'))::NUMERIC * 100,
        1
      )
      ELSE NULL
    END as taxa_conversao
  FROM preco_historico ph
  WHERE ph.empresa_id = p_empresa_id
    AND ph.created_at >= NOW() - (p_meses || ' months')::INTERVAL
  GROUP BY ph.sku, ph.metadata->>'municipio'
  ORDER BY ph.sku, municipio;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION tendencia_preco_mensal(
  p_empresa_id TEXT,
  p_sku TEXT DEFAULT NULL,
  p_meses INTEGER DEFAULT 12
)
RETURNS TABLE (
  sku TEXT,
  mes DATE,
  preco_medio NUMERIC,
  margem_media NUMERIC,
  total_registros BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ph.sku,
    DATE_TRUNC('month', ph.created_at)::DATE as mes,
    ROUND(AVG(ph.valor), 2) as preco_medio,
    ROUND(AVG(ph.margem_pct), 1) as margem_media,
    COUNT(*)::BIGINT as total_registros
  FROM preco_historico ph
  WHERE ph.empresa_id = p_empresa_id
    AND (p_sku IS NULL OR ph.sku = p_sku)
    AND ph.tipo IN ('proposta', 'ganho')
    AND ph.created_at >= NOW() - (p_meses || ' months')::INTERVAL
  GROUP BY ph.sku, DATE_TRUNC('month', ph.created_at)
  ORDER BY ph.sku, mes;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### 6.6 UI Mockup (ASCII)

```
+--------------------------------------------------------------------+
|  SERIE HISTORICA DE PRECOS                                         |
+--------------------------------------------------------------------+
|                                                                    |
|  Filtros: [SKU: Todos v] [Municipio: Todos v] [SRE: Uberaba v]   |
|           [Periodo: Ultimos 6 meses v] [Tipo: Todos v]            |
|                                                                    |
|  +------+------------------+---------+-------+-------+------+---+ |
|  | SKU  | Produto          | Mun.    | Media | Ganho | Perd | %  | |
|  +------+------------------+---------+-------+-------+------+---+ |
|  | BP01 | Papel A4 75g     | Uberaba | 28,50 |   12  |   3  | 80 | |
|  | BP01 | Papel A4 75g     | Ubera.  | 29,00 |    5  |   2  | 71 | |
|  | BP02 | Lapis preto n2   | Uberaba |  1,50 |    8  |   5  | 62 | |
|  | BP03 | Borracha branca  | Uberaba |  1,20 |   15  |   1  | 94 | |
|  +------+------------------+---------+-------+-------+------+---+ |
|                                                                    |
|  Tendencia: Papel A4 75g (Uberaba)                                |
|  R$                                                                |
|  30|          *                                                    |
|  29|    *          *    *                                          |
|  28|  *    *    *    *    *    *                                   |
|  27|                                                               |
|    +--+----+----+----+----+----+--                                |
|     Nov  Dez  Jan  Fev  Mar  Abr                                  |
|                                                                    |
|  KPIs:                                                             |
|  - Taxa conversao geral: 73%                                      |
|  - Margem media: 18,5%                                             |
|  - Produtos mais competitivos: Borracha (94%), Papel A4 (80%)     |
|  - Produtos em risco: Lapis preto (62% - margem caindo)           |
+--------------------------------------------------------------------+
```

### 6.7 Integracao

- **Pontos de insercao (6 pontos):**
  1. `app-sgd-integration.js` — `enviarParaSgd()` linha 150 (tipo: proposta)
  2. `app-results.js` — `salvarResultado()` linha 168 (tipo: ganho/perdido)
  3. `app-results.js` — `criarContratoGdp()` linha 392 (tipo: contrato)
  4. `gdp-notas-fiscais.js` — emissao de NF (tipo: nf_saida)
  5. `gdp-init.js` — ja existe para nf_entrada (linhas 1682-1683)
  6. `app-results.js` — `checarStatusSgd()` linha 288 (tipo: ganho auto)

- **Queries:** Via Supabase RPC (`supabase.rpc('preco_medio_por_municipio', { ... })`)
- **Dashboard:** Nova secao em `gdp-banco-produtos.js` ou arquivo separado `gdp-serie-historica.js`

### 6.8 Criterios de Aceitacao

- [ ] AC-1: Proposta enviada ao SGD gera registro tipo `proposta` em preco_historico
- [ ] AC-2: Resultado ganho gera registro tipo `ganho` em preco_historico
- [ ] AC-3: Resultado perdido gera registro tipo `perdido` com valor vencedor
- [ ] AC-4: Contrato criado gera registro tipo `contrato`
- [ ] AC-5: NF saida emitida gera registro tipo `nf_saida`
- [ ] AC-6: Dashboard exibe tabela de precos medios por SKU/municipio
- [ ] AC-7: Filtros por SKU, municipio, SRE e periodo funcionam
- [ ] AC-8: Migracao de dados historicos popula preco_historico sem duplicatas
- [ ] AC-9: Funcoes RPC retornam dados corretos respeitando RLS

---

## 7. Dependencias entre Gaps

### 7.1 Grafo de Dependencia

```
G2 (Central Unica)
 |
 +----> G1 (Revisao Cotacao)      [G1 depende de G2 para matching por SKU]
 |
 +----> G3 (Contrato Automatico)  [G3 depende de G2 para vincular SKU/NCM]
 |
 +----> G4 (Serie Historica)      [G4 depende de G2 para SKU unificado]
```

### 7.2 Ordem de Implementacao Recomendada

| Ordem | Gap | Justificativa |
|:-----:|-----|---------------|
| 1 | **G2** | Fundacao: Central unificada e pre-requisito para todos os outros gaps |
| 2 | **G1** | P0: Maior impacto operacional imediato. Usa Central unificada para matching |
| 3 | **G3** | P1: Depende de G2 para vincular SKU/NCM. Logica base ja existe |
| 4 | **G4** | P2: Depende de G2 (SKU unificado) e G3 (contrato gera dados). Nao bloqueia operacao |

### 7.3 Dependencia Critica

**G2 e o ponto de inflexao.** Sem a Central unificada:
- G1 nao consegue vincular produto Central a item SGD de forma confiavel
- G3 nao consegue incluir SKU/NCM no contrato
- G4 nao tem SKU consistente para agregar series historicas

Recomendacao: G2 DEVE ser implementado primeiro, mesmo sendo P1 (e nao P0 como G1), porque G1 depende dele para funcionar corretamente.

---

## 8. Plano de Implementacao

### 8.1 Story Breakdown

| Story | Gap | Titulo | Estimativa | Dependencia |
|-------|-----|--------|:----------:|:-----------:|
| X.1 | G2 | Unificar schema Central de Produtos com campos do Banco de Precos | 3 pts | — |
| X.2 | G2 | Migrar dados Banco de Precos para Central de Produtos | 2 pts | X.1 |
| X.3 | G2 | Deprecar Banco de Precos e atualizar RadarMatcher | 2 pts | X.2 |
| X.4 | G2 | Enriquecer UI Central com colunas de custo/margem/competitividade | 2 pts | X.1 |
| X.5 | G1 | Modal de revisao pre-envio com deteccao de divergencia de unidade | 3 pts | X.3 |
| X.6 | G1 | Tabela de conversao de unidades e sugestao de preco corrigido | 2 pts | X.5 |
| X.7 | G3 | Auto-criar contrato em resultado ganho com vinculo Central | 3 pts | X.3 |
| X.8 | G3 | Persistir contrato no Supabase (dual-layer) | 2 pts | X.7 |
| X.9 | G4 | Populacao sistematica de preco_historico (6 pontos de insercao) | 3 pts | X.3 |
| X.10 | G4 | Migration 006 com indices e funcoes RPC de agregacao | 2 pts | X.9 |
| X.11 | G4 | Dashboard de serie historica com filtros e tendencia | 3 pts | X.10 |
| X.12 | G4 | Migracao de dados historicos (backfill preco_historico) | 2 pts | X.9 |

**Total estimado:** 29 story points (~3-4 sprints de 2 semanas)

### 8.2 Cronograma Sugerido

| Sprint | Stories | Foco |
|:------:|---------|------|
| S1 | X.1, X.2, X.3, X.4 | G2 completo — Central Unificada |
| S2 | X.5, X.6, X.7 | G1 completo + inicio G3 |
| S3 | X.8, X.9, X.10 | G3 completo + inicio G4 |
| S4 | X.11, X.12 | G4 completo |

---

## 9. Riscos e Mitigacoes

| # | Risco | Probabilidade | Impacto | Mitigacao |
|---|-------|:------------:|:-------:|-----------|
| R1 | Migracao G2 perde dados historicos do Banco de Precos | Media | Alto | Manter backup `caixaescolar.banco.v1` por 30 dias. Verificacao pos-migracao conta itens. |
| R2 | Tabela de conversao de unidades G1 incompleta para pares exoticos | Alta | Medio | Comecar com top 10 pares. Operador pode adicionar novos via config. Log divergencias nao cobertas. |
| R3 | Performance de queries G4 em preco_historico com volume alto | Baixa | Medio | Indices GIN em metadata. Funcoes RPC com LIMIT. Cache 15min. |
| R4 | RadarMatcher perde qualidade apos troca de fonte (G2) | Media | Alto | Testes A/B: rodar matching contra ambas fontes durante 1 sprint. Comparar resultados. |
| R5 | localStorage cheio apos unificacao (G2) | Media | Alto | Monitorar tamanho total. Implementar compactacao de historico antigo (>6 meses → agregar). |
| R6 | Criacao automatica de contrato (G3) gera contratos indesejados | Baixa | Medio | Checkbox opt-out disponivel. Log de contratos auto-criados para auditoria. |
| R7 | Supabase free tier atinge limite de storage com preco_historico (G4) | Media | Alto | Monitorar com `supabase db size`. Implementar retention policy (dados >12 meses → agregar e remover detalhado). |

---

## 10. Rastreabilidade de Requisitos

| Requisito | Etapa SOP | Evidencia no SOP-GDP-000 |
|-----------|-----------|--------------------------|
| FR-G1-001 a 006 | Etapa 5 | "Revisao humana obrigatoria. Erros comuns: unidade errada (cx vs un)" |
| FR-G2-001 a 006 | Etapas 6-7 | "Repositorio unico de produtos" + Decisao "Excluir modulo Banco de Precos separado" |
| FR-G3-001 a 007 | Etapa 11 | "Cotacao ganha → vira contrato automaticamente. Produtos ja normalizados e associados" |
| FR-G4-001 a 007 | Etapa 14 | "Formacao de series por: Cidade, Regiao (SRE), Escola" |
| CON-G1-002 | Etapa 8 | "Pipeline de matching: fuzzy → manual → aprendizado" (RadarMatcher) |
| CON-G2-003 | Etapa 2 | "Classificar objetos por categoria: alimentacao, limpeza, papelaria" |

---

*Documento gerado por @pm (Morgan) — Spec Pipeline Phase 4: Write Spec*
*Rastreabilidade: SOP-GDP-000 v1.0 + Brownfield Discovery Phase 1*
*Projeto: Painel Caixa Escolar MG / GDP*
*Proxima etapa: @qa critique (Phase 5) → @architect implementation plan (Phase 6)*

---

## CRITIQUE (QA Gate — Spec Pipeline Phase 5)

**Revisor:** @qa (Quinn)
**Data:** 2026-04-20
**Metodo:** Revisao cruzada SPEC-GDP-GAPS.md vs SOP-GDP-000 + codebase verification (line-by-line)

### Scores (1-5)

| Dimensao | Score | Justificativa |
|----------|:-----:|---------------|
| Completude | 4 | Cobre os 4 gaps identificados com FRs, NFRs, CONs e ACs testáveis. Porém, SOP Etapa 13 (Preco do Ganhador) não tem FR dedicado — é parcialmente absorvida por G4 `tipo=perdido` com metadata, mas falta uma view/funcionalidade explícita de "memória de concorrência" que o SOP descreve como feature separada. Etapa 12 (Memória Resultado) já existe parcialmente no sistema e não é tratada como gap, o que é correto. |
| Consistência | 5 | Nomenclatura consistente ao longo do documento (FR-G{n}-00{n}, NFR-G{n}-00{n}, CON-G{n}-00{n}). Sem contradições entre gaps. Referências cruzadas corretas: G1 usa Central via RadarMatcher, G3 vincula SKU/NCM da Central, G4 agrega por SKU unificado. Schema do FR-G2-001 é compatível com os campos referenciados nos outros gaps. |
| Viabilidade | 5 | Todas as soluções usam vanilla JS + Supabase + localStorage, respeitando o stack existente. Padrão dual-layer (Supabase-first + localStorage fallback) já comprovado no codebase via `_SB_RESULTADOS.upsert()`. Funções RPC no Supabase são viáveis no free tier (SECURITY DEFINER ok). Não introduz frameworks novos. Migration 006 é incremental sobre a 005 existente. |
| Rastreabilidade | 4 | Seção 10 mapeia cada FR para etapas do SOP com citações textuais. Verificado: SOP Etapa 5 menciona "unidade errada (cx vs un)" — FR-G1 cobre. SOP Etapa 7 menciona "repositório único de produtos" — FR-G2 cobre. SOP Etapa 11 menciona "vira contrato automaticamente" — FR-G3 cobre. SOP Etapa 14 menciona "séries por Cidade, Região (SRE), Escola" — FR-G4 cobre. Porém, SOP Etapa 13 ("Memorizar o preço do concorrente que ganhou") está marcada como "Não existe" no mapeamento do SOP mas não tem FR dedicado na spec — é coberta apenas indiretamente pelo campo `concorrente_vencedor` no metadata de G4. Deveria ter rastreabilidade explícita. |
| Clareza | 5 | Mockups ASCII para G1 e G4 eliminam ambiguidade visual. Pontos de inserção no código referenciados com arquivo + linha exata (todos verificados e corretos: `buildSgdPayload()` linha 58, `enviarParaSgd()` linha 120, `salvarResultado()` linha 138, `checarStatusSgd()` linha 220, `criarContratoGdp()` linha 392, `alimentarBancoComResultado()` linha 667). Schema JS e SQL detalhados. Critérios de aceitação testáveis (checkbox format). Um desenvolvedor pode implementar sem perguntas adicionais. |
| Risco | 4 | 7 riscos identificados com probabilidade, impacto e mitigação. Todos relevantes. Faltam 2 riscos: (1) SECURITY DEFINER nas funções RPC de G4 bypassa RLS por design — se a função for chamada sem validação de `p_empresa_id`, retorna dados de outras empresas. A mitigação deveria mencionar que o client DEVE sempre passar `empresa_id` do contexto autenticado. (2) Risco de race condition na criação automática de contrato (G3): se `checarStatusSgd()` e `salvarResultado()` dispararem simultaneamente para o mesmo orçamento, podem tentar criar 2 contratos. A idempotência por `preOrcId` mitiga, mas deveria ser explícita como risco. |

**Score Medio:** 4.5 / 5.0

### Veredito: APPROVED

A especificação atinge o limiar de qualidade (media >= 4.0) para prosseguir para Phase 6 (Implementation Plan). A estrutura é sólida, a rastreabilidade com o SOP é verificável, as referências ao código são precisas (todas as linhas conferidas), e a ordem de implementação (G2 primeiro como fundação) é a decisão correta apesar de G1 ser P0.

### Issues encontradas

**ISS-1 [MINOR]: Etapa 13 do SOP sem cobertura explícita**
- O SOP-GDP-000 lista Etapa 13 (Preco do Ganhador) como "Não existe" no mapeamento (linha 139 do SOP)
- A spec absorve isso parcialmente em G4 via `tipo=perdido` com `metadata.concorrente_vencedor` e `metadata.delta_percent`
- Porém, não há FR dedicado para a funcionalidade de "consultar preço do ganhador de um processo específico" nem view na UI do dashboard de série histórica para análise de concorrência por escola
- **Ação sugerida:** Adicionar FR-G4-008 na próxima revisão, ou registrar como story separada no backlog. Não bloqueia implementação atual.

**ISS-2 [MINOR]: SECURITY DEFINER nas funções RPC**
- As funções `preco_medio_por_municipio()` e `tendencia_preco_mensal()` usam `SECURITY DEFINER` (linhas 677 e 707 da spec)
- Isso bypassa RLS — a segurança depende inteiramente do parâmetro `p_empresa_id` passado pelo client
- Se o client passar um `empresa_id` diferente do autenticado, a função retorna dados de outra empresa
- **Ação sugerida:** Adicionar validação dentro da função: `IF p_empresa_id != current_setting('app.current_empresa_id', true) THEN RAISE EXCEPTION 'unauthorized'; END IF;` — ou usar SECURITY INVOKER e confiar no RLS. Deve ser resolvido na Story X.10.

**ISS-3 [MINOR]: Referência de linha inconsistente para `salvarResultado()`**
- FR-G4-001 tabela referencia `salvarResultado()` em `app-results.js:168` mas a função começa na linha 138 e a linha 168 corresponde ao bloco de salvamento em localStorage
- Embora a linha 168 seja tecnicamente um ponto de inserção válido (após `localStorage.setItem`), seria mais claro referenciar a linha 199 (após `alimentarBancoComResultado()`) para não interferir com a lógica de resultado existente
- **Ação sugerida:** Atualizar referência na implementação. Não bloqueia spec.

**ISS-4 [INFO]: Contrato unificado (`gerarContratoUnificado`) não mencionado**
- O codebase tem `gerarContratoUnificado()` em `app-results.js` (além de `criarContratoGdp()`)
- G3 foca em `criarContratoGdp()` mas não menciona o impacto no fluxo de contrato unificado
- **Ação sugerida:** O @dev deve verificar durante implementação se `gerarContratoUnificado()` também precisa de vinculação com Central. Baixa prioridade.

### Recomendacoes

1. **Priorizar SECURITY INVOKER sobre SECURITY DEFINER** nas funções RPC de G4 (ISS-2). Dado que RLS já está configurado na tabela `preco_historico`, usar SECURITY INVOKER é mais seguro e consistente com o padrão existente. Se performance for concern, medir antes de decidir.

2. **Adicionar teste de idempotência como AC explícito em G3.** O NFR-G3-001 menciona idempotência, mas o AC-5 apenas diz "não duplica para mesmo orçamento". Sugiro um AC mais específico: "Chamada simultânea de `salvarResultado(ganho)` + `checarStatusSgd(APRO)` para o mesmo orçamento resulta em exatamente 1 contrato."

3. **Considerar feature flag para auto-criação de contrato (G3).** Embora o checkbox opt-out cubra o caso, uma feature flag em `localStorage` (`gdp.features.auto-contrato=true|false`) permitiria desabilitar completamente o comportamento em caso de problemas sem deploy.

4. **G4 Story X.11 (Dashboard) pode ser simplificada na Sprint 4.** Se Chart.js não estiver disponível, a implementação pode começar apenas com tabela + KPIs textuais, deixando o gráfico de tendência para uma story futura. Isso reduz risco da Sprint 4 sem perder valor.

5. **Registrar Etapa 13 (Preco do Ganhador) como story separada no backlog** para cobertura completa do SOP. Dados necessários já estarão em `preco_historico` após G4, então a story seria apenas de UI/analytics.

---

*Critique gerada por @qa (Quinn) — Spec Pipeline Phase 5*
*Próxima etapa: @architect implementation plan (Phase 6)*
