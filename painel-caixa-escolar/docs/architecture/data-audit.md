# Auditoria de Dados — LicitIA / Painel Caixa Escolar

**Agente:** @data-engineer (Dara)
**Fase:** Brownfield Discovery - Phase 2
**Data:** 2026-03-09
**Escopo:** Arquitetura de dados, schemas, fluxos, integridade, seguranca e debitos

---

## 1. Visao Geral da Arquitetura de Dados

O sistema utiliza **arquivos JSON flat-file** como camada de persistencia, sem banco de dados relacional ou NoSQL. Os dados sao coletados da API REST governamental **SGD Caixa Escolar MG** e armazenados localmente para servir um dashboard Express.js.

### Modelo de Armazenamento

```
squads/caixa-escolar/
  dashboard/data/          ← Diretorio principal de dados (13 arquivos JSON)
  data/                    ← Dados auxiliares do fornecedor (1 arquivo JSON)
  .env                     ← Credenciais (SGD + Tiny API)
  server.js                ← Express server (coleta, armazena, serve)
  sgd-client.js            ← Cliente REST para API SGD
```

### Diagrama de Fluxo de Dados

```
SGD API (gov)         Olist/Tiny ERP         CatalogoMobile
     |                      ^                      |
     v                      |                      |
[collect-sgd-orcamentos.js] |            [lariucci-arp-2025.json]
     |                      |                      |
     v                      |                      v
[orcamentos.json]    [olist-adapter.js]    [banco-precos.json]
[quotes.json]              ^                       |
     |                     |                       v
     v                     |               [Dashboard HTML]
[server.js] ──────> [POST /api/sgd/submit] ──> SGD API
                    [POST /api/olist/order] ──> Tiny ERP
                    [POST /api/sgd/scan]   ──> orcamentos.json
```

---

## 2. Inventario de Entidades (Schemas JSON)

### 2.1 `escolas-credentials.json` — Credenciais de Escolas

| Campo | Tipo | Descricao | Exemplo |
|-------|------|-----------|---------|
| `escolas[].id` | string | Slug identificador | `"alceu-novaes"` |
| `escolas[].nome` | string | Nome abreviado | `"E.E. Alceu Novaes"` |
| `escolas[].nome_completo` | string | Nome completo oficial | `"Escola Estadual Alceu Novaes"` |
| `escolas[].cnpj` | string | CNPJ da caixa escolar | `"21.345.678/0001-01"` |
| `escolas[].sre` | string | Superintendencia Regional | `"SRE Metropolitana A"` |
| `escolas[].municipio` | string | Cidade | `"Belo Horizonte"` |
| `escolas[].login` | string | **Login SGD** | `"alceu.novaes"` |
| `escolas[].senha` | string | **Senha SGD em texto plano** | `"escola2025"` |
| `escolas[].responsavel` | string | Nome do presidente | `"Maria Helena de Souza"` |
| `escolas[].cargo` | string | Cargo | `"Presidente da Caixa Escolar"` |
| `escolas[].telefone` | string | Telefone | `"(31) 3333-1001"` |
| `escolas[].email` | string | Email institucional | `"caixa.alceunovaes@edu.mg.gov.br"` |
| `escolas[].categoria_catalogo` | string | Categoria no CatalogoMobile | Nome longo |
| `escolas[].arp_vinculada` | string | ARP vinculada | `"ARP-LARIUCCI-2025"` |
| `escolas[].saldo_disponivel` | number | Saldo disponivel R$ | `45230.00` |
| `escolas[].saldo_total` | number | Saldo total R$ | `120000.00` |
| `admin.login` | string | Login admin | `"admin"` |
| `admin.senha` | string | **Senha admin em texto plano** | `"gdp2025"` |

**Volume:** 5 escolas + 1 admin
**Chave primaria:** `escolas[].id` (slug)
**Riscos:** CRITICO - senhas em texto plano, PII exposta (nomes, telefones, emails, CNPJs)

---

### 2.2 `orcamentos.json` — Orcamentos SGD (Entidade Principal)

| Campo | Tipo | Descricao | Exemplo |
|-------|------|-----------|---------|
| `[].id` | string | ID do orcamento SGD | `"2026004143"` |
| `[].idBudget` | number | ID interno SGD | `153529` |
| `[].escola` | string | Nome da escola | `"EE JOAQUIM TIAGO..."` |
| `[].municipio` | string | Municipio | `"Iturama"` |
| `[].sre` | string | SRE | `"SRE Uberaba"` |
| `[].confiancaTerritorio` | string | Nivel confianca geo | `"alta"` |
| `[].objeto` | string | Tipo de despesa | `"Premio SAEB"` |
| `[].confiancaObjeto` | string | Nivel confianca objeto | `"alta"` |
| `[].prazo` | string (date) | Data limite proposta | `"2026-03-04"` |
| `[].diasRestantes` | number | Dias ate prazo | `1` |
| `[].status` | string | Status calculado | `"prazo_critico"` / `"aberto"` |
| `[].custoEstimado` | number | Custo estimado R$ | `12993` |
| `[].precoSugerido` | number | Preco sugerido R$ | `15851.46` |
| `[].expenseGroupId` | number | ID grupo despesa SGD | `3626` |
| `[].idSchool` | number | ID escola SGD | `10957` |
| `[].idSubprogram` | number | ID subprograma SGD | `695` |
| `[].year` | string | Ano fiscal | `"2026"` |

**Volume atual:** 0 registros (array vazio — dados foram limpos apos ultima coleta)
**Volume tipico:** 40-60 orcamentos por varredura
**Chave primaria:** `[].id` (nuBudgetOrder do SGD)
**Relacionamentos:** Liga com `sre-uberaba.json` via escola/municipio; com `banco-precos.json` via objeto/grupo

---

### 2.3 `quotes.json` — Cotacoes (Formato Legado)

Mesmo schema do `orcamentos.json`, porem gerado pelo script `collect-sgd-orcamentos.js` (via Playwright). Funciona como snapshot complementar.

**Volume atual:** 60 registros
**Chave primaria:** `[].id`
**Relacao:** Espelho de `orcamentos.json` com campos adicionais de confianca

---

### 2.4 `lariucci-arp-2025.json` — Catalogo ARP (Ata de Registro de Precos)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `arp.identificacao` | string | ID da ARP |
| `arp.fornecedor.razao_social` | string | Razao social |
| `arp.fornecedor.email_pedidos` | string | Email para pedidos |
| `arp.fornecedor.email_comercial` | string | Email comercial |
| `arp.fornecedor.catalogo_id` | number | ID no CatalogoMobile |
| `arp.vigencia.inicio` | string (date) | Inicio vigencia |
| `arp.vigencia.fim` | string (date) | Fim vigencia |
| `arp.vigencia.status` | string | Status vigencia |
| `arp.total_escolas` | number | Total de escolas |
| `arp.total_itens` | number | Total de itens |
| `escolas[].id` | string | Slug da escola |
| `escolas[].nome` | string | Nome no catalogo |
| `escolas[].categoria_id` | number | ID categoria CatalogoMobile |
| `escolas[].total_itens` | number | Qtd produtos |
| `escolas[].produtos[].item` | number | Numero sequencial |
| `escolas[].produtos[].produto` | string | Nome do produto |
| `escolas[].produtos[].preco` | number | Preco unitario R$ |
| `escolas[].produtos[].estoque` | number | Estoque disponivel |

**Volume:** 32 escolas, 343 itens totais (media 10.7 itens/escola)
**Chave primaria:** `escolas[].id` + `produtos[].item`
**Peso:** 34 KB

---

### 2.5 `banco-precos.json` — Banco de Precos de Referencia

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `updatedAt` | string (date) | Ultima atualizacao |
| `itens[].id` | string | ID unico | `"bp-001"` |
| `itens[].grupo` | string | Grupo de produto |
| `itens[].item` | string | Descricao do item |
| `itens[].unidade` | string | Unidade de medida |
| `itens[].custoBase` | number | Custo base R$ |
| `itens[].margemPadrao` | number | Margem padrao (0-1) |
| `itens[].precoReferencia` | number | Preco de referencia R$ |
| `itens[].ultimaCotacao` | string (date) | Data ultima cotacao |
| `itens[].fonte` | string | Fonte do preco |

**Volume:** 12 itens
**Chave primaria:** `itens[].id`
**Peso:** 3.7 KB

---

### 2.6 `olist-orders.json` — Pedidos Sincronizados (Olist/Tiny)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `[].olistOrderId` | string | ID gerado (mock ou Tiny) |
| `[].idempotencyKey` | string | Chave de idempotencia |
| `[].syncedAt` | string (ISO) | Timestamp sincronizacao |
| `[].payload.external_order_id` | string | ID do pedido interno |
| `[].payload.order_date` | string (ISO) | Data do pedido |
| `[].payload.customer.school_name` | string | Escola |
| `[].payload.customer.city` | string | Cidade |
| `[].payload.items[]` | array | Itens do pedido |
| `[].payload.totals.total_value` | number | Valor total R$ |
| `[].payload.metadata.source` | string | Origem do pedido |
| `[].payload.metadata.contract_ref` | string | Referencia ARP |

**Volume:** 2 registros (fase de teste)
**Chave primaria:** `[].idempotencyKey`
**Deduplicacao:** Sim, via `idempotencyKey` no `olist-adapter.js`

---

### 2.7 `sre-uberaba.json` — Escolas da SRE Uberaba

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `sre` | string | Nome da SRE |
| `fonte` | string | URL da fonte |
| `atualizadoEm` | string (date) | Data atualizacao |
| `totalMunicipios` | number | Total municipios |
| `totalEscolas` | number | Total escolas |
| `municipios[].nome` | string | Nome do municipio |
| `municipios[].escolas[]` | string[] | Lista de escolas |

**Volume:** 25 municipios, 92 escolas
**Uso:** Filtro territorial — scan SGD restringe a SRE Uberaba

---

### 2.8 `perfil.json` — Perfil do Fornecedor (Dashboard)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `fornecedor.razao_social` | string | Razao social |
| `fornecedor.nome_fantasia` | string | Nome fantasia |
| `fornecedor.cnpj` | string | CNPJ |
| `fornecedor.municipio` | string | Cidade sede |
| `fornecedor.uf` | string | UF |
| `fornecedor.cnae_primario` | string | CNAE primario |
| `atuacao.sres_full` | object | SREs com atendimento completo |
| `atuacao.demais_sres` | object | Demais SREs (escopo reduzido) |
| `atuacao.exclusoes_globais` | string[] | Grupos nao atendidos |

---

### 2.9 `perfil-fornecedor.json` — Perfil Fornecedor (Config Servidor)

| Campo | Tipo | Descricao |
|-------|------|-----------|
| `fornecedor.*` | object | Dados cadastrais |
| `config.margemPadrao` | number | Margem padrao (0.30) |
| `config.fretePadraoKm` | number | Custo frete/km (1.20) |
| `config.srePrincipal` | string | SRE principal |
| `config.gruposAtendidos` | string[] | Grupos que atende |
| `config.gruposExcluidos` | string[] | Grupos excluidos |
| `distancias.estimativas` | object | Mapa municipio->km |

---

### 2.10 Arquivos de Metadados e Log

| Arquivo | Descricao | Volume |
|---------|-----------|--------|
| `sgd-collect-meta.json` | Metadata da ultima coleta | 1 registro |
| `sgd-scan-log.json` | Log da ultima varredura | 1 registro |
| `sgd-prequote-payload.json` | Payload de pre-cotacao gerado | 1 proposta, 3 itens |
| `sgd-prequote-submit-report.json` | Resultado do envio ao SGD | 1 registro |
| `pre-orcamentos.json` | Pre-orcamentos (vazio) | `[]` |

---

## 3. Fluxos de Dados (ETL)

### 3.1 Fluxo de Coleta SGD (Principal)

| Etapa | Componente | Entrada | Saida |
|-------|-----------|---------|-------|
| 1. Autenticacao | `sgd-client.js` / Playwright | `.env` (CNPJ + senha) | Session cookie |
| 2. Varredura | `server.js::executeSgdScan()` | API `/budget-proposal/summary-by-supplier-profile` | Lista de budgets |
| 3. Filtragem | `server.js` | `sre-uberaba.json` | Budgets SRE Uberaba |
| 4. Enriquecimento | `server.js` | API `/budget/by-subprogram/...` + `/budget-item/...` | Detalhes + itens |
| 5. Merge | `server.js` | `orcamentos.json` existente | `orcamentos.json` atualizado |
| 6. Log | `server.js` | Estatisticas | `sgd-scan-log.json` |

**Trigger:** Cron diario as 20h + endpoint manual `POST /api/sgd/scan`

### 3.2 Fluxo de Coleta via Playwright (Script Avulso)

| Etapa | Componente | Descricao |
|-------|-----------|-----------|
| 1. Login | `collect-sgd-orcamentos.js` | Login via browser headless |
| 2. Municipios | API `/county/by-network` | Mapeia SRE Uberaba |
| 3. Grupos despesa | API `/expense-group/active` | 23 grupos de referencia |
| 4. Propostas | API por municipio, paginado | Coleta "Nao Enviada" |
| 5. Detalhes | API por budget | Enriquece cada orcamento |
| 6. Output | Dual | `orcamentos.json` + `quotes.json` |

### 3.3 Fluxo de Envio de Proposta ao SGD

```
Dashboard (usuario) → POST /api/sgd/submit
  → Login SGD
  → getBudgetDetail (extrair idAxis)
  → getBudgetItems (mapear idBudgetItem por fuzzy match)
  → sendProposal (enviar ao SGD)
  → Salvar sgd-prequote-submit-report.json
```

### 3.4 Fluxo de Sincronizacao com Olist/Tiny ERP

```
Dashboard (pedido confirmado) → POST /api/olist/order
  → olist-adapter.js::sendToOlist()
     → Modo "mock": Salva em olist-orders.json (dedup por idempotencyKey)
     → Modo "tiny_api": Envia para Tiny API2 (form-encoded)
     → Modo "webhook": Envia para webhook URL
     → Modo "tiny_api_rest": Envia para Tiny API REST (JSON)
  → Retorna olistOrderId
```

### 3.5 Fluxo de Sync em Lote (sync-sgd-orders-olist.js)

```
internal-orders.json → Valida (workflowStatus=APROVADO_PARA_FATURAMENTO)
  → Fila com retry (max 5 tentativas, backoff exponencial)
  → Envia via olist-adapter.js
  → Persiste: sync-queue.json, order-sync-map.json, sync-status.json, order-sync-log.json
```

---

## 4. Analise de Integridade de Dados

### 4.1 Validacao

| Aspecto | Status | Detalhes |
|---------|--------|----------|
| Validacao de input na API | PARCIAL | `POST /api/sgd/submit` valida campos obrigatorios; `POST /api/olist/order` valida orderId, school, items |
| Validacao de tipos | AUSENTE | Nenhum schema validation (JSON Schema, Zod, etc.) |
| Validacao de negocios | PARCIAL | `sync-sgd-orders-olist.js` valida `workflowStatus === "APROVADO_PARA_FATURAMENTO"` |
| Sanitizacao de input | AUSENTE | Nenhuma sanitizacao de HTML/XSS nos dados |

### 4.2 Deduplicacao

| Fluxo | Mecanismo | Eficacia |
|-------|-----------|----------|
| Olist orders (mock) | `idempotencyKey` no array | BOA - previne duplicatas |
| Olist orders (API) | Header `Idempotency-Key` | BOA - depende do provider |
| SGD scan merge | `existingMap` por `id` | BOA - merge com preservacao de status local |
| Coleta Playwright | Sobrescrita completa | RUIM - perde historico |

### 4.3 Consistencia Referencial

| Relacao | Mecanismo | Status |
|---------|-----------|--------|
| `escolas-credentials.id` ↔ `lariucci-arp-2025.escolas[].id` | Slug manual | FRAGIL - nenhuma constraint |
| `orcamentos[].municipio` ↔ `sre-uberaba.municipios[].nome` | Normalizacao NFD | BOA |
| `quotes[].expenseGroupId` ↔ API expense-group | Nearest-match | FRAGIL - threshold de 30 pode falhar |
| `olist-orders[].payload.contract_ref` ↔ `lariucci-arp-2025.arp.identificacao` | String manual | FRAGIL |

### 4.4 Constraints Ausentes

- Sem tipo forte (tudo e `any` implicitamente)
- Sem constraints de unicidade enforcadas
- Sem foreign keys
- Sem validacao de ranges (precos negativos, datas invalidas passam)
- Sem versionamento de registros (nao ha `updatedAt` nos orcamentos)

---

## 5. Analise de Volume e Escalabilidade

### 5.1 Volumes Atuais

| Arquivo | Registros | Tamanho | Tendencia |
|---------|-----------|---------|-----------|
| `lariucci-arp-2025.json` | 32 escolas / 343 produtos | 34 KB | Estavel (anual) |
| `quotes.json` | 60 orcamentos | 30 KB | Cresce ~60/scan |
| `sre-uberaba.json` | 92 escolas | 5.2 KB | Estavel |
| `escolas-credentials.json` | 5 escolas | 3.3 KB | Cresce lentamente |
| `olist-orders.json` | 2 pedidos | 1.5 KB | Cresce ~10-50/dia |
| `banco-precos.json` | 12 itens | 3.8 KB | Estavel |
| **Total** | - | **~80 KB** | - |

### 5.2 Projecoes de Crescimento

| Cenario | Volume Estimado | Impacto |
|---------|----------------|---------|
| 1 ano operacao (olist-orders) | ~3.650 pedidos / ~2.5 MB | Sem impacto |
| 10 SREs (orcamentos) | ~600 orcamentos / ~300 KB | Scan lento (API sequencial) |
| 100 escolas (credentials) | 100 registros / ~65 KB | Sem impacto tecnico |
| Historico acumulado (quotes) | ~22.000/ano / ~11 MB | Leitura lenta, busca O(n) |

### 5.3 Gargalos Identificados

| Gargalo | Severidade | Descricao |
|---------|-----------|-----------|
| Leitura sincrona (`readFileSync`) | MEDIA | Bloqueia event loop em arquivos grandes |
| Busca linear em arrays | MEDIA | Sem indice — O(n) para cada lookup |
| Scan SGD sequencial | ALTA | Cada orcamento faz 2 chamadas API (detail + items) — ~120 requests para 60 budgets |
| Sem paginacao local | BAIXA | Dashboard carrega JSON completo |
| Escrita atomica ausente | ALTA | `writeFileSync` pode corromper JSON em crash |

---

## 6. Auditoria de Seguranca

### 6.1 Credenciais Expostas

| Arquivo | Dado Sensivel | Severidade | Status |
|---------|--------------|-----------|--------|
| `.env` | `SGD_CNPJ` (CNPJ real) | ALTA | Em `.gitignore` |
| `.env` | `SGD_PASS` (senha real SGD) | **CRITICA** | Em `.gitignore` |
| `.env` | `TINY_API_TOKEN` (token API producao) | **CRITICA** | Em `.gitignore` |
| `.env.example` | `SGD_CNPJ` (CNPJ real hardcoded) | ALTA | **COMMITADO** |
| `escolas-credentials.json` | Senhas em texto plano de 5 escolas | **CRITICA** | **COMMITADO no repositorio** |
| `escolas-credentials.json` | Login admin `"gdp2025"` | **CRITICA** | **COMMITADO no repositorio** |
| `auth.js` | Hash SHA-256 + senha comentada `"lariucci2026"` | **CRITICA** | **COMMITADO, senha no comentario** |

### 6.2 PII (Dados Pessoais Identificaveis)

| Arquivo | Dados PII | LGPD |
|---------|----------|------|
| `escolas-credentials.json` | Nomes de responsaveis, telefones, emails, CNPJs | Requer consentimento |
| `lariucci-arp-2025.json` | Emails comerciais pessoais | Requer consentimento |
| `perfil.json` / `perfil-fornecedor.json` | CNPJ, razao social | Dados publicos (CNPJ) |

### 6.3 Autenticacao

| Componente | Mecanismo | Avaliacao |
|-----------|-----------|-----------|
| Dashboard login | SHA-256 client-side | **INSEGURO** — hash no codigo-fonte, sem server-side validation |
| SGD API | Session cookie (24h) | ADEQUADO para API governamental |
| Tiny API | Bearer token | ADEQUADO |
| Express server | **NENHUM** | **CRITICO** — APIs `/api/*` sem autenticacao |

### 6.4 Comunicacao

| Canal | Protocolo | Status |
|-------|-----------|--------|
| SGD API | HTTPS | OK |
| Tiny API | HTTPS | OK |
| Dashboard local | HTTP (localhost) | ACEITAVEL para dev |

---

## 7. Debitos Identificados

### 7.1 Severidade CRITICA

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| D-01 | **Senhas em texto plano em `escolas-credentials.json`** commitado no repositorio | Acesso nao autorizado a contas de escolas no SGD | 2h - migrar para `.env` ou vault, remover do historico git |
| D-02 | **Senha do dashboard no comentario de `auth.js`** (`lariucci2026`) | Qualquer pessoa com acesso ao codigo entra no dashboard | 1h - remover comentario, implementar auth server-side |
| D-03 | **APIs Express sem autenticacao** (`/api/sgd/submit`, `/api/olist/order`, `/api/sgd/scan`) | Qualquer cliente na rede pode enviar propostas ao SGD ou pedidos ao Tiny | 4h - adicionar middleware de autenticacao |
| D-04 | **CNPJ real no `.env.example`** commitado | Exposicao de dado cadastral | 0.5h - substituir por placeholder |

### 7.2 Severidade ALTA

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| D-05 | **Sem backup automatico dos JSON files** | Perda de dados em falha de disco ou corrupcao | 4h - implementar backup rotativo |
| D-06 | **Escrita nao-atomica (`writeFileSync`)** — crash durante escrita corrompe arquivo | Perda total do arquivo de orcamentos | 3h - write-to-temp + rename atomico |
| D-07 | **Nenhuma validacao de schema** nos dados recebidos/escritos | Dados malformados propagam silenciosamente | 8h - adicionar Zod/JSON Schema em todos os pontos de entrada |
| D-08 | **Scan SGD sequencial** — 2 requests/orcamento sem paralelismo | Scan de 60 orcamentos leva ~5-10 min | 4h - implementar paralelismo com rate limiting |
| D-09 | **Fuzzy match de itens no submit** (`includes` bidirecional + fallback por indice) | Mapeamento incorreto de itens pode enviar precos errados ao SGD | 6h - implementar matching deterministico por `idBudgetItem` |

### 7.3 Severidade MEDIA

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| D-10 | **Sem versionamento de dados** — nenhum `updatedAt`, nenhum changelog | Impossivel auditar alteracoes em orcamentos | 4h - adicionar timestamps + log de mudancas |
| D-11 | **`readFileSync` sincrono** bloqueia event loop | Degrada performance sob carga | 2h - migrar para `fs.promises` |
| D-12 | **Dois mecanismos de coleta duplicados** (`collect-sgd-orcamentos.js` via Playwright + `executeSgdScan()` via REST) | Confusao operacional, dados inconsistentes entre `orcamentos.json` e `quotes.json` | 8h - unificar em um unico pipeline |
| D-13 | **Estimativa de custo baseada em hash do idBudget** (`4000 + ((idBudget % 1000) * 17)`) | Precos sugeridos sao ficticios, sem base real | 6h - integrar com banco-precos.json para estimativas reais |
| D-14 | **Nearest-match para expense groups** (threshold 30) | Pode mapear grupo de despesa errado em redes diferentes | 3h - cache local de grupos por rede |
| D-15 | **Sem paginacao no dashboard** — carrega JSON inteiro | Problemas com >500 orcamentos | 4h - implementar paginacao server-side |

### 7.4 Severidade BAIXA

| ID | Debito | Impacto | Esforco |
|----|--------|---------|---------|
| D-16 | **Dados de ARP hardcoded** em JSON estatico (`lariucci-arp-2025.json`) | Requer atualizacao manual a cada mudanca de ARP | 8h - implementar scraping do CatalogoMobile |
| D-17 | **Sem indices ou cache** para buscas frequentes | Performance O(n) em arrays | 2h - manter Map em memoria |
| D-18 | **Log rotativo apenas no sync** (cap 1000 entries) — demais logs nao tem rotacao | Crescimento ilimitado de `quotes.json` historico | 2h - adicionar rotacao/archiving |

---

## 8. Recomendacoes

### Curto Prazo (Sprint 1-2) — Seguranca

1. **Remover `escolas-credentials.json` do repositorio** e migrar credenciais para `.env` ou secret manager. Executar `git filter-branch` para limpar historico.
2. **Remover comentario com senha de `auth.js`** e implementar autenticacao server-side com JWT ou session.
3. **Adicionar middleware de autenticacao** nas rotas `/api/*` do Express.
4. **Substituir CNPJ real** no `.env.example` por placeholder.

### Medio Prazo (Sprint 3-4) — Integridade

5. **Implementar escrita atomica** (write-to-temp + `fs.renameSync`).
6. **Adicionar validacao de schema** com Zod nas entradas de dados (API requests e JSON reads).
7. **Unificar pipelines de coleta** — eliminar dualidade Playwright/REST.
8. **Substituir fuzzy match** no submit por mapeamento deterministico com `idBudgetItem`.

### Longo Prazo (Sprint 5+) — Escalabilidade

9. **Migrar para SQLite** como camada de persistencia — mantem simplicidade flat-file mas ganha indices, transactions e queries.
10. **Implementar backup rotativo** com timestamped snapshots.
11. **Paralelizar scan SGD** com pool de requests (max 5 concorrentes).
12. **Adicionar observabilidade** — structured logging, metricas de scan, alertas de falha.

---

## Apendice A — Mapa de Relacionamentos

```
escolas-credentials.json
  |-- [id] ──→ lariucci-arp-2025.json [escolas[].id]
  |-- [arp_vinculada] ──→ lariucci-arp-2025.json [arp.identificacao]
  |-- [cnpj] ──→ (externo) SGD Caixa Escolar

sre-uberaba.json
  |-- [municipios[].escolas[]] ──→ orcamentos.json [escola] (fuzzy via NFD normalize)
  |-- [municipios[].nome] ──→ perfil-fornecedor.json [distancias.estimativas]

orcamentos.json
  |-- [expenseGroupId] ──→ (externo) SGD API /expense-group/
  |-- [idSchool, idSubprogram, idBudget] ──→ (externo) SGD API endpoints
  |-- [municipio] ──→ sre-uberaba.json [municipios[].nome]

olist-orders.json
  |-- [payload.metadata.contract_ref] ──→ lariucci-arp-2025.json [arp.identificacao]
  |-- [idempotencyKey] ──→ (autocontido, chave de deduplicacao)

banco-precos.json
  |-- [itens[].grupo] ──→ orcamentos.json [objeto] (match manual)
```

## Apendice B — Endpoints SGD Consumidos

| Endpoint | Metodo | Uso |
|----------|--------|-----|
| `/auth/login` | POST | Autenticacao (CNPJ + senha) |
| `/auth/user` | GET | Dados do usuario + networkId |
| `/budget-proposal/summary-by-supplier-profile` | GET | Lista de orcamentos (paginado, filtrado) |
| `/budget/by-subprogram/{id}/by-school/{id}/by-budget/{id}` | GET | Detalhe do orcamento |
| `/budget-item/by-subprogram/{id}/by-school/{id}/by-budget/{id}` | GET | Itens do orcamento |
| `/budget-proposal/send-proposal/by-subprogram/{id}/by-school/{id}/by-budget/{id}` | POST | Envio de proposta |
| `/county/by-network` | GET | Lista de municipios |
| `/expense-group/active` | GET | Grupos de despesa ativos |
