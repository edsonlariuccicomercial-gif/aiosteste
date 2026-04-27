# Avaliacao Arquitetural — GDP Visual Refresh: Pedidos

> **Autor:** @architect (Aria)
> **Data:** 2026-04-27
> **Input:** `docs/reference/olist-pedidos-visual-reference.md` (por @analyst)
> **Escopo:** Mudancas CSS/HTML na secao Pedidos do modulo GDP

---

## 1. Diagnostico do Estado Atual

### Arquivos Impactados

| Arquivo | Tipo de Mudanca | Risco |
|---------|----------------|-------|
| `gdp-contratos.html` (linhas 85-93) | CSS inline — estilos de `.table-wrap`, `th`, `td`, `tr:hover` | BAIXO |
| `gdp-contratos.html` (linhas 462-504) | HTML — estrutura do `#tab-pedidos` | BAIXO |
| `gdp-pedidos.js` (linhas 49-67) | JS — template literal do `renderPedidos()` | BAIXO |
| `gdp-pedidos.js` (linhas 1784-1808) | JS — `renderPedidosStatusTabs()` | BAIXO |
| `css/design-tokens.css` | Nenhuma mudanca necessaria | NENHUM |

### Problemas Visuais Identificados (GDP vs Olist)

| # | Problema | Causa Raiz |
|---|----------|------------|
| 1 | Pedidos parecem estar dentro de cards | `.table-wrap` tem `background`, `border`, `border-radius:12px` |
| 2 | Baixa densidade — poucos pedidos visiveis | `th` padding `.7rem 1rem`, `td` padding `.6rem 1rem` (excessivo) |
| 3 | Headers muito destacados | `text-transform:uppercase`, `letter-spacing:.05em`, `font-size:.72rem` |
| 4 | Separadores pesados entre linhas | `border-top:1px solid rgba(71,85,105,.3)` no `td` (ok, mas combinado com card = pesado) |
| 5 | Tabs de status como botoes | `renderPedidosStatusTabs()` renderiza `<button class="btn">` com estilo de botao |
| 6 | Search bar pequeno | Input sem altura definida, sem border-radius dedicado |
| 7 | Sem rodape de totais alinhado | Footer existe mas fora da tabela |

---

## 2. Plano de Mudancas

### Camada 1: CSS (gdp-contratos.html — styles inline)

**Antes:**
```css
.table-wrap{background:var(--s1);border:1px solid var(--bdr);border-radius:12px;overflow:hidden}
table{width:100%;border-collapse:collapse}
th{background:var(--s2);padding:.7rem 1rem;text-align:left;font-size:.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--mut);position:sticky;top:0}
td{padding:.6rem 1rem;font-size:.85rem;border-top:1px solid rgba(71,85,105,.3)}
tr:hover td{background:rgba(59,130,246,.04)}
```

**Depois:**
```css
.table-wrap{background:transparent;border:none;border-radius:0;overflow:hidden}
table{width:100%;border-collapse:separate;border-spacing:0 2px}
th{background:transparent;padding:10px 6px;text-align:left;font-size:.82rem;text-transform:none;letter-spacing:0;color:var(--mut);font-weight:400;position:sticky;top:0;border-bottom:1px solid var(--bdr)}
td{padding:9px 6px;font-size:.88rem;border-top:none;border-bottom:1px solid rgba(71,85,105,.15)}
tr:hover td{background:rgba(78,201,138,.04)}
```

**Mudancas-chave:**
- `.table-wrap`: remover background, border, border-radius → tabela flat
- `th`: remover uppercase/letter-spacing, font-weight 400, padding reduzido
- `td`: padding reduzido, separador mais sutil
- `border-collapse: separate` com `border-spacing: 0 2px` para micro-gap

### NOTA IMPORTANTE — Escopo do CSS

As classes `.table-wrap`, `th`, `td` sao **globais** no `gdp-contratos.html`. Alterar diretamente afetaria TODAS as tabelas (Contratos, Notas Fiscais, Contas a Pagar, etc.).

**Estrategia recomendada:** Usar um seletor com escopo no `#tab-pedidos`:

```css
/* Estilo flat para a tab de Pedidos */
#tab-pedidos .table-wrap{background:transparent;border:none;border-radius:0}
#tab-pedidos th{background:transparent;padding:10px 6px;font-size:.82rem;text-transform:none;letter-spacing:0;font-weight:400;border-bottom:1px solid var(--bdr)}
#tab-pedidos td{padding:9px 6px;font-size:.88rem;border-top:none;border-bottom:1px solid rgba(71,85,105,.15)}
#tab-pedidos tr:hover td{background:rgba(78,201,138,.04)}
#tab-pedidos table{border-collapse:separate;border-spacing:0 2px}
```

Se desejar aplicar a TODAS as tabelas do GDP (recomendado para consistencia visual), alterar os seletores globais diretamente.

### Camada 2: HTML (gdp-contratos.html — #tab-pedidos)

**Search bar — Antes (linha 465):**
```html
<input type="text" id="busca-pedido" placeholder="Buscar cliente, CNPJ ou contrato..." oninput="renderPedidos()" style="min-width:200px">
```

**Search bar — Depois:**
```html
<div style="position:relative;flex:1;max-width:500px">
  <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--mut);font-size:.9rem;pointer-events:none">&#x1F50D;</span>
  <input type="text" id="busca-pedido" placeholder="Pesquise por cliente, CNPJ ou contrato..." oninput="renderPedidos()" style="width:100%;height:40px;padding:9px 12px 9px 36px;border-radius:6px;border:none;background:var(--bg);color:var(--txt);font-size:.95rem">
</div>
```

### Camada 3: JavaScript (gdp-pedidos.js)

#### 3a. Status Tabs — `renderPedidosStatusTabs()` (linha 1789)

**Antes:** Renderiza `<button class="btn btn-green">` — visual de botao.

**Depois:** Renderizar como tabs inline com dot + nome + contador:

```javascript
container.innerHTML = PEDIDO_STATUS_TABS.map((tab) => {
  const tabItems = safeItems.filter((item) => normalizePedidoStatus(item.status) === tab.key);
  const count = tabItems.length;
  const cor = PEDIDO_STATUS_COLORS[tab.key] || '#94a3b8';
  const active = pedidoStatusTabAtual === tab.key;
  return `<button onclick="setPedidoStatusTab('${tab.key}')" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 20px;background:transparent;border:none;border-bottom:2px solid ${active ? 'var(--accent)' : 'transparent'};cursor:pointer;transition:all .2s;opacity:${active ? '1' : '.7'}">
    <span style="display:flex;align-items:center;gap:6px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cor}"></span>
      <span style="font-size:.88rem;font-weight:${active ? '600' : '400'};color:var(--txt)">${tab.label}</span>
    </span>
    <span style="font-size:.78rem;color:var(--mut);font-weight:600">${count > 0 ? count.toString().padStart(2,'0') : ''}</span>
  </button>`;
}).join("");
```

#### 3b. Rodape de totais (linha 1800-1807)

**Antes:** Footer separado fora da tabela.

**Depois:** Usar `<tfoot>` dentro da tabela para alinhamento correto com colunas:

Adicionar `<tfoot id="pedidos-tfoot"></tfoot>` apos `</tbody>` no HTML, e atualizar o JS para popular o tfoot com totais alinhados.

#### 3c. Render das linhas — `renderPedidos()` (linhas 49-67)

Impacto minimo — a estrutura `<tr><td>` ja esta correta. Apenas ajustar:
- Remover `font-weight:700` do botao de ID (usar 600)
- Deixar o `...` menu mais sutil (sem btn-outline)

---

## 3. Analise de Impacto

### Risco: BAIXO

| Fator | Avaliacao |
|-------|-----------|
| Arquivos alterados | 2 (gdp-contratos.html + gdp-pedidos.js) |
| Funcionalidades afetadas | 0 — apenas visual |
| Regressao potencial | Minima — CSS escopado em `#tab-pedidos` |
| Complexidade | Baixa — mudancas CSS + template literals |
| Reversibilidade | Total — git revert |
| Dependencias externas | 0 |
| Design tokens | Nenhuma alteracao necessaria |

### Decisao: Escopo Global vs Por-Tab

| Opcao | Pros | Contras |
|-------|------|---------|
| **A: So #tab-pedidos** | Zero risco de regressao em outras tabs | Inconsistencia visual entre tabs |
| **B: Todas as tabelas GDP** | Consistencia visual total | Precisa validar cada tab visualmente |

**Recomendacao:** Comecar com **Opcao A** (so Pedidos), validar visualmente, depois expandir para todas as tabelas numa segunda story.

---

## 4. Estimativa de Complexidade

| Dimensao | Score (1-5) | Justificativa |
|----------|-------------|---------------|
| Scope | 2 | 2 arquivos, mudancas CSS/JS localizadas |
| Integration | 1 | Sem APIs externas |
| Infrastructure | 1 | Sem mudancas de infra |
| Knowledge | 1 | CSS e JS basico |
| Risk | 1 | Apenas visual, reversivel |
| **TOTAL** | **6** | **Classe SIMPLE** |

---

## 5. Recomendacao para @pm

Criar **1 Epic** com **2 Stories**:

### Story 1: GDP Visual Refresh — Pedidos (Prioridade Alta)
- CSS: Tabela flat, headers muted, separadores finos
- HTML: Search bar ampliado com icone
- JS: Status tabs com dots + contadores inline
- JS: Rodape de totais dentro da tabela

### Story 2: GDP Visual Refresh — Todas as Tabelas (Prioridade Media)
- Expandir estilo flat para Contratos, Notas Fiscais, Contas, etc.
- Avaliar consistencia visual em todas as tabs
- Depende da Story 1 estar concluida e aprovada

---

## 6. Proximos Passos (Fluxo AIOX)

1. **@architect (Aria)** — [CONCLUIDO] Avaliacao arquitetural
2. **@pm (Morgan)** — Criar Epic + Stories
3. **@sm (River)** — Formatar stories com ACs
4. **@po (Pax)** — Validar stories
5. **@dev (Dex)** — Implementar

---

*Avaliacao arquitetural por @architect (Aria) em 2026-04-27*
*Classificacao: SIMPLE (score 6/25)*
