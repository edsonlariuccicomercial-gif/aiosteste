# SOP-GDP-CONTRATOS-PIPELINE

## Procedimento Operacional Padrão — Pipeline de Contratos GDP

| Campo | Valor |
|-------|-------|
| **ID** | SOP-GDP-001 |
| **Versão** | 1.0.0 |
| **Status** | DRAFT — Pendente validação |
| **Extraído por** | Ohno (SOP Extractor) |
| **Data extração** | 2026-03-18 |
| **Criticidade** | ALTA — Impacto fiscal (NF-e) |
| **Frequência** | Diária (múltiplos contratos/semana) |
| **Sistemas envolvidos** | GDP Contratos (frontend), Tiny ERP (API), Supabase (cloud sync), SGD-MG (licitações) |

---

## 1. RESUMO DO PROCESSO

Pipeline de 5 fases que transforma um Mapa de Apuração de licitação em pedidos de compra com Nota Fiscal eletrônica (NF-e) emitida via Tiny ERP.

**Trigger:** Upload de arquivo Mapa de Apuração (Word/Excel/PDF) na aba Contratos do GDP.

**Resultado esperado:** Pedido registrado no Tiny ERP com SKU, NCM e unidade corretos, pronto para emissão de NF-e.

---

## 2. ATORES E SISTEMAS

| Ator/Sistema | Papel | Autenticação |
|-------------|-------|--------------|
| **Operador GDP** | Importa mapa, seleciona fornecedor, cria contrato, dispara pedidos | Login dashboard |
| **GDP Contratos** (frontend) | UI principal — `gdp-contratos.html` | localStorage + Supabase |
| **Tiny ERP** (API externa) | Master de produtos, emissão de pedidos e NF-e | `TINY_API_TOKEN` (env var) |
| **Supabase** | Cloud sync de contratos, pedidos, produtos | `SUPABASE_ANON_KEY` |
| **Banco de Produtos** | Cache local de produtos (`gdp.produtos.v1`) | localStorage |
| **API NCM/AI** | Classificação fiscal automática | `OPENAI_API_KEY` |

---

## 3. SEQUÊNCIA DE PASSOS

### FASE 1 — IMPORTAÇÃO DO MAPA
**Arquivo:** `gdp-contratos.html` (upload zone)

| # | Passo | Confiança | Evidência |
|---|-------|-----------|-----------|
| 1.1 | Operador faz upload do Mapa de Apuração (.docx, .xlsx ou .pdf) | ● 1.0 | Código: `handleFileUpload()` |
| 1.2 | Sistema parseia o arquivo extraindo: descrição, unidade, quantidade, preços por fornecedor | ● 1.0 | Código: `parseDocx/parseExcel/parsePdf` |
| 1.3 | Preview exibido com grid de fornecedores e itens ganhos | ● 1.0 | HTML: `#import-preview` |
| 1.4 | Operador seleciona fornecedor vencedor (clique no card) | ● 1.0 | Código: `supplier-grid onclick` |
| 1.5 | Sistema filtra itens ganhos pelo fornecedor selecionado | ● 1.0 | Código: `wonItems = items.filter(...)` |

**⚠ PONTO DE FALHA:** Nenhuma validação de unidade nesta fase. A unidade vem do mapa "crua" (ex: "Quilograma", "FARDO", "Pcte com 8un") sem normalização.

---

### FASE 2 — CRIAÇÃO DO CONTRATO
**Arquivo:** `gdp-contratos.html:1545` → `criarContrato()`

| # | Passo | Confiança | Evidência |
|---|-------|-----------|-----------|
| 2.1 | Gera ID do contrato: `CTR-YYYYMMDD-XXXX` | ● 1.0 | Código: linha 1557 |
| 2.2 | Cria objeto contrato com itens (descrição, unidade, qtd, preço, NCM) | ● 1.0 | Código: linhas 1559-1584 |
| 2.3 | NCM preenchido via `findNcmLocal()` (mapa de keywords local) | ● 1.0 | Código: linha 1569 |
| 2.4 | Salva no localStorage + Supabase cloud sync | ● 1.0 | Código: `saveContratos()` |
| 2.5 | **DISPARA `autoCadastrarTiny(contratoId)` em background** | ● 1.0 | Código: linha 1591 |
| 2.6 | Dispara `classificarNcmIA()` para itens sem NCM no mapa | ● 1.0 | Código: linha 1592 |
| 2.7 | Alimenta banco de preços com dados de concorrentes | ● 1.0 | Código: `alimentarBancoConcorrentes()` |

**🔴 FALHA CRÍTICA #1 — Sem reconciliação com banco de produtos existente:**
- Itens entram com descrição do MAPA (ex: "ARROZ TIPO 1 PACOTE DE 5KG")
- Tiny pode ter produto cadastrado como "ARROZ T1 5KG" com SKU diferente
- **Não existe comparação de similaridade neste ponto**
- Story 4.16 (Draft) pretende resolver isso, mas NÃO está implementada

---

### FASE 3 — AUTO-CADASTRO NO TINY ERP
**Arquivo:** `gdp-contratos.html:4822` → `autoCadastrarTiny()`
**API:** `api/tiny-produtos.js`

| # | Passo | Confiança | Evidência |
|---|-------|-----------|-----------|
| 3.1 | Para cada item do contrato, monta payload com: num, descrição, unidade, preço, NCM, SKU | ● 1.0 | Código: linhas 4828-4837 |
| 3.2 | Envia POST para `/api/tiny-produtos` com `action: "cadastrar"` | ● 1.0 | Código: linha 4840 |
| 3.3 | API faz pre-check: busca por SKU existente no Tiny (3 páginas) | ● 1.0 | Código: `tiny-produtos.js:319-337` |
| 3.4 | Se item SEM SKU → `searchTinyProduct()` busca por nome no Tiny | ● 1.0 | Código: `tiny-produtos.js:347-354` |
| 3.5 | Se encontrado → retorna SKU, NCM, unidade existentes (status: "existente") | ● 1.0 | Código: `tiny-produtos.js:350` |
| 3.6 | Se NÃO encontrado → gera SKU numérico, cria produto no Tiny via `produto.incluir.php` | ● 1.0 | Código: `tiny-produtos.js:356-418` |
| 3.7 | Rate limit: 4 segundos entre chamadas de criação, 1.5s entre buscas | ● 1.0 | Código: linhas 335, 416 |
| 3.8 | Resultado volta ao frontend: atualiza SKU no contrato + adiciona ao banco de produtos | ● 1.0 | Código: linhas 4847-4864 |

**🔴 FALHA CRÍTICA #2 — Busca por nome é frágil:**
- `searchTinyProduct()` extrai apenas 1-2 palavras >3 chars da descrição
- Scoring por overlap de palavras: `bestScore >= 1` aceita match com UMA ÚNICA palavra
- "DETERGENTE LÍQUIDO 500ML NEUTRO" pode casar com "DETERGENTE INDUSTRIAL 5L" (1 palavra match)
- **Falso positivo → item recebe SKU errado → NF-e com produto errado**

**🔴 FALHA CRÍTICA #3 — Unidade pode ser sobrescrita:**
- Se `searchTinyProduct()` retorna unidade do Tiny (ex: "KG"), ela sobrescreve a do mapa
- Mas se Tiny não retorna unidade (campo vazio no `produtos.pesquisa.php`), usa a do mapa SEM normalizar
- Na linha 4854: `if (r.unidade) item.unidade = r.unidade;` — aceita qualquer string sem validar

---

### FASE 4 — CRIAÇÃO DO PEDIDO
**Arquivo:** `gdp-contratos.html:4913` → `enviarPedidoOlist()`
**API:** `api/olist/order.js`

| # | Passo | Confiança | Evidência |
|---|-------|-----------|-----------|
| 4.1 | Operador seleciona pedido(s) na aba Pedidos | ● 1.0 | UI: checkboxes |
| 4.2 | Frontend resolve SKU em cadeia: Contrato → Pedido → Banco de Produtos | ● 1.0 | Código: linhas 4921-4927 |
| 4.3 | Frontend resolve unidade em cadeia: Contrato → Pedido → Banco de Produtos → fallback "UN" | ● 1.0 | Código: linhas 4929-4939 |
| 4.4 | Detecção de inconsistência: alerta se unidade="UN" mas descrição sugere outra (KG, LT, etc.) | ● 1.0 | Código: linhas 4952-4960 |
| 4.5 | POST para `/api/olist/order` com items, school, cliente | ● 1.0 | Código: linhas 4962-4976 |
| 4.6 | **order.js Step 1:** Se item sem SKU → busca no Tiny novamente | ● 1.0 | Código: `order.js:437-487` |
| 4.7 | **order.js Step 1:** Se item TEM SKU (guard Story 4.15) → skip busca, usa como está | ● 1.0 | Código: `order.js:446-448` |
| 4.8 | **order.js Step 2:** `buildTinyPayload()` normaliza unidade via `normalizeUnit()` | ● 1.0 | Código: `order.js:340` |
| 4.9 | POST para Tiny `pedido.incluir.php` com payload completo | ● 1.0 | Código: `order.js:489-537` |
| 4.10 | Retorna `olistOrderId` e alertas NCM (se houver) | ● 1.0 | Código: `order.js:532-536` |

**🔴 FALHA CRÍTICA #4 — Resolução por descrição exata (case-insensitive) falha:**
- Linha 4925: `bpMatch = bpItens.find(bp => bp.descricao.toUpperCase().trim() === descNorm)`
- Match é **EXATO** — "ARROZ TIPO 1 5KG" ≠ "ARROZ T1 5KG" → não encontra
- Resultado: SKU vazio → order.js gera SKU aleatório → produto duplicado no Tiny

**🔴 FALHA CRÍTICA #5 — Normalização de unidade incompleta:**
- `normalizeUnit()` cobre ~30 unidades, mas Tiny aceita mais (ex: "SACHÊ", "TABLETE", "DOSE")
- Se unidade desconhecida → trunca para 3 chars → pode gerar código inválido no Tiny
- Exemplo: "TABLETES" → "TAB" (pode não existir no Tiny)

---

### FASE 5 — EMISSÃO DE NF-e
**Sistema:** Tiny ERP (externo, fora do controle do código)

| # | Passo | Confiança | Evidência |
|---|-------|-----------|-----------|
| 5.1 | Tiny gera NF-e automaticamente a partir do pedido | ◕ 0.8 | Reportado — fluxo externo ao código |
| 5.2 | NF-e usa: unidade, NCM, quantidade, valor do pedido | ◕ 0.8 | Reportado — regra fiscal brasileira |
| 5.3 | Se unidade errada → NF-e emitida com dados incorretos | ◕ 0.8 | Reportado — causa do problema original |
| 5.4 | Se NCM errado → classificação fiscal incorreta → multa potencial | ◑ 0.5 | Inferido — risco fiscal |

**⚠ CONSEQUÊNCIA FISCAL:** NF-e com unidade "UN" quando deveria ser "KG" é irregularidade fiscal. Risco de autuação pela SEFAZ-MG.

---

## 4. PONTOS DE DECISÃO

| # | Decisão | Condição | Caminho A | Caminho B | Confiança |
|---|---------|----------|-----------|-----------|-----------|
| D1 | Produto existe no Tiny? | `searchTinyProduct()` retorna resultado | Usa SKU/unidade existentes | Gera SKU novo, cria produto | ● 1.0 |
| D2 | Item já tem SKU no contrato? | `item.sku` existe e não-vazio | Skip busca Tiny (guard 4.15) | Busca no Tiny | ● 1.0 |
| D3 | NCM encontrado no mapa local? | `findNcm()` retorna resultado | Usa NCM do mapa | Tenta AI classification | ● 1.0 |
| D4 | Unidade reconhecida? | `normalizeUnit()` tem mapping | Normaliza (ex: "QUILOGRAMA" → "KG") | Trunca para 3 chars + warn | ● 1.0 |
| D5 | Match exato na cadeia de resolução? | `descricao.toUpperCase() === bp.descricao.toUpperCase()` | Herda SKU/unidade/NCM | Fica vazio, gera novo | ● 1.0 |

---

## 5. EXCEÇÕES E EDGE CASES

| # | Exceção | Frequência | Handling Atual | Confiança |
|---|---------|-----------|----------------|-----------|
| E1 | Tiny API throttle (rate limit excedido) | Frequente em contratos >20 itens | Delay de 1.5-4s entre chamadas | ● 1.0 |
| E2 | Timeout Vercel (>60s) | Contratos com >30 itens | `maxDuration: 60` — pode falhar silenciosamente | ◕ 0.8 |
| E3 | Produto duplicado no Tiny | Frequente | Detectado por pre-check de SKU, mas NÃO por nome | ● 1.0 |
| E4 | Cloud sync restaura dados deletados | Ocorre ao limpar banco | Fix: `updatedAt` setado antes de salvar | ● 1.0 |
| E5 | Unidade do mapa diferente do Tiny | Frequente | Apenas toast warning, NÃO bloqueia envio | ● 1.0 |
| E6 | NCM não encontrado (mapa + AI) | Raro (~5% dos itens) | `ncmAlerts` no response, mas pedido é enviado mesmo assim | ● 1.0 |

---

## 6. FERRAMENTAS E ACESSOS NECESSÁRIOS

| Ferramenta | Propósito | Acesso necessário |
|-----------|-----------|------------------|
| GDP Contratos (dashboard) | Interface principal | URL do deploy Vercel |
| Tiny ERP (painel web) | Verificar produtos/pedidos/NF-e | Login Tiny |
| Tiny API | Automação de cadastro/pedidos | `TINY_API_TOKEN` em env vars Vercel |
| Supabase | Cloud sync | `SUPABASE_URL` + `SUPABASE_ANON_KEY` |
| OpenAI API | Classificação NCM por IA | `OPENAI_API_KEY` |
| Vercel | Deploy e serverless functions | Conta Vercel do projeto |

---

## 7. GAPS E ITENS PENDENTES DE VERIFICAÇÃO

### 🔴 GAPS CRÍTICOS (Score < 0.8)

| # | Gap | Score | Impacto | Ação necessária |
|---|-----|-------|---------|-----------------|
| G1 | **Não existe tela de reconciliação na criação do contrato** | ○ 0.0 | Itens entram sem validar contra banco existente | Implementar Story 4.16 |
| G2 | **Não existe source of truth definida para produtos** | ○ 0.0 | 3 fontes (localStorage, Supabase, Tiny) divergem | Decisão arquitetural: Tiny = master |
| G3 | **Match por nome usa apenas 1-2 palavras com threshold de 1** | ◑ 0.5 | Falsos positivos de matching SKU | Implementar similaridade com threshold >60% |
| G4 | **Resolução de SKU/unidade duplicada em 2 lugares** | ● 1.0 | `tiny-produtos.js` E `order.js` têm lógica duplicada de `searchTinyProduct()` e `normalizeUnit()` — podem divergir | Extrair para módulo compartilhado |
| G5 | **Pedido enviado mesmo com NCM vazio** | ● 1.0 | NF-e sem classificação fiscal | Bloquear envio se NCM vazio |
| G6 | **Unidade inválida não bloqueia envio** | ● 1.0 | Toast de warning mas pedido segue | Bloquear se unidade não reconhecida |
| G7 | **Timeout em contratos grandes (>30 itens)** | ◕ 0.8 | Vercel 60s pode não ser suficiente | Implementar batch processing ou queue |

### ⚠ ITENS PARA VERIFICAÇÃO

| # | Item | Score | Pergunta |
|---|------|-------|---------|
| V1 | Tiny gera NF-e automaticamente do pedido? | ◕ 0.8 | Confirmar: é automático ou tem passo manual? |
| V2 | Quais unidades o Tiny aceita oficialmente? | ◑ 0.5 | Obter lista completa das unidades válidas do Tiny |
| V3 | Pre-check de SKU busca por contractId, mas contratos têm IDs tipo "CTR-..." com letras | ◑ 0.5 | Verificar se `.replace(/[^0-9]/g, "")` pega o prefixo correto |
| V4 | Cloud sync usa Supabase `nexedu_sync` — qual é o comportamento em conflito simultâneo? | ◔ 0.3 | Testar: 2 browsers salvando ao mesmo tempo |

---

## 8. CONFLITOS IDENTIFICADOS

| # | Conflito | Fonte A | Fonte B | Resolução |
|---|----------|---------|---------|-----------|
| C1 | `normalizeUnit()` duplicada | `order.js:204-227` | `tiny-produtos.js:211-234` | Mapas são idênticos HOJE, mas qualquer adição em um não propaga para outro |
| C2 | `NCM_MAP` duplicado | `order.js:4-129` | `tiny-produtos.js:4-158` | `tiny-produtos.js` tem ~30 entradas a mais (materiais escolares, mobiliário) |
| C3 | `searchTinyProduct()` duplicada | `order.js:238-313` | `tiny-produtos.js:170-202` | Versão de `order.js` faz fallback para `produto.obter.php` (busca unidade); `tiny-produtos.js` não faz |
| C4 | `generateSku()` com assinaturas diferentes | `order.js:229-235` → `(item, index, contractId)` | `tiny-produtos.js:204-209` → `(item, contractId)` | Podem gerar SKUs diferentes para o mesmo item |

---

## 9. PROVENIÊNCIA DAS FONTES

| Fonte | Tipo | Confiança Base |
|-------|------|---------------|
| `gdp-contratos.html` (6129+ linhas) | Código-fonte observado | ● 1.0 |
| `api/olist/order.js` (541 linhas) | Código-fonte observado | ● 1.0 |
| `api/tiny-produtos.js` (431 linhas) | Código-fonte observado | ● 1.0 |
| Git log (últimos 5 commits) | Histórico observado | ● 1.0 |
| Stories 4.13, 4.14, 4.15, 4.16 | Documentação de projeto | ◕ 0.8 |
| SOP-INCIDENT-RECOVERY.md | Documentação operacional | ◕ 0.8 |
| Comportamento do Tiny ERP (NF-e) | Reportado/inferido | ◑ 0.5 |

---

## 10. DIAGRAMA DO PIPELINE

```
                     ┌─────────────────────────────────────┐
                     │     FASE 1: IMPORTAR MAPA           │
                     │  Upload .docx/.xlsx/.pdf             │
                     │  Parse → Preview → Selecionar        │
                     └──────────────┬──────────────────────┘
                                    │
              ┌─────────────────────▼─────────────────────┐
              │       FASE 2: CRIAR CONTRATO               │
              │  criarContrato() → localStorage + Supabase │
              │  🔴 SEM reconciliação com banco existente   │
              └──────────────┬────────────────────────────┘
                             │
          ┌──────────────────▼──────────────────────┐
          │    FASE 3: AUTO-CADASTRO TINY (background) │
          │                                            │
          │  Para cada item:                           │
          │  ┌─ Tem SKU? ────→ Skip (guard 4.15)      │
          │  └─ Sem SKU?                               │
          │      ├─ searchTinyProduct(nome)             │
          │      │  ├─ Encontrou → usa SKU existente    │
          │      │  │  🔴 Match com 1 palavra = frágil  │
          │      │  └─ Não encontrou → gera SKU novo    │
          │      │     └─ produto.incluir.php (cria)    │
          │      └─ Rate limit: 1.5-4s entre chamadas   │
          │                                            │
          │  Resultado → atualiza contrato + banco      │
          └──────────────┬─────────────────────────────┘
                         │
          ┌──────────────▼──────────────────────────┐
          │     FASE 4: CRIAR PEDIDO                  │
          │                                           │
          │  Resolução em cadeia:                     │
          │  SKU:     Contrato → Pedido → Banco → ∅   │
          │  Unidade: Contrato → Pedido → Banco → "UN"│
          │  NCM:     Contrato → Pedido → Banco → ∅   │
          │  🔴 Match exato por descricão = falha      │
          │                                           │
          │  order.js Step 1: re-busca se sem SKU     │
          │  order.js Step 2: buildTinyPayload()      │
          │  → normalizeUnit() → POST pedido.incluir  │
          │  🔴 Envia mesmo com NCM vazio             │
          │  🔴 Envia mesmo com unidade truncada      │
          └──────────────┬────────────────────────────┘
                         │
          ┌──────────────▼──────────────────────────┐
          │     FASE 5: NF-e (TINY ERP)               │
          │                                           │
          │  Tiny gera NF-e com dados do pedido       │
          │  unidade errada → NF-e irregular          │
          │  NCM errado → classificação fiscal errada │
          │  🔴 CONSEQUÊNCIA FISCAL REAL              │
          └───────────────────────────────────────────┘
```

---

## 11. RECOMENDAÇÕES DO EXTRATOR

### Prioridade P0 — Bloqueantes fiscais

1. **BLOQUEAR envio de pedido se unidade não está no `normalizeUnit()` map**
   - Hoje: toast warning + envio → **Proposto:** modal de erro, forçar correção
   - Agente: **@dev**

2. **BLOQUEAR envio de pedido se NCM está vazio**
   - Hoje: `ncmAlerts` no response mas não bloqueia → **Proposto:** fail-fast
   - Agente: **@dev**

3. **Implementar Story 4.16 — tela de sincronização na importação**
   - Resolver matching ANTES do contrato existir, não depois
   - Agente: **@dev** (implementação) + **@architect** (decisão de similaridade)

### Prioridade P1 — Integridade de dados

4. **Unificar `normalizeUnit()`, `NCM_MAP`, `searchTinyProduct()` em módulo compartilhado**
   - Hoje: duplicados em `order.js` e `tiny-produtos.js` com divergências
   - Agente: **@dev** (refactoring)

5. **Definir Tiny como source of truth para produtos**
   - Banco local → cache read-only sincronizado do Tiny
   - Agente: **@architect** (decisão) + **@dev** (implementação)

6. **Melhorar `searchTinyProduct()` com threshold de similaridade >60%**
   - Hoje: aceita 1 palavra match → falsos positivos
   - Agente: **@dev**

### Prioridade P2 — Operacional

7. **Implementar batch processing para contratos >30 itens**
   - Evitar timeout de 60s do Vercel
   - Agente: **@dev** + **@devops** (configuração Vercel)

8. **Obter lista oficial de unidades válidas do Tiny ERP**
   - Completar `normalizeUnit()` com 100% de cobertura
   - Agente: **@analyst** (pesquisa)

---

## 12. CHECKLIST DE VERIFICAÇÃO PÓS-EXTRAÇÃO

- [ ] Confirmar se Tiny gera NF-e automaticamente ou tem passo manual (V1)
- [ ] Obter lista completa de unidades aceitas pelo Tiny (V2)
- [ ] Testar pre-check de SKU com IDs tipo "CTR-20260318-1234" (V3)
- [ ] Testar comportamento de conflito simultâneo no Supabase (V4)
- [ ] Validar que `NCM_MAP` de `tiny-produtos.js` é superset do `order.js`
- [ ] Confirmar frequência real de falsos positivos no `searchTinyProduct()`

---

*Extraído por Ohno (SOP Extractor) | SOP Factory v1.0 | PDCA: Plan phase complete*
*Próximo passo: Roteamento ao @sop-analyst para grading + @sop-creator para versão operacional*
