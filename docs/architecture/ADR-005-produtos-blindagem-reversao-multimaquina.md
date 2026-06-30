# ADR-005 — Central de Produtos: blindagem contra reversão multi-máquina (blob sync_data legado)

- **Status:** Proposto (aguardando implementação @dev + @data-engineer)
- **Data:** 2026-06-30
- **Autor:** @architect (Aria), a partir da investigação de @analyst → @data-engineer → @dev
- **Relacionado:** ADR-003 (mesma doença, curada para conciliação), ADR-004 (Central de Produtos → tabela como fonte única)

## Contexto

Após o ADR-004 (hoje, 2026-06-30) a Central de Produtos passou a escrever na tabela Supabase `produtos`. Porém o usuário relatou que **as alterações de produtos persistem por HORAS e depois regridem para exatamente 214 produtos de 23/jun**, em ambiente **multi-máquina** ("uso o painel em mais de um computador; o sistema é online e deveria atualizar todas as máquinas na hora").

### Prova empírica coletada (multicamada, runtime logado)

1. Backend `/api/gdp-data` (service_role) escreve E deleta produtos: **HTTP 200, persiste** (testes P1-P3, logado como `angela`).
2. `gdpApi.produtos.save` → `mapToTable` → backend: **persiste**; `mapToTable` descarta corretamente campos inexistentes (`ativo`).
3. `ProductStore.save` → `_pushToTable`: **persiste**.
4. `migrarParaSSoT` tem **gate** que impede reduzir contagem → **não é o vetor** (P4).
5. Backfill (`gdp-init.js:3325`) só roda com `_remoteCount===0` → tabela tem 214 → **não roda** (P5).
6. `_mergeTable` do boot **adiciona** (preserva remoto + localOnly) → **não reduz** (P6).
7. Tabela: 214 linhas, **todas `updated_at` de 2026-06-23**. Blob `sync_data` `gdp.estoque-intel.produtos.v1` tocado **hoje 12:59** → prova de outra máquina ativa.

## Causa raiz (decisão arquitetural)

`gdp.produtos.v1` está em **dois conjuntos contraditórios** em `gdp-core.js`:

- **`_SUPABASE_TABLE_KEYS`** (linha 161) — "tem tabela dedicada; `syncToCloud` PULA". ✅ correto (ADR-004).
- **`GDP_SYNC_KEYS`** (linha 162) — lista de chaves que sobem/descem como **blob `sync_data`**. ❌ `gdp.produtos.v1` AINDA está aqui.

E no realtime (`gdp-realtime.js`), o guard `DEDICATED_TABLE_KEYS` (linha 420) — que impede o blob `sync_data` de sobrescrever chaves com tabela dedicada — **NÃO inclui `gdp.produtos.v1`**.

### Ciclo destrutivo (reconcilia "regride horas depois", multi-máquina)

```
Máquina B (código PRÉ-ADR-004, _SUPABASE_TABLE_KEYS sem produtos)
  → syncToCloud escreve sync_data[key='gdp.produtos.v1'] = {214 antigos}
  → Supabase realtime emite evento sync_data para TODAS as máquinas
  → handleSyncDataChange NÃO pula produtos (falta em DEDICATED_TABLE_KEYS)
  → localStorage.setItem('gdp.produtos.v1', {214 antigos})  ← REVERSÃO
  → reloadFromLocalSilent / próximo render mostra 214
```

É **a mesma doença do ADR-003** (blob `sync_data` legado sobrescrevendo o estado bom), que lá foi curada para conciliação/extratos e **aqui não foi aplicada a produtos**.

## Decisão

Aplicar o **mesmo padrão do ADR-003** (fonte única = tabela; aposentar o blob legado) a produtos, em camadas de defesa:

### Camada 1 — Realtime: proteger a chave dedicada (correção primária, @dev)
`gdp-realtime.js` → adicionar `'gdp.produtos.v1': true` ao `DEDICATED_TABLE_KEYS` (linha ~420). Assim `handleSyncDataChange` **ignora** qualquer evento `sync_data` para produtos — o blob legado nunca mais sobrescreve a Central. (Espelha exatamente o que já protege contratos/pedidos/NF/conciliação.)

### Camada 2 — Cloud sync: parar de PRODUZIR o blob legado (@dev)
`gdp-core.js` → remover `"gdp.produtos.v1"` de `GDP_SYNC_KEYS` (linha 162). Mantém em `_SUPABASE_TABLE_KEYS` e `_GDPAPI_KEYS`. Resultado: nenhuma máquina **atualizada** sobe produtos como blob. (As máquinas antigas só param após Ctrl+Shift+R / novo deploy — por isso a Camada 1 é a que blinda imediatamente, independente da versão das outras máquinas.)

### Camada 3 — Realtime correto (pull-da-tabela) para produtos (@dev)
Requisito do usuário ("sistema é online, deve atualizar todas na hora"). O handler de **entidade** `produtos` (tabela dedicada) já trata INSERT/UPDATE/DELETE item-a-item a partir do payload do evento (`handleEntityChange`) — ou seja, **um cadastro numa máquina já propaga via evento da tabela `produtos`**. Garantir que: (a) a subscrição da tabela `produtos` está ativa (ENTITY_TABLES inclui — confirmado linha 17); (b) após aplicar a Camada 1, o caminho de entidade vira o ÚNICO que toca produtos no realtime → propagação correta e sem reversão.

### Camada 4 — Limpeza do blob órfão no Supabase (@data-engineer)
Deletar os registros `sync_data` legados de produtos que ainda re-enchem o local:
`key IN ('intel.central-produtos.v2', 'gdp.estoque-intel.produtos.v1'[se usado p/ Central], 'gdp.produtos.v1')` na tabela `sync_data` (user_id LARIUCCI / Lariucci). **Cautela:** `gdp.estoque-intel.produtos.v1` pode pertencer ao módulo Estoque-Intel (não à Central) — validar antes de deletar; se for do Estoque, NÃO deletar, apenas garantir que a Camada 1 impede que ele toque `gdp.produtos.v1`. Backup antes (snapshot).

## Consequências

- **Positivas:** produtos passa a ser fonte única real (tabela); reversão multi-máquina eliminada na Camada 1 (imediata, independe da versão das outras máquinas); realtime propaga cadastros corretamente; alinhamento com ADR-003/ADR-004.
- **Custos/riscos:** baixo. Camadas 1-2 são remoções/adições em listas (mesmo padrão já validado para outras entidades). Risco residual: máquinas antigas continuam tentando subir blob até atualizarem — **mitigado pela Camada 1** (receptores ignoram). Camada 4 exige cuidado com a chave do Estoque-Intel.
- **Não-objetivo:** não recupera os dados de hoje já perdidos (tabela só tem os 214 de 23/jun). Recuperação possível só se houver localStorage >214 na máquina onde o usuário cadastrou hoje (checar antes de refazer).

## Validação (gate — multi-máquina)

1. Aplicar Camadas 1-2, bump de versão (`gdp-core`, `gdp-realtime`), deploy `--force`.
2. Máquina A (logada, Ctrl+Shift+R): cadastrar produto novo → aparece e PERSISTE.
3. Máquina B (logada, Ctrl+Shift+R): o produto novo aparece **na hora** (realtime de entidade).
4. Aguardar (simular "horas"): forçar um evento `sync_data` de produtos (ou deixar máquina antiga ativa) → produto **NÃO regride** (Camada 1 ignora).
5. Excluir produto na Máquina A → some na B na hora e **não ressuscita**.
6. Conferir tabela: linhas com `updated_at` do dia do teste sobrevivem.

## Plano de execução (fluxo de agentes)

1. **@data-engineer:** snapshot `sync_data`; validar origem de `gdp.estoque-intel.produtos.v1`; Camada 4 (limpeza do blob de produtos) com rollback.
2. **@dev:** Camadas 1-3 (gdp-realtime: `DEDICATED_TABLE_KEYS` += produtos; gdp-core: `GDP_SYNC_KEYS` −= produtos; verificar handler de entidade); bump versões; CodeRabbit.
3. **@qa:** validar na tela, **logado, em DUAS máquinas/abas** (gate multi-máquina acima).
4. **@devops:** deploy `npx vercel --prod --force`.
