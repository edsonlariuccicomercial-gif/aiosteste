# P3 — Status do pedido não muda automaticamente ao faturar

**Severidade:** HIGH · **Tipo:** bug · **Risco do fix:** médio (toca fluxo fiscal + sync)
**Reportado por:** usuário (2026-06-22) · **Diagnóstico:** @analyst (Atlas)

## Comportamento esperado
Ao **faturar** um pedido (emitir NF-e), o status do pedido deve mudar
**automaticamente** para "Faturado" — sem ajuste manual.

## Comportamento atual
Dependendo do caminho de emissão, o status raiz do pedido **não é gravado**, e o
usuário precisa mudar manualmente. Fix anterior não cobriu todos os caminhos.

## Causa raiz
Existem **dois caminhos** de emissão de NF:

1. `gerarNotaFiscalPedido()` — **CORRETO**:
   - `js/gdp-notas-fiscais.js:1269` → `pedido.status = "faturado";`
   - `js/gdp-notas-fiscais.js:1270` → `savePedidos(pedido.id);` (save seletivo)

2. `transmitirHomologacaoNota()` — **BUG**:
   - `js/gdp-notas-fiscais.js:1601-1608` → atualiza só `pedido.fiscal` (campo aninhado de metadados)
   - **NUNCA seta `pedido.status = "faturado"`** no objeto raiz
   - `:1609`, `:1636`, `:1640` → `savePedidos()` / `saveNotasFiscais()` **sem `changedId`**
     (save de TUDO → rajada de upserts → eco realtime que pode reverter status de outros pedidos)

## Evidências (file:line)
- `js/gdp-notas-fiscais.js:1269-1270` — caminho correto (referência do padrão a seguir)
- `js/gdp-notas-fiscais.js:1601-1609` — caminho bugado (só `pedido.fiscal`, sem `pedido.status`, save não-seletivo)
- `js/gdp-notas-fiscais.js:1636,1640` — saves não-seletivos adicionais
- `js/gdp-core.js:1470` — `savePedidos(changedId)` suporta save seletivo
- `js/gdp-core.js:1488` — `saveNotasFiscais(changedId)` suporta save seletivo
- `js/gdp-realtime.js:192-194,227` — supressão de eco + comparação estrita `>` (já presentes)

## Fix proposto
Em `transmitirHomologacaoNota`, no bloco ~`:1601`:

```js
pedido.fiscal = { ...(pedido.fiscal || {}), notaFiscalId: nf.id, tipoNota: "nfe_real",
                  status: nf.status, updatedAt: new Date().toISOString(), updatedBy: getAuditActor() };
// FIX P3: persistir o status RAIZ do pedido (alinhar ao gerarNotaFiscalPedido)
pedido.status = "faturado";
savePedidos(pedido.id);            // seletivo (era savePedidos())
```
E nas demais chamadas do mesmo fluxo:
- `:1636` → `savePedidos(pedido.id)`
- `:1640` → `saveNotasFiscais(nf.id)`

> Considerar gate: só marcar "faturado" quando `_temProvaAut` (chave + protocolo de
> autorização) for verdadeiro — alinhado à lógica de criação de título já existente.
> Validar com @dev/@qa se nota rejeitada deve manter status anterior.

## Critérios de aceite
- [ ] Faturar por QUALQUER caminho (gerar ou transmitir homologação) → pedido fica "Faturado" automaticamente.
- [ ] Status persiste no Supabase (não só local) e não é revertido por eco realtime.
- [ ] Nota rejeitada/sem prova de autorização NÃO marca "faturado".
- [ ] Sem rajada de upserts (saves seletivos por id).

## Entrega
- Bump `?v=` (gdp-notas-fiscais.js), deploy `--force`, Ctrl+Shift+R.
- @qa: testar emissão real e homologação; conferir status no banco após cada caminho.
