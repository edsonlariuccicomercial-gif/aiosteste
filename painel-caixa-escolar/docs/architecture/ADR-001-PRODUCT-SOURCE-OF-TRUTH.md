# ADR-001: Source of Truth de Produtos e Validação no Pipeline GDP

| Campo | Valor |
|-------|-------|
| **Status** | ACEITO |
| **Data** | 2026-03-18 |
| **Decisor** | Aria (@architect) |
| **Origem** | SOP-GDP-001 — Gaps G1-G7 |
| **Impacto** | ALTO — Resolve falhas fiscais (NF-e) |

---

## Contexto

O pipeline GDP Contratos possui 3 fontes de dados de produtos que operam independentemente:

1. **localStorage** (`gdp.produtos.v1`) — banco local no browser
2. **Supabase** (`nexedu_sync`) — cloud sync
3. **Tiny ERP** — sistema externo que emite NF-e

Quando divergem, a NF-e é emitida com dados incorretos (unidade, NCM, SKU). Isso é irregularidade fiscal.

Adicionalmente, lógica crítica (`normalizeUnit()`, `NCM_MAP`, `searchTinyProduct()`, `generateSku()`) está **duplicada** entre `order.js` e `tiny-produtos.js` com divergências reais.

---

## Decisões

### D1 — Tiny ERP é o MASTER de produtos

**Decisão:** Tiny ERP é a **única source of truth** para dados de produtos (SKU, unidade, NCM).

**Justificativa:**
- Tiny é quem emite a NF-e — se o dado está correto no Tiny, a NF-e sai correta
- Todas as outras fontes (localStorage, Supabase) são **caches derivados**
- Tentar sincronizar 3 fontes independentes é causa-raiz dos bugs

**Modelo de dados:**

```
TINY ERP (master)
    │
    ├── SKU (codigo) — chave primária
    ├── Nome (nome)
    ├── Unidade (unidade)
    ├── NCM (ncm)
    └── Status (situacao)
         │
         ▼ [sync read-only]
    localStorage (gdp.produtos.v1) — cache local
         │
         ▼ [backup]
    Supabase (nexedu_sync) — persistência cross-device
```

**Regras:**
- Banco local (`gdp.produtos.v1`) é cache READ do Tiny
- Criação/edição de produto SEMPRE vai ao Tiny primeiro, depois atualiza cache
- Se Tiny indisponível: usar cache, mas marcar como `pendingSync: true`
- Supabase persiste o cache para acesso cross-device, NÃO é fonte independente

---

### D2 — Validação na ENTRADA, não na saída

**Decisão:** Resolução de SKU/unidade/NCM deve ocorrer na **criação do contrato** (Fase 2), não na criação do pedido (Fase 4).

**Justificativa:**
- Hoje a resolução acontece no `order.js` (Step 1) — tarde demais
- Se o contrato já tem SKU/unidade/NCM validados, o pedido é apenas um "envio" sem lógica de resolução
- Elimina a janela de dados não-validados entre Fase 2 e Fase 4

**Fluxo proposto:**

```
ANTES (atual — quebrado):
  Import Mapa → Contrato [dados crus] → ... tempo ... → Pedido [resolve agora!] → Tiny

DEPOIS (proposto):
  Import Mapa → [SYNC MODAL] → Contrato [SKU/unidade/NCM validados] → Pedido [só envia] → Tiny
```

**Implementação:** Story 4.16 com modal de sincronização na criação do contrato.

---

### D3 — Módulo compartilhado para lógica de produto

**Decisão:** Extrair `normalizeUnit()`, `NCM_MAP`, `searchTinyProduct()`, `generateSku()`, `findNcm()` e `shortenDescription()` para um módulo único: `api/lib/product-utils.js`.

**Justificativa:**
- 4 conflitos documentados (C1-C4) causados por duplicação
- `NCM_MAP` em `tiny-produtos.js` tem 30 entradas a mais que `order.js`
- `searchTinyProduct()` em `order.js` faz fallback para `produto.obter.php`; em `tiny-produtos.js` não faz
- `generateSku()` tem assinaturas diferentes nos dois arquivos
- Manutenção em um arquivo não propaga para o outro

**Estrutura:**

```
api/
├── lib/
│   └── product-utils.js    ← NOVO: módulo compartilhado
│       ├── NCM_MAP          (unificado, superset de ambos)
│       ├── findNcm()
│       ├── normalizeUnit()  (com lista completa)
│       ├── searchTinyProduct()  (com fallback produto.obter.php)
│       ├── generateSku()    (assinatura unificada)
│       ├── shortenDescription()
│       └── normalizeDescription()
├── tiny-produtos.js         ← importa de lib/product-utils.js
└── olist/
    └── order.js             ← importa de lib/product-utils.js
```

---

### D4 — Gates de validação obrigatórios

**Decisão:** Criar 3 gates que **bloqueiam** operações com dados inválidos.

| Gate | Onde | O que bloqueia | Hoje |
|------|------|---------------|------|
| **GATE-1: Unidade válida** | `normalizeUnit()` | Se unidade não está no map → `throw Error` | Trunca silenciosamente |
| **GATE-2: NCM obrigatório** | `buildTinyPayload()` | Se NCM vazio → rejeitar item, não enviar pedido | Envia com `ncmAlerts` |
| **GATE-3: SKU resolvido** | `enviarPedidoOlist()` | Se item sem SKU → bloquear envio com modal | `console.warn` e gera aleatório |

**Comportamento dos gates:**
- Gate falha → modal de erro para o operador com ação clara ("Corrigir no banco de produtos")
- Gate falha → operação NÃO prossegue (fail-fast)
- Log de auditoria: qual item falhou, qual gate, timestamp

---

### D5 — Algoritmo de similaridade para matching

**Decisão:** Substituir match exato de descrição por **similaridade normalizada com threshold 60%**.

**Justificativa:**
- Match exato (`.toUpperCase().trim() === descNorm`) falha com variações mínimas
- `searchTinyProduct()` com threshold de 1 palavra causa falsos positivos

**Algoritmo proposto:**

```javascript
function similaridade(a, b) {
  // 1. Normalizar: NFD, lowercase, remover acentos e pontuação
  const na = normalize(a);
  const nb = normalize(b);

  // 2. Tokenizar: split em palavras >2 chars
  const wordsA = tokenize(na);
  const wordsB = tokenize(nb);

  // 3. Calcular overlap bidirecional (Jaccard-like)
  const intersection = wordsA.filter(w => wordsB.includes(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;

  return union > 0 ? intersection / union : 0;
}

// Thresholds:
// >= 0.8  → match automático (verde)
// >= 0.6  → match sugerido, confirmar (amarelo)
// < 0.6   → sem match (vermelho)
```

**Onde aplicar:**
1. Modal de sync na criação do contrato (Story 4.16)
2. `searchTinyProduct()` — exigir score >= 0.6 ao invés de >= 1 palavra
3. Resolução de SKU na cadeia `enviarPedidoOlist()` (fallback)

---

## Consequências

### Positivas
- NF-e sempre emitida com dados do Tiny (source of truth)
- Divergências detectadas na importação, não na emissão
- Código DRY — uma única implementação de cada função
- Gates impedem erros fiscais antes que ocorram

### Negativas / Trade-offs
- Importação de contrato fica mais lenta (modal de sync + chamadas Tiny)
- Dependência do Tiny API — se offline, contrato criado com `pendingSync`
- Refactoring exige tocar em 3 arquivos simultaneamente (risco de regressão)

### Riscos mitigados
- Calcular: timeout do Vercel pode ser problema com modal de sync + muitos itens → considerar pré-cache do banco Tiny no frontend

---

## Plano de implementação (para @dev)

### Fase A — Módulo compartilhado (P0, pré-requisito)
1. Criar `api/lib/product-utils.js` com funções unificadas
2. `order.js` importa de `product-utils.js` (remover funções locais)
3. `tiny-produtos.js` importa de `product-utils.js` (remover funções locais)
4. Testar: mesmo comportamento, zero regressão

### Fase B — Gates de validação (P0)
1. `normalizeUnit()` → throw em unidade desconhecida
2. `buildTinyPayload()` → rejeitar itens sem NCM
3. `enviarPedidoOlist()` → bloquear se SKU vazio (modal, não warn)
4. Frontend: mostrar modal de erro com ação de correção

### Fase C — Story 4.16 — Modal de sync na criação (P0)
1. Implementar `similaridade()` no módulo compartilhado
2. Modal de sincronização entre itens do mapa e banco de produtos
3. Cores: verde (>80%), amarelo (60-80%), vermelho (<60%)
4. Ações: vincular, buscar, criar, ignorar
5. Pós-sync: contrato salvo com SKU/unidade/NCM resolvidos

### Fase D — Simplificar order.js (P1)
1. Remover Step 1 de `order.js` (resolução de SKU)
2. `order.js` assume que items JÁ vêm com SKU/unidade/NCM
3. Se item sem SKU → GATE-3 bloqueia (não tenta resolver)
4. `buildTinyPayload()` vira passthrough simples

---

*— Aria, arquitetando o futuro* 🏗️
