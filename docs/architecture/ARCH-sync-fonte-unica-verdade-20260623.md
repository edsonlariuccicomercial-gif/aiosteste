# Arquitetura-Alvo: Fonte Única de Verdade & Sincronização

**Autor:** Aria (@architect)
**Data:** 2026-06-23
**Origem:** Handoff `handoff-analyst-to-architect-sync-raceroot-20260623.yaml` (@analyst Atlas)
**Status:** APROVADO PELO STAKEHOLDER — pronto para delegação (@data-engineer + @dev)

---

## 1. Decisões do stakeholder (Edson)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Ritmo da reforma | **Consolidação incremental** (entidade por entidade, validando em prod a cada passo) |
| 2 | Política de conflito | **Last-Write-Wins com timestamp do SERVIDOR** (não do cliente) |
| 3 | Concorrência de NF | **Várias pessoas emitem → P0 crítico**, número server-authoritative |

---

## 2. Princípio arquitetural (a lei que faltava)

> **Cada entidade de negócio tem EXATAMENTE uma fonte de verdade: a tabela dedicada no Supabase.**
> **localStorage é cache de leitura. Nunca é fonte. Escrita SEMPRE por registro, nunca em lote-de-tudo.**
> **O carimbo de tempo que resolve conflito é do SERVIDOR, nunca do navegador.**

Tudo abaixo deriva disso. Qualquer código que viole isso é, por definição, um bug.

---

## 3. Diagnóstico confirmado (resumo do que o @analyst provou + o que eu verifiquei)

**Causa-raiz única:** o sistema tem 3 arquiteturas de sync empilhadas, nenhuma desligada:
1. `sync_data` (KV genérico legado) — ainda contém 45 chaves, incluindo entidades que já têm tabela.
2. Tabelas dedicadas + realtime (`gdp-api.js` + `gdp-realtime.js`).
3. `ProductStore` SSoT (só produtos).

A corrida acontece porque o `updated_at` é **carimbado pelo cliente** e listas inteiras são reenviadas (`saveAll`/`savePedidos()` sem `changedId`) no boot e em re-renders.

**Descoberta favorável (eu verifiquei no banco):** boa parte da solução JÁ EXISTE e foi abandonada:
- ✅ `next_nf_number()` — função atômica com `FOR UPDATE` (migration `00701`) — **existe mas o código NÃO chama** (0 ocorrências de `rpc('next_nf_number')`).
- ✅ Realtime já habilitado em `produtos`, `pedidos`, `notas_fiscais`, etc (migration `026`).
- ✅ Backend de escrita `/api/gdp-data` com `service_role` — funcional.
- ❌ NF hoje pega número via localStorage + "primeiro livre" client-side (`gdp-notas-fiscais.js:840`), e grava campo errado (`ultimo_numero` em vez de `counter`, linha 852) → por isso `nf_counter` parou em 07/abril.

---

## 4. Arquitetura-alvo (estado final)

```
┌─────────────────────────────────────────────────────────────┐
│ NAVEGADOR (cliente)                                          │
│                                                              │
│  Tela ──lê──> cache localStorage (1 chave por entidade)      │
│   │                  ▲                                        │
│   │ escreve (1 reg)  │ realtime aplica (server-time)         │
│   ▼                  │                                        │
│  gdpApi.X.save(reg) ─┴──> /api/gdp-data (service_role)        │
└──────────────────────────────┬───────────────────────────────┘
                               │ upsert 1 registro
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ SUPABASE (fonte única)                                       │
│  • Tabela dedicada por entidade                              │
│  • TRIGGER: updated_at = now() no servidor (BEFORE UPDATE)   │
│  • next_nf_number() RPC atômico p/ NF                        │
│  • Realtime publica CDC → todos os navegadores               │
│  ✗ sync_data: NÃO contém mais entidades com tabela dedicada  │
└─────────────────────────────────────────────────────────────┘
```

**Regra de conflito (LWW server-time):** o trigger sobrescreve `updated_at` com `now()` do servidor em todo INSERT/UPDATE. O cliente nunca define `updated_at`. O `gdp-realtime.js` mantém a regra "só aplica se `remoto.updated_at > local.updated_at`", mas agora os timestamps são confiáveis (mesma fonte de relógio). Combinado com a eliminação do `saveAll` em massa, a corrida desaparece.

---

## 5. Roadmap incremental (cada passo é uma story, validável isolada em prod)

### PASSO 1 — Matar o `saveAll` em massa (pré-requisito de tudo) — `@dev`
**Problema:** `savePedidos()`/`saveNotasFiscais()` sem `changedId` reenviam a lista toda.
**Ação:** tornar `changedId` **obrigatório** em todo caminho que NÃO seja migração explícita. Boot e re-render NUNCA persistem a lista inteira no Supabase (só no cache local, se necessário). Auditar as ~25 chamadas de `saveNotasFiscais()` e as de `savePedidos()`.
**Critério de aceite:** após abrir o sistema sem editar nada, ZERO upserts em massa (verificar que os `updated_at` no Supabase NÃO mudam só por abrir a tela).
**Risco:** baixo. **Reversível:** sim.

### PASSO 2 — `updated_at` server-side via trigger — `@data-engineer`
**Ação:** migration nova: `BEFORE INSERT OR UPDATE` trigger em todas as tabelas de entidade, setando `NEW.updated_at = now()`. Cliente para de enviar `updated_at` (ou o trigger ignora o valor do cliente).
**Critério de aceite:** dois navegadores editando o mesmo pedido — o último a salvar (por relógio do servidor) vence de forma determinística.
**Risco:** médio (mexe em escrita de todas as tabelas). **Validar em staging primeiro.**

### PASSO 3 — NF server-authoritative (P0 — várias pessoas emitem) — `@data-engineer` + `@dev`
**Ação:** `@dev` troca a lógica client-side de "primeiro número livre" pela chamada `gdpApi.nf_counter.next()` → `supabase.rpc('next_nf_number', {p_empresa_id})` (a função JÁ EXISTE, migration 00701). `@data-engineer` valida a função e corrige o `nf_counter` parado (sincronizar `counter` com o último número realmente usado, hoje ~1239+). Remover o caminho `ultimo_numero` (campo errado).
**Critério de aceite:** duas emissões simultâneas NUNCA pegam o mesmo número.
**Risco:** alto (fiscal). **Validar com teste de concorrência antes de prod.**

### PASSO 4 — Desligar `sync_data` para entidades com tabela dedicada — `@dev`
**Ação:** `app-sync.js`/`gdp-core.js cloudSave` param de ESCREVER em `sync_data` as chaves que já têm tabela (`gdp.pedidos.v1`, `gdp.notas-fiscais.v1`, `gdp.contas-*`, `gdp.contratos.v1`, produtos). O `DEDICATED_TABLE_KEYS` (gdp-realtime.js:255) já bloqueia a LEITURA; falta bloquear a ESCRITA. `@data-engineer` faz limpeza one-time das linhas órfãs no `sync_data`.
**Critério de aceite:** nenhuma entidade com tabela dedicada aparece mais sendo escrita no `sync_data`.
**Risco:** médio. **Reversível** (reativar escrita).

### PASSO 5 — Unificar produtos numa chave só — `@architect` (decisão) + `@dev`
**Decisão arquitetural:** a fonte única de produtos será a **tabela `produtos` do Supabase**, espelhada na chave **`intel.central-produtos.v2`** (a que o `gdpApi` e o realtime já usam). O `ProductStore`/`gdp.produtos.v1` passa a **ler dessa mesma fonte** em vez de manter cópia própria.
> Justificativa: `produtos` já está no realtime e no gdpApi (migration 026 + gdp-api.js:53). Mudar a SSoT para `gdp.produtos.v1` exigiria reconfigurar tabela+realtime+backend. Menor risco: alinhar o ProductStore à fonte que já sincroniza.
**Ação `@dev`:** (a) `ProductStore.load()` lê de `intel.central-produtos.v2`; (b) remover/neutralizar `migrarParaCentralV2()` (app-state.js:390) que reescreve no boot; (c) consolidar one-time os 457 vs 241 (reconciliar e gravar na fonte única); (d) aposentar `caixaescolar.banco.v1` e `gdp.estoque-intel.produtos.v1` como fontes de produto.
**Critério de aceite:** contagem de produtos idêntica em ProductStore, gdpApi e tela, e estável entre reloads/navegadores.
**Risco:** médio-alto (dados). **Backup antes.**

### PASSO 6 — Caixa config + limpeza de chaves órfãs P1/P2/P3 — `@dev`
- `caixa_config`: adicionar ao realtime OU recarregar do Supabase no boot sempre (saldo inicial).
- `contratos`: aposentar `caixaescolar.contratos.v1` (legado).
- `pedidos`: unificar `gdp.escola.pedidos` (portal) com `gdp.pedidos.v1`.
- `estoque`: decidir entre `gdp.estoque.movimentos.v1` e `gdp.estoque.v1` (deprecated).
- `orcamentos`: centralizar escrita de `caixaescolar.orcamentos` (3 escritores → 1).

---

## 6. O que NÃO fazer (anti-regressão)

- ❌ Não reintroduzir `saveAll`/persistência de lista inteira "por conveniência".
- ❌ Não carimbar `updated_at` no cliente depois do Passo 2.
- ❌ Não criar uma 4ª camada de sync "nova" — consolidar nas existentes.
- ❌ Não marcar migração como concluída por flag sem aposentar a fonte antiga (foi o erro de produtos).

---

## 7. Delegação

| Passo | Dono | Tipo |
|-------|------|------|
| 1 | @dev | Refactor frontend (changedId obrigatório) |
| 2 | @data-engineer | Migration (trigger updated_at) |
| 3 | @data-engineer + @dev | RPC NF atômico (já existe, religar) — **P0** |
| 4 | @dev + @data-engineer | Desligar sync_data + limpeza |
| 5 | @dev | Unificar produtos (decisão arquitetural já tomada) |
| 6 | @dev | Limpeza P1/P2/P3 |

**Sequência recomendada:** 1 → 2 → 3 (P0) em paralelo lógico, depois 4 → 5 → 6.
**Cada passo:** @dev implementa → @qa valida (incl. teste 2-navegadores) → @devops deploya `--force` → valida em prod → próximo passo.

**Próximo agente:** `@data-engineer` (Dara) para os Passos 2 e 3 (migration do trigger + religar NF atômica), em paralelo com `@dev` no Passo 1.
