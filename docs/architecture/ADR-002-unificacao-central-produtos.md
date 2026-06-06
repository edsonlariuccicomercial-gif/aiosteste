# ADR-002: Unificação da Central de Produtos — Single Source of Truth

## Status: Proposta
## Data: 2026-06-06
## Autor: @architect (Aria)
## Insumos: pesquisa @analyst (PIM/MDM + microservices), fix @devops (sync/casing)

## Contexto

O sistema mantém **quatro bases de produtos paralelas e editáveis**, todas tratadas
como "donas" dos dados, que divergem entre si:

| Chave localStorage | Variável | Itens (cloud LARIUCCI) | Papel atual |
|--------------------|----------|------------------------|-------------|
| `gdp.produtos.v1` | `bancoProdutos` | 270 | Central de Produtos (GDP) — schema mais rico |
| `intel.central-produtos.v2` | `centralProdutos` | 386 | Matching N3 + custos (IntelPreços) |
| `caixaescolar.banco.v1` | `bancoPrecos` | 256 | RadarMatcher + pré-orçamento (IntelPreços) |
| `gdp.estoque-intel.produtos.v1` | (estoque) | 201 | Estoque Intel |

### Sintomas observados
- "Central de Produtos zerada" no GDP (causa imediata corrigida em commit `fb6682f`:
  proteção do botão Sincronizar + lookup case-insensitive de `user_id`).
- Contagens divergentes (270 ≠ 386 ≠ 256 ≠ 201) = mesma entidade fora de sincronia.
- Bug de `user_id` (`LARIUCCI` vs `Lariucci`) afetava as 4 chaves de uma vez.

### Diagnóstico de causa-raiz (arquitetural)
A unificação **já foi iniciada e abandonada no meio**:
- Story 8.1 criou `gdp.produtos.v1` declarando-a "fonte única que substitui o Banco de Preços".
- Story 8.3 escreveu a facade `getCentralComoBancoPrecos()` para o `bancoPrecos` virar
  uma *view* da Central — **mas a facade nunca foi conectada (zero chamadas no código)**.
- Resultado: cada tela (`index.html` IntelPreços, `gdp-contratos.html` GDP) continua
  lendo sua própria base via `localStorage`, e elas divergem.

### Restrição arquitetural
`index.html` e `gdp-contratos.html` são **duas SPAs separadas** — não compartilham objeto
em memória, apenas `localStorage` + Supabase. A "fonte única" precisa ser uma **chave
canônica** acessada por uma **camada de acesso única**, não cópias por tela.

### Evidência externa (pesquisa @analyst)
- **PIM/MDM:** consenso é Single Source of Truth — uma base autoritativa, demais consomem.
  Múltiplas bases editáveis para a mesma entidade = fragmentação (sintoma vivido).
- **Microservices (database-per-service):** separação só é saudável se as cópias forem
  **derivadas read-only sincronizadas**, nunca múltiplas bases editáveis.
- Ambas convergem: **nunca múltiplas bases editáveis autoritativas para a mesma entidade.**
- Contexto do sistema (SPA única, ~270-386 produtos, 1 operador) **não justifica** bases
  separadas — não há escala/isolamento/times que paguem o custo. → **Unificar.**

## Decisão

**1. SSoT = `gdp.produtos.v1`** (decisão do usuário). É a base eleita como verdade única.

**2. Redesenho da camada de acesso (decisão do usuário):** criar um módulo único
`product-store` com API limpa, substituindo a facade órfã. Todas as telas (GDP,
IntelPreços/Radar, Estoque) passam a consumir **somente** esse módulo.

**3. Consolidação de dados — SEGURA POR PADRÃO (ressalva do arquiteto):**
A decisão do usuário foi "eleger `gdp.produtos.v1` e descartar o resto". **Auditoria
mostrou risco material de perda de catálogo:**

| Base | Produtos só nela (fora da SSoT, por nome normalizado) |
|------|-------------------------------------------------------|
| `intel.central-produtos.v2` | **132** (abacaxi, abobrinha, alface, alho, almeirão, amendoim...) |
| `caixaescolar.banco.v1` | 36 |
| `gdp.estoque-intel.produtos.v1` | 167 |

Descartar cegamente perderia ~132+ produtos legítimos — exatamente o catálogo que o
RadarMatcher usa para associar. **Decisão do arquiteto:** honrar a SSoT eleita, mas a
migração one-time **absorve** os produtos órfãos para dentro de `gdp.produtos.v1` antes
de aposentar as bases antigas. Usuário fica com Central como verdade única **com catálogo
completo**, sem descarte cego. (Requer aprovação do usuário neste ADR.)

### Arquitetura alvo

```
                    ┌─────────────────────────────────┐
                    │  product-store (módulo único)   │
                    │  ───────────────────────────    │
                    │  SSoT: gdp.produtos.v1           │  ← única base editável
                    │  API: list/get/save/remove/      │
                    │       search/match-catalog       │
                    └───────────────┬─────────────────┘
                                    │ (read-through views)
          ┌─────────────────────────┼─────────────────────────┐
          ▼                         ▼                         ▼
   bancoPrecos (view)       centralProdutos (view)     estoque (view)
   GDP/Radar/pré-orç.       matching N3                Estoque Intel
```

## Plano de Implementação (faseado, reversível por fase)

### Fase 0 — Backup e auditoria (pré-requisito, sem código de produção)
- Exportar snapshot das 4 chaves (cloud + local) para `docs/architecture/data-snapshots/`.
- Gerar relatório de divergência (único/duplicado/conflitante por nome+SKU).
- **Gate:** usuário revisa o que será absorvido vs. descartado.

### Fase 1 — Módulo `product-store` (greenfield, sem quebrar nada)
- Novo arquivo `server-lib/product-store.js` (ESM, testável) + twin browser.
- API: `list()`, `get(id)`, `getByNameOrSku()`, `save()`, `remove()`, `searchCatalog()`.
- Schema unificado (superset de `PRODUTO_DEFAULTS` + campos de matching).
- **100% coberto por testes** (vitest) antes de qualquer wiring.

### Fase 2 — Migração one-time consolidadora
- `migrarParaSSoT()`: une as 4 bases por nome/SKU normalizado, deduplica, enriquece
  o registro (custo, margem, NCM, concorrentes, propostas), grava em `gdp.produtos.v1`.
- Idempotente (flag de migração) + backup automático antes de gravar.
- **Gate:** contagem final ≥ união esperada; log do que foi absorvido.

### Fase 3 — Telas consomem o módulo (read-through)
- GDP: `renderBancoProdutos` → `productStore.list()`.
- IntelPreços/Radar: `bancoPrecos` vira view de `productStore` (substitui `loadBancoLocal`).
- `centralProdutos` (matching N3) → `productStore.searchCatalog()`.
- Escritas (`save`/`remove`) passam a ir só para a SSoT.

### Fase 4 — Aposentar bases legadas
- Após N dias estáveis, parar de sincronizar `intel.central-produtos.v2`,
  `caixaescolar.banco.v1`, `gdp.estoque-intel.produtos.v1` (manter só leitura legada
  durante transição). Remover das `SYNC_KEYS` quando seguro.

## Consequências

**Positivas:** uma verdade só; fim da divergência; o bug de casing afeta 1 chave; matching
do Radar opera sobre catálogo completo; base testável.

**Negativas / riscos:** refatorar 2 SPAs é trabalho substancial (Fase 3 é a mais arriscada);
migração one-time é irreversível sem backup (mitigado pela Fase 0); transição exige período
de dupla-escrita ou janela de manutenção.

**Consolidação — APROVADA (usuário, 2026-06-06):** absorver os órfãos na SSoT. A migração
one-time une as 4 bases em `gdp.produtos.v1` preservando os 132+ produtos exclusivos da
Intel. Descarte cego foi rejeitado para não perder catálogo do RadarMatcher.

## Handoff
- Schema detalhado + migração → **@data-engineer** (Dara).
- Implementação faseada → **@dev** (Dex), via stories por fase.
- Push/deploy → **@devops** (Gage).
