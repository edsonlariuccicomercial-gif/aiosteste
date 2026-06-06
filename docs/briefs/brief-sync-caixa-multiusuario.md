# Project Brief — Divergência de Caixa entre Navegadores/Usuários (Sync Multiusuário)

**Autor:** Atlas (@analyst)
**Data:** 2026-06-06
**Status:** Pronto para @pm (criação de stories)
**Squad afetado:** caixa-escolar (GDP)
**Severidade:** ALTA — dado financeiro incorreto exibido a usuários em produção

---

## 1. Resumo Executivo

O caixa diverge entre navegadores/usuários da **mesma empresa**. No navegador da Angela o saldo está correto; no do Edson o saldo mostra **apenas o saldo inicial** e **161 lançamentos aparecem na lista mas não entram no cálculo**. São **duas causas-raiz independentes** que se combinam — e **ambas são anteriores ao EPIC-16** (não foram introduzidas pelo deploy de hoje). O EPIC-16 corrigiu a integridade transacional *dentro de um mesmo usuário*; este brief trata da integridade *entre usuários/máquinas*.

**Decisões do stakeholder (Edson — 2026-06-06):**
- **Modelo:** caixa **compartilhado** — uma empresa, um caixa. Angela e Edson devem ver exatamente os mesmos dados.
- **Saldo inicial:** **sincronizado** (propriedade da conta da empresa, não do navegador).

---

## 2. Sintomas Relatados (evidência do usuário)

- **S1.** Navegador Angela: saldo do caixa **correto** (reflete última atualização).
- **S2.** Navegador Edson: saldo do caixa = **apenas o saldo inicial** configurado, ignorando lançamentos.
- **S3.** Navegador Edson: **161 lançamentos visíveis** na lista do caixa que **não contabilizam** no valor.
- **S4.** Divergência ocorre entre navegadores, máquinas e usuários.

---

## 3. Diagnóstico Técnico (causa-raiz por evidência de código)

### CAUSA-RAIZ A — `empresa_id` divergente entre usuários (a principal)

`getEmpresaId()` em `gdp-api.js` (L37-61) resolve a identidade por cadeia de fallback:

```js
var id = emp.syncUserId || emp.nomeFantasia || emp.nome || emp.cnpj || 'LARIUCCI';
```

Todas as queries ao Supabase filtram por esse id:
```js
sbFetch('/' + table + '?empresa_id=eq.' + encodeURIComponent(getEmpresaId()) + ...)  // gdp-api.js
```

**Problema:** se Angela e Edson têm `nexedu.empresa.syncUserId` diferentes no localStorage (ou um resolve por `syncUserId` e o outro cai no fallback `LARIUCCI`/`nome`/`cnpj`), eles leem e gravam em **partições diferentes** da tabela `conciliacoes` no Supabase. Resultado: cada um vê um conjunto de dados distinto. O próprio código já tem um `console.warn('[Sync] empresa_id usando fallback LARIUCCI...')` sinalizando essa fragilidade.

→ **Causa de S1, S2, S4.** É a divergência fundamental entre usuários.

### CAUSA-RAIZ B — Fonte dupla de dados no cálculo do saldo (o "visível mas não conta")

`getCaixaResumo()` em `gdp-pedidos.js` (L2023-2038):

```js
const concItems = loadConciliacao();                       // fonte 1: gdp.conciliacao.v1
const items = concItems.length > 0 ? concItems : caixaExtratoMovimentos;  // fonte 2 (fallback legado)
const entradas = items.filter(v>0)...; const saidas = items.filter(v<0)...;
saldo = saldoInicial + entradas - saidas;
```

E `renderCaixa()` (L2075) renderiza `resumo.items`.

**Problema:** quando `loadConciliacao()` retorna vazio (Edson, cujo `empresa_id` não trouxe dados), o cálculo cai no fallback `caixaExtratoMovimentos` — uma variável **em memória/legada** que pode conter os 161 lançamentos antigos. Eles **renderizam na lista** (S3) mas, dependendo do estado, **somam zero** porque a fonte do cálculo e a fonte da renderização divergem, restando só `saldoInicial`.

→ **Causa de S2 + S3** (161 visíveis, saldo = só inicial).

### CAUSA-RAIZ C — Saldo inicial só no localStorage (nunca sincronizado)

`getCaixaResumo()` lê o saldo inicial de:
```js
JSON.parse(localStorage.getItem("nexedu.config.contas-bancarias") || "[]")
```

**Problema:** essa chave **não está nas tabelas de sync do Supabase** (gdp-api.js não a gerencia). É puramente por-navegador. Angela e Edson têm valores diferentes → saldo inicial diverge. Contradiz a decisão "mesmo para todos".

→ **Causa de S2** (saldo inicial diferente por navegador).

---

## 4. Por que NÃO é regressão do EPIC-16

- `getEmpresaId` (Causa A) e o fallback `caixaExtratoMovimentos` (Causa B) **já existiam** antes do EPIC-16.
- `loadConciliacao` lê só de localStorage desde sempre (Story 4.62).
- O EPIC-16 atuou na integridade transacional *intra-usuário* (vínculo, estorno, persistência local). A divergência *inter-usuário* é uma camada diferente, pré-existente.
- **Importante:** a imunidade ao tombstone adicionada na 16.2 NÃO causa isto — ela protege itens vinculados de um delete; não cria nem esconde lançamentos.

---

## 5. Escopo da Solução (alto nível — detalhe é do @pm/@architect)

### Frente 1 — `empresa_id` único e determinístico (resolve A, S1/S2/S4)
- Garantir que TODOS os usuários da mesma empresa resolvam o **mesmo `empresa_id`** fixo (não depender de `nome`/`cnpj`/fallback por navegador).
- Definir o `empresa_id` canônico no login (vinculado à empresa, não ao usuário) e persistir `nexedu.empresa.syncUserId` consistentemente.
- Migração: reconciliar dados já gravados sob `empresa_id` divergentes (ex.: itens sob `LARIUCCI` vs sob `nome`) para o id canônico. **Requer cuidado — toca dados em produção.**

### Frente 2 — Fonte única do caixa (resolve B, S3)
- Eliminar o fallback `caixaExtratoMovimentos` em `getCaixaResumo` OU garantir que ele nunca seja usado quando há dados reais; renderização e cálculo devem ler **a mesma fonte** (`loadConciliacao`).
- `loadConciliacao` deve fazer **backfill do Supabase** no primeiro load (hoje só lê localStorage), para um navegador novo/limpo não cair em fonte legada.

### Frente 3 — Saldo inicial sincronizado (resolve C, S2)
- Migrar `nexedu.config.contas-bancarias` (ao menos o `saldo_inicial` da conta padrão) para uma tabela/registro sincronizado no Supabase, scoped por `empresa_id`.

---

## 6. Arquivos-Chave (mapa para @dev)

| Arquivo | Papel |
|---------|-------|
| `painel-caixa-escolar/squads/caixa-escolar/dashboard/gdp-api.js` | `getEmpresaId` (L37-61), queries `empresa_id`, camada Supabase |
| `painel-caixa-escolar/squads/caixa-escolar/dashboard/js/gdp-core.js` | `loadConciliacao` (L2496+, só localStorage), boot, `caixaExtratoMovimentos` |
| `painel-caixa-escolar/squads/caixa-escolar/dashboard/js/gdp-pedidos.js` | `getCaixaResumo` (L2023-2038, fonte dupla + saldo inicial), `renderCaixa` |
| `painel-caixa-escolar/squads/caixa-escolar/dashboard/js/gdp-realtime.js` | sync realtime por `empresa_id`, `reconnectWithNewId` |
| `painel-caixa-escolar/squads/caixa-escolar/dashboard/login.html` | onde a identidade/empresa é definida no login |

---

## 7. Riscos e Restrições

- **CRÍTICO — migração de dados em produção:** reconciliar `empresa_id` divergentes pode mesclar/mover registros. Exige **snapshot Supabase antes** (já há backup diário; confirmar PITR/backup de hoje) e plano de rollback. Responsabilidade @devops/@data-engineer.
- **Diagnóstico em produção primeiro:** antes de migrar, é preciso **inspecionar quais `empresa_id` existem hoje** na tabela `conciliacoes` e quantos registros há sob cada um (ex.: `LARIUCCI` vs outros). Isso define a estratégia de merge.
- **Não quebrar Angela:** a conta que hoje está correta não pode perder dados na reconciliação.
- Possível envolvimento de **@data-engineer** (Dara) para a migração de `empresa_id` e o registro sincronizado de saldo inicial.

---

## 8. Próximo Passo Recomendado (antes de implementar)

**Inspeção de produção (read-only)** via Supabase: listar `SELECT empresa_id, count(*) FROM conciliacoes GROUP BY empresa_id;` e idem para `contas_receber`/`contas_pagar`. Isso revela o tamanho real do problema e guia a migração. → @data-engineer ou @devops.

---

## 9. Handoff

→ **@pm (Morgan):** transformar em épico + stories (sugestão: 3 frentes; Frente 1 é P0 e bloqueia as demais; inspeção de produção como story 0 de diagnóstico).
→ Fluxo: **@pm cria stories → @po valida → @data-engineer/@dev implementam → @devops deploya (com snapshot).**

— Atlas, investigando a verdade 🔎
