# SPEC: GDP Simplification + Radar/Intel Fixes

| Field | Value |
|-------|-------|
| **ID** | SPEC-GDP-SIMPLIFICATION-2026 |
| **Version** | 1.0.0 |
| **Date** | 2026-04-22 |
| **Author** | @pm (Morgan) |
| **Classification** | COMPLEX (score: 17/25) |
| **Status** | DRAFT |

## 1. Executive Summary

Simplificação estrutural do módulo GDP (Gestao de Pedidos) e fixes pontuais no Radar/Intel Precos. O objetivo e reduzir complexidade mantendo a logica de negocio, integracao com portal escolar, e geracao de NF-e. Nenhum modulo novo e criado — apenas adaptacao do existente.

**Principio arquitetural:** UMA FONTE DE VERDADE, UM FLUXO CENTRAL.

**Fluxo resultante:** Contrato → Portal Escolar (pedido) → Pedidos (execucao completa) → NF

---

## 2. Scope

### 2.1 In Scope
- 3 fixes no Radar/Intel Precos (FR-001, FR-002, FR-003)
- 16 regras de simplificacao do GDP (FR-004 a FR-019)
- 1 migration Supabase incremental (014)
- Adaptacao de ~12 arquivos JS/HTML existentes

### 2.2 Out of Scope
- Portal escolar (sgd-proxy.js, sync-pedidos.js, sync-entregas.js) — intocavel [CON-004]
- Financeiro (contas a pagar/receber) — sem alteracao [FR-016]
- Login/Auth — sem alteracao
- NF-e SEFAZ client — sem alteracao (exceto campo descricao/SKU)
- Layout/theme — mantido [CON-002]

---

## 3. Wave 1 — Radar/Intel Precos Fixes (Quick Wins)

### 3.1 FR-001: Aprovacao humana obrigatoria no match

**Source:** User request + RES-009 (radar-matcher.js separado do GDP)

**Current state:** `radar-matcher.js` retorna `status: 'exato'` (score 1.0) para matches do dicionario sem confirmacao humana. Layer 2/3 retornam `status: 'sugestao'` mas a UI pode auto-aceitar.

**Target state:**
- TODOS os matches (Layer 1/2/3) retornam `status: 'pendente_revisao'` ate confirmacao humana
- UI mostra badge amarelo "Pendente" + botoes [Confirmar] [Rejeitar]
- Somente apos clique em [Confirmar]: `confirmado=true`, `status='confirmado'`
- Match rejeitado: `status='rejeitado'`, removido do cache

**Changes:**

| File | Change | Trace |
|------|--------|-------|
| `radar-matcher.js` line 143-148 | Layer 1: retornar `status: 'pendente_revisao'` se `!entry.confirmado` | FR-001, RES-009 |
| `radar-matcher.js` line 156-158 | Layer 2: retornar `status: 'pendente_revisao'` (nunca auto-confirma) | FR-001, RES-009 |
| `radar-matcher.js` line 168-176 | Layer 3: retornar `status: 'pendente_revisao'` | FR-001 |
| `index.html` (pre-orcamento rows) | Adicionar badge + botoes Confirmar/Rejeitar por item | FR-001 |
| `app.js` (render pre-orcamento) | Handler para confirmar/rejeitar match, chamar `RadarMatcher.confirm()` | FR-001 |

### 3.2 FR-002: Coluna Unidade no pre-orcamento

**Source:** User request + RES-010 (dados existem, nao sao exibidos)

**Current table:** Item | Marca | Qtd | Custo Unit. | Margem% | Preco Unit. | Total

**Target table:** Item | **Unidade** | Marca | Qtd | Custo Unit. | Margem% | Preco Unit. | Total

**Changes:**

| File | Change | Trace |
|------|--------|-------|
| `index.html` line 284-293 | Adicionar `<th>Unidade</th>` apos Item, ajustar colspan do tfoot | FR-002 |
| `app.js` (renderPreOrcamento) | Adicionar `<td>` com badge colorido: KG=azul, UN=verde, PCT=laranja, LT=roxo, CX=amarelo | FR-002, RES-010 |
| `styles.css` | Classes `.badge-un-kg`, `.badge-un-un`, `.badge-un-pct`, `.badge-un-lt`, `.badge-un-cx` | FR-002 |

**Badge design:**
```css
.badge-unidade { font-weight: 700; padding: 2px 8px; border-radius: 4px; font-size: 0.75rem; }
.badge-un-kg { background: #1e40af22; color: #60a5fa; border: 1px solid #1e40af44; }
.badge-un-un { background: #16653422; color: #4ade80; border: 1px solid #16653444; }
.badge-un-pct { background: #9a340022; color: #fb923c; border: 1px solid #9a340044; }
.badge-un-lt { background: #6b21a822; color: #c084fc; border: 1px solid #6b21a844; }
```

### 3.3 FR-003: Remover aba Banco de Precos

**Source:** User request + RES-006 (facade getCentralComoBancoPrecos() ja existe)

**Changes:**

| File | Change | Trace |
|------|--------|-------|
| `index.html` line 169 | Remover `<button class="tab" data-tab="banco-precos">Banco de Precos</button>` | FR-003 |
| `index.html` lines 400-487 | Remover `<section id="tab-banco-precos">` inteiro | FR-003 |
| `index.html` line 744 | Remover config tab banco-precos | FR-003 |
| `index.html` lines 986-1062 | Remover config section banco-precos | FR-003 |
| `pricing-intel.js` line 609+ | Remover/noop funcao de render tabela banco | FR-003, RES-006 |
| `app-banco.js` | Manter arquivo (dados internos) mas remover referencia da UI | FR-003 |

**Preservar:** `getCentralComoBancoPrecos()` em gdp-banco-produtos.js (API compatibility) [RES-006].

---

## 4. Wave 2 — Contrato ≠ Produto + Vinculacao Manual

### 4.1 FR-004 + FR-006: Separacao contrato/produto e SKU unico

**Source:** Regras 1, 3 + RES-003 (AC-9 ja prioriza skuVinculado)

**Schema change (migration 014):**
```sql
-- Produtos: adicionar campo produto_critico
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS produto_critico boolean DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade_base text;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS embalagens jsonb DEFAULT '[]'::jsonb;
```

**Contrato item structure (JSONB itens[]):**
```json
{
  "descricao": "ARROZ TIPO 1 PCT 5KG",       // imutavel, usado na NF
  "quantidade_contratada": 100,
  "preco_unitario": 25.50,
  "produto_vinculado_id": "uuid-produto",      // FK manual para produto
  "unidade": "PCT"
}
```
*Nota: SKU removido do item de contrato. SKU vive APENAS no cadastro de Produto.* [FR-006]

**NF-e generation (gdp-notas-fiscais.js):**
- `xProd` = descricao do contrato (imutavel)
- `cProd` = SKU do produto vinculado (via produto_vinculado_id)
- [Trace: FR-006, RES-003 line 145-146 gdp-notas-fiscais.js]

### 4.2 FR-005: Eliminar match automatico no GDP

**Source:** Regra 2 + RES-003 (AC-9 ja existe como precedente)

**Remove:**
- Auto-match fallback em gdp-core.js (linhas 638-654, 1047-1050)
- Token similarity matching dentro de contrato flow

**Substitute:**
- Campo `produto_vinculado_id` obrigatorio (pode ser null inicialmente, mas required para gerar pedido)
- Sugestao por busca simples: `SELECT * FROM produtos WHERE nome ILIKE '%termo%' LIMIT 5`
- Usuario confirma manualmente

### 4.3 FR-019: Criacao de produto direto no contrato

**Source:** Regra 16

**UI change (gdp-contratos.html):**
Para cada item do contrato, na coluna de vinculacao:
1. Dropdown/search com produtos existentes
2. Botao `[+ Criar produto]`
3. Modal simples: nome (sem gramatura), categoria, unidade, SKU auto-gerado

**SKU auto-generation:**
```javascript
function generateSKU(categoria, nome) {
  const prefix = (categoria || 'GEN').substring(0, 3).toUpperCase();
  const hash = nome.substring(0, 3).toUpperCase();
  const seq = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${hash}-${seq}`;
}
```

---

## 5. Wave 3 — Pedido como Centro + Remover Demanda

### 5.1 FR-008: Remover modulo de demanda

**Source:** Regra 5 + RES-001 (152 referencias, todas internas)

**Strategy:** Comentar/remover progressivamente em:

| File | References | Action |
|------|-----------|--------|
| `gdp-init.js` lines 54-62, 2206-2249, 3308-3315 | ~10 | Remover loadGdpDemandas/saveGdpDemandas, storage key |
| `gdp-core.js` lines 53, 789, 868-924 | ~10 | Remover GDP_DEMANDAS_KEY, cloud sync para demandas |
| `gdp-estoque-intel.js` (40+ refs) | ~40 | Remover funcoes de demanda, reserva, calculo |
| `gdp-pedidos.js` lines 1906-1998, 2128, 2256 | ~15 | Remover _selectedDemandaIds, demanda-check handlers |
| `app-state.js` lines 291-298, 304, 392, 417 | ~7 | Remover DEMANDAS_KEY, sync key |
| `gdp-contratos.html` | UI elements | Remover tab/section de demandas se existir |

**Nota:** app-sgd-integration.js NAO referencia demandas [RES-004]. Portal escolar seguro.

### 5.2 FR-007: Saldo baseado somente em pedidos

**Source:** Regra 4

**Formula:**
```javascript
function calcularSaldo(contrato) {
  return contrato.itens.map(item => {
    const pedidos = getPedidosByContrato(contrato.id);
    const usado = pedidos
      .filter(p => p.status !== 'cancelado')
      .reduce((sum, p) => {
        const pedidoItem = p.itens.find(pi => pi.produto_vinculado_id === item.produto_vinculado_id);
        return sum + (pedidoItem ? pedidoItem.quantidade : 0);
      }, 0);
    return {
      ...item,
      quantidade_utilizada: usado,
      saldo: item.quantidade_contratada - usado,
      valor_utilizado: usado * item.preco_unitario
    };
  });
}
```

**Garante:** Estoque, demanda, conversao, movimentacao NAO alteram saldo. [FR-007]

### 5.3 FR-009 + FR-010: Pedido como execucao completa

**Source:** Regras 6, 7

**Pedido item enhanced:**
```json
{
  "produto_vinculado_id": "uuid",
  "quantidade_pedida": 50,
  "estoque_disponivel": 20,
  "quantidade_a_comprar": 30,
  "status_item": "pendente"
}
```

**Acoes dentro do pedido:**

| Acao | Comportamento | Status resultante |
|------|--------------|-------------------|
| [Separar do Estoque] | Bipagem + baixa estoque (quantidade_atual -= qtd) | "separado" |
| [Compra Direta] | Registra compra vinculada ao pedido. NAO entra no estoque. | "comprado" |
| [Finalizar Entrega] | Fecha pedido. NAO altera saldo contrato. | "entregue" |

**Status flow:** criado → separando → comprando → entregando → finalizado | cancelado

### 5.4 FR-018: Cancelamento devolve saldo

**Source:** Regra 15

**Logic:**
```javascript
function cancelarPedido(pedidoId) {
  const pedido = getPedido(pedidoId);
  if (confirm('Cancelar pedido? Saldo sera devolvido ao contrato.')) {
    pedido.status = 'cancelado';
    savePedido(pedido);
    // Saldo recalculado automaticamente pela formula FR-007
    // (pedidos cancelados sao excluidos do SUM)
    logAuditoria('cancelamento', pedidoId, pedido);
  }
}
```

---

## 6. Wave 4 — Estoque Simples + Produto Critico + Menu + Relatorios

### 6.1 FR-011: Estoque simplificado

**Source:** Regra 8 + RES-005 (17 refs comprometido, 0 transito)

**Model:** `{ produto_id, quantidade_atual }` — apenas 2 campos.

**Remove:**
- estoque_comprometido (17 refs em gdp-estoque-intel.js)
- Movimentacoes complexas (multiplos tipos)
- Calculo Disponivel = Fisico - Comprometido

**Migration:**
```sql
-- Snapshot: set quantidade_atual = fisico - comprometido
-- (calculation based on current movement records)
```

**Movimentacoes simplificadas:** Apenas entrada (+) e saida (-). Sem tipos complexos.

### 6.2 FR-012: Bipagem mobile 2 modos

**Source:** Regra 9

**File:** `gdp-estoque-intel-mobile.html` (ja tem infra de barcode)

**Adicionar seletor de modo:**
```html
<div class="mode-selector">
  <button class="mode-btn active" data-mode="estoque">Modo Estoque</button>
  <button class="mode-btn" data-mode="compra">Modo Compra</button>
</div>
```

- **Modo Estoque:** bipa → `quantidade_atual -= 1` → feedback verde
- **Modo Compra:** bipa → registra compra no pedido selecionado → feedback azul

### 6.3 FR-013: Conversao de gramatura por produto

**Source:** Regra 10 + RES-002 (11 refs conversoes, removiveis)

**Remove:** `gdp.conversoes.v1` localStorage key e funcoes associadas.

**Adiciona:** Campo `produto_critico` (boolean) no cadastro de produto.
- Se false: fluxo normal
- Se true: campos `unidade_base` (g/ml) e `embalagens[]`
- No pedido: botao [Calcular melhor embalagem] calcula qtd por embalagem

### 6.4 FR-014 + FR-015: Simplificar modulo Inteligencia

**Source:** Regras 11, 12

**Tab "Estoque Intel" → "Produtos & Estoque"**

Manter: CRUD de produtos, visualizacao de estoque.
Remover: demandas (ja removido Wave 3), compra inteligente complexa, movimentacoes detalhadas.

### 6.5 FR-016: Reorganizacao do menu GDP

**Source:** Regra 13

**Menu resultante (gdp-contratos.html sidebar):**

| Item | Funcao | Destaque |
|------|--------|----------|
| Clientes | Sem alteracao | — |
| Contratos | Controle fiscal + vinculo produto | — |
| **Pedidos** | **Execucao completa (centro)** | **Destaque visual (badge, icone maior)** |
| Notas Fiscais | Geracao baseada no pedido | — |
| Produtos & Estoque | Cadastro base + estoque simples | Renomeado de "Estoque Intel" |
| Entregas | Status do pedido (ou tab separada) | Opcional |
| Financeiro | Sem alteracao | — |

**Labels update (gdp-init.js switchTab):**
```javascript
const labels = {
  contratos: "Contratos",
  pedidos: "Pedidos",        // centro do sistema
  "notas-fiscais": "Notas Fiscais",
  estoque: "Produtos & Estoque",  // renomeado
  // ... demais sem alteracao
};
```

### 6.6 FR-017: Relatorios simplificados

**Source:** Regra 14

**4 relatorios essenciais:**
1. Contratos — total / utilizado / saldo
2. Pedidos em aberto — status, escola, valor
3. Compras por pedido — detalhamento
4. Estoque — produto, quantidade atual

---

## 7. Migration 014

```sql
-- Migration: 014_gdp_simplification.sql

-- 1. Produto: adicionar campos para produto_critico
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS produto_critico boolean DEFAULT false;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS unidade_base text;
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS embalagens jsonb DEFAULT '[]'::jsonb;

-- 2. Estoque simplificado (se tabela separada existir)
-- Nota: estoque atual é em localStorage/JSONB. Migration prepara tabela Supabase.
CREATE TABLE IF NOT EXISTS estoque_simples (
  produto_id uuid PRIMARY KEY REFERENCES produtos(id),
  empresa_id text NOT NULL DEFAULT current_setting('app.empresa_id', true),
  quantidade_atual numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE estoque_simples ENABLE ROW LEVEL SECURITY;
CREATE POLICY estoque_simples_empresa ON estoque_simples
  USING (empresa_id = current_setting('app.empresa_id', true));

-- 3. Trigger updated_at
CREATE TRIGGER set_updated_at_estoque_simples
  BEFORE UPDATE ON estoque_simples
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## 8. Traceability Matrix

| FR | Regra | Files Changed | Wave | Risk |
|----|-------|--------------|------|------|
| FR-001 | Radar fix | radar-matcher.js, index.html, app.js | 1 | LOW |
| FR-002 | Radar fix | index.html, app.js, styles.css | 1 | LOW |
| FR-003 | Radar fix | index.html, pricing-intel.js, app-banco.js | 1 | LOW |
| FR-004 | Regra 1 | gdp-contratos-module.js, gdp-banco-produtos.js, migration | 2 | MEDIUM |
| FR-005 | Regra 2 | gdp-core.js, gdp-contratos-module.js | 2 | MEDIUM |
| FR-006 | Regra 3 | gdp-notas-fiscais.js, nfe-sefaz-client.js | 2 | LOW |
| FR-019 | Regra 16 | gdp-contratos-module.js, gdp-banco-produtos.js, gdp-contratos.html | 2 | LOW |
| FR-007 | Regra 4 | gdp-pedidos.js, gdp-contratos-module.js | 3 | MEDIUM |
| FR-008 | Regra 5 | gdp-init.js, gdp-core.js, gdp-estoque-intel.js, gdp-pedidos.js, app-state.js | 3 | HIGH |
| FR-009 | Regra 6 | gdp-pedidos.js, gdp-contratos.html | 3 | MEDIUM |
| FR-010 | Regra 7 | gdp-pedidos.js, gdp-estoque-intel.js, gdp-contratos.html | 3 | MEDIUM |
| FR-018 | Regra 15 | gdp-pedidos.js | 3 | LOW |
| FR-011 | Regra 8 | gdp-estoque-intel.js, gdp-init.js, migration | 4 | MEDIUM |
| FR-012 | Regra 9 | gdp-estoque-intel-mobile.html | 4 | LOW |
| FR-013 | Regra 10 | gdp-init.js, gdp-banco-produtos.js, gdp-pedidos.js | 4 | LOW |
| FR-014 | Regra 11 | gdp-banco-produtos.js | 4 | LOW |
| FR-015 | Regra 12 | gdp-estoque-intel.js, gdp-contratos.html, gdp-init.js | 4 | LOW |
| FR-016 | Regra 13 | gdp-contratos.html, gdp-init.js | 4 | LOW |
| FR-017 | Regra 14 | gdp-contratos.html | 4 | LOW |

---

## 9. Constitutional Gate — No Invention

Every statement in this spec traces to:
- **FR-***: Functional requirement from user's 16 regras + 3 fixes
- **NFR-***: Non-functional requirement from user constraints
- **CON-***: Constraint from user ("NAO criar projeto novo", etc.)
- **RES-***: Research finding validated against codebase

**No features were invented. No scope was added beyond user requirements.**

---

## 10. Files NOT Changed (preserved)

| File | Reason |
|------|--------|
| app-sgd-integration.js | Portal escolar [CON-004, RES-004] |
| sgd-proxy.js | Portal escolar [CON-004] |
| sync-pedidos.js | Portal escolar [CON-004] |
| sync-entregas.js | Portal escolar [CON-004] |
| nfe-sefaz-client.js | Apenas campo cProd/xProd ajustado [FR-006] |
| auth.js | Sem alteracao |
| gdp-usuarios.js | Sem alteracao |
| api/gdp-integrations.js | Sem alteracao |
| Todas as migrations 001-013 | Preservadas [NFR-003] |
