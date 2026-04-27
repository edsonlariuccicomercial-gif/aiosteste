# Referência Visual — Olist ERP: Pedidos de Venda

> **Objetivo:** Documentar padrões visuais de apresentação (layout, tipografia, espaçamentos, separadores, tabs de status) da seção "Pedidos de Venda" do Olist ERP para aplicar ao módulo GDP do Painel Caixa Escolar.
>
> **NOTA:** Apenas estilo de apresentação. Cores seguem o design-tokens.css existente. Nenhuma função será copiada.

---

## 1. Layout Geral da Página

```
┌────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: início > vendas > pedidos de venda                     │
│                                                     [incluir] [...] │
├────────────────────────────────────────────────────────────────────┤
│ Título da Página (h2)                                              │
├────────────────────────────────────────────────────────────────────┤
│ [Campo de busca largo]              [Últimos 30 dias] [filtros] [x]│
├────────────────────────────────────────────────────────────────────┤
│ ● todos  ● em aberto  ● aprovado  ● preparando  ● faturado  mais  │
│   17        01                                       16            │
├────────────────────────────────────────────────────────────────────┤
│ □  Nº↕  Data↕  Previsto↕  Data limite↕  Cliente↕  CNPJ  Total  Nº │
│ ─────────────────────────────────────────────────────────────────── │
│ □ … 941  27/04  22/04               Caixa Escolar   19.92  385,00 │
│ ─────────────────────────────────────────────────────────────────── │
│ □ … 940  24/04  24/04               Caixa Escolar   19.92  525,00 │
│ ─────────────────────────────────────────────────────────────────── │
│                                          17 qtd    14.709,67 total │
└────────────────────────────────────────────────────────────────────┘
```

### Características do Layout

| Aspecto | Olist (Referência) | GDP Atual (Problema) |
|---------|-------------------|---------------------|
| Apresentação dos itens | **Linhas de tabela simples** com separador fino | Cards individuais (pesado visualmente) |
| Separador entre itens | `border-bottom: 1px solid` (cor sutil) | Bordas de card com sombra |
| Densidade visual | Alta — muitas informações visíveis | Baixa — poucos itens por viewport |
| Fundo das linhas | **Transparente** (sem card) | Card com background |
| Espaçamento entre linhas | `border-spacing: 0px 2px` (mínimo) | Gap entre cards |

---

## 2. Tipografia

| Elemento | Font Family | Font Size | Font Weight | Color |
|----------|-------------|-----------|-------------|-------|
| **Título da página** | Plus Jakarta Sans | 20px | 600 (semibold) | #fafafa |
| **Header da tabela** | Plus Jakarta Sans | 14px | 400 (regular) | #a1a1a1 (muted) |
| **Célula da tabela** | Plus Jakarta Sans | 15px | 400 (regular) | #fafafa |
| **Tabs de status** | Plus Jakarta Sans | 15px | 500 (medium) | #ffffff |
| **Breadcrumb** | Plus Jakarta Sans | 16px | — | #f5f5f5 |
| **Campo de busca** | Plus Jakarta Sans | 16px | — | #fafafa |

### Mapeamento para Design Tokens GDP

| Olist | GDP Design Token Equivalente |
|-------|------------------------------|
| 20px título | `var(--text-xl)` |
| 15px corpo | `var(--text-sm)` ou criar `--text-base: 15px` |
| 14px header | `var(--text-xs)` |
| Plus Jakarta Sans | `var(--font-sans)` (manter fonte atual) |

---

## 3. Campo de Busca

```
┌──────────────────────────────────────────┐
│ 🔍 Pesquise por cliente ou número        │
└──────────────────────────────────────────┘
```

| Propriedade | Valor |
|-------------|-------|
| Height | 40px |
| Padding | 9px 5px 9px 16px |
| Font size | 16px |
| Border radius | 6px |
| Border | nenhuma (0px) |
| Background | escuro (rgb(24,24,24)) |
| Placeholder | texto muted |
| Ícone | lupa à esquerda, integrada |
| Largura | ~60% da área de conteúdo |

### Diferença para GDP

O GDP atual usa um campo de busca menor. Aplicar:
- Aumentar para `height: 40px`
- `border-radius: 6px` (usar `var(--radius)`)
- Sem borda visível — apenas background sólido
- Placeholder descritivo

---

## 4. Tabs de Status (Padrão Visual Chave)

```
  todos    ● em aberto   ● aprovado   ● preparando envio   ● faturado   mais ···
    17          01                                              16
```

| Propriedade | Valor |
|-------------|-------|
| Layout | `display: flex` horizontal |
| Font size | 15px |
| Font weight | 500 (medium) |
| Padding | 10px 20px |
| Indicador ativo | borda inferior ou destaque |
| Contadores | número abaixo do nome do status |
| Indicador de cor | bolinha (●) antes do nome — cor contextual por status |
| Overflow | botão "mais" com dropdown para status adicionais |

### Cores dos Indicadores de Status (Olist)

| Status | Cor da Bolinha |
|--------|---------------|
| Em aberto | Amarelo/Laranja |
| Aprovado | Verde |
| Preparando envio | Verde-escuro |
| Faturado | Cinza/Neutro |
| Cancelado | Vermelho |

### Aplicação no GDP

Manter a mesma estrutura de tabs com:
- Bolinha colorida + nome do status + contador
- Tabs na mesma linha horizontal
- Botão "mais" quando muitos status
- Status do GDP: Rascunho, Enviado, Recebido, Faturado

---

## 5. Tabela / Lista de Pedidos

### 5.1 Header da Tabela

| Propriedade | Valor |
|-------------|-------|
| Font size | 14px |
| Font weight | 400 (regular, não bold) |
| Color | #a1a1a1 (muted/cinza) |
| Padding | 10px 6px |
| Border bottom | `1px solid rgb(61,61,61)` — linha fina separando header do corpo |
| Text transform | none (sem uppercase) |
| Sortable | setas ↕ indicando ordenação |

### 5.2 Linhas da Tabela (Corpo)

| Propriedade | Valor |
|-------------|-------|
| Font size | 15px |
| Color | #fafafa |
| Padding célula | 9px 6px 6px |
| Line height | ~21px (1.43) |
| Height da linha | ~105px (auto, baseado em conteúdo multi-linha) |
| Background | **transparente** (sem card, sem fundo) |
| Separador | `border-spacing: 0px 2px` — gap mínimo entre linhas |
| Border nas células | `2px solid transparent` (invisível, usado para hover) |
| Hover | Transição suave (`transition: all`) |

### 5.3 Elementos por Linha

```
□  ···  941  27/04/2026  22/04/2026   Caixa Escolar Bernardo   19.929.355/0001-98   385,00   30330
│   │    │       │           │              │                         │                │        │
│   │    │       │           │              │                         │                │        └─ Nº pedido externo
│   │    │       │           │              │                         │                └─ Total (R$)
│   │    │       │           │              │                         └─ CNPJ/CPF
│   │    │       │           │              └─ Nome do cliente (pode ter 2-3 linhas)
│   │    │       │           └─ Data prevista
│   │    │       └─ Data do pedido
│   │    └─ Número do pedido interno
│   └─ Menu de ações (3 pontos)
└─ Checkbox de seleção (13x13px)
```

### 5.4 Rodapé/Resumo

```
                                                          17          14.709,67
                                                      quantidade    valor total (R$)
```

| Propriedade | Valor |
|-------------|-------|
| Posição | Fixo no rodapé da tabela |
| Font size | 15px |
| Alinhamento | Direita, alinhado com colunas correspondentes |
| Label | "quantidade" / "valor total (R$)" — texto muted abaixo |

---

## 6. Área de Conteúdo

| Propriedade | Valor |
|-------------|-------|
| Padding | 15px 25px |
| Background | transparente (herda do body) |
| Body background | rgb(32, 32, 32) — escuro |

---

## 7. Botões de Ação

### Botão Principal ("incluir pedido")

| Propriedade | Valor |
|-------------|-------|
| Posição | Top-right, alinhado com breadcrumb |
| Estilo | **Pill/rounded** — border-radius grande |
| Background | Preenchido (cor primária) |
| Destaque | É o CTA principal da página |

### Botão Secundário ("mais ações", "imprimir")

| Propriedade | Valor |
|-------------|-------|
| Border | `1px solid #fafafa` (outline) |
| Background | Transparente |
| Border radius | 19px (pill) |
| Font size | 14px |
| Padding | 2px 25px |
| Font weight | 300 (light) |

### Botões de Filtro ("Últimos 30 dias", "filtros", "limpar filtros")

| Propriedade | Valor |
|-------------|-------|
| Estilo | Texto simples, sem borda visível |
| Font size | 16px |
| Background | Transparente |
| Cursor | Pointer |
| Ícone | Prefixo (🗓️ para data, ⚙️ para filtros) |

---

## 8. Padrões Visuais a Aplicar no GDP

### O que MUDAR no GDP:

1. **Remover cards dos pedidos** → Usar linhas de tabela simples com separador fino
2. **Separador entre linhas** → `border-bottom: 1px solid var(--muted)` com opacidade baixa, em vez de gap/card
3. **Aumentar densidade** → Mais pedidos visíveis por viewport
4. **Search bar** → Aumentar para 40px height, border-radius 6px, sem borda
5. **Tabs de status** → Adicionar bolinha colorida + contador numérico abaixo
6. **Header da tabela** → Cor muted (#a1a1a1 equivalent), font weight regular (não bold)
7. **Rodapé resumo** → Totalizadores alinhados às colunas

### O que MANTER no GDP:

1. **Cores** → Continuar usando design-tokens.css (--accent, --bg, --card, etc.)
2. **Font family** → Manter a fonte atual do sistema
3. **Sidebar** → Manter a estrutura de navegação GDP existente
4. **Funcionalidades** → Todas as funções permanecem iguais

---

## 9. Screenshots Capturados

| Arquivo | Descrição |
|---------|-----------|
| `.playwright-mcp/olist-pedidos-venda-viewport.png` | Viewport da lista de pedidos |
| `.playwright-mcp/olist-pedidos-fullpage.png` | Página completa (fullpage) |
| `.playwright-mcp/olist-home.png` | Home do ERP (referência geral) |

---

## 10. Próximos Passos (Fluxo AIOX)

1. **@analyst (Atlas)** — [CONCLUÍDO] Discovery visual documentado
2. **@architect (Aria)** — Avaliar mudanças na arquitetura CSS/HTML necessárias
3. **@pm (Morgan)** — Criar Epic/PRD para "GDP Visual Refresh - Pedidos"
4. **@sm (River)** — Criar stories de implementação
5. **@dev (Dex)** — Implementar as mudanças visuais

---

*Documento gerado por @analyst (Atlas) em 2026-04-27*
*Fonte: ERP da Olist (erp.olist.com) — Seção Vendas > Pedidos de Venda*
