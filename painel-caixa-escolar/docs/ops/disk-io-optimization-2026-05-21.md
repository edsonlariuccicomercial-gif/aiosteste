# Disk I/O Optimization — Supabase Licit-AIX

**Data:** 2026-05-21
**Projeto:** Licit-AIX (`mvvsjaudhbglxttxaeop`)
**Trigger:** Alerta Supabase "disk I/O budget exhaustion"
**Migration:** `supabase/migrations/017_disk_io_optimization.sql`

---

## Problema

O Supabase alertou que o projeto está esgotando o orçamento de I/O de disco.
Consequências se não tratado:
- Tempos de resposta aumentam drasticamente
- CPU sobe por I/O wait
- Instância pode ficar irresponsiva

---

## Causas Raiz Identificadas

| # | Causa | Impacto |
|---|-------|---------|
| 1 | `data_snapshots` — 500KB/dia JSONB append-only, sem cleanup automático | ALTO |
| 2 | `audit_log` — trigger em 7 tabelas, ~140 registros/dia, writes redundantes em updates sem mudança real | ALTO |
| 3 | `preco_historico` — append-only, ~3.000 rows/mês sem partition | ALTO |
| 4 | Sync triplo — 3 sistemas (sync_data + nexedu_sync + tabelas normalizadas) gerando writes duplicados | ALTO |
| 5 | Full table scans em cleanup queries (audit_log e data_snapshots sem index em created_at) | MEDIO |

---

## Solução Aplicada (Migration 017)

### 1. pg_cron — Cleanup automático semanal
- `cleanup-old-snapshots`: domingos 03:00 UTC (retém 90 dias)
- `cleanup-old-audit`: domingos 03:30 UTC (retém 365 dias)

### 2. Audit trigger otimizado
- Skip write se `OLD` = `NEW` (ignorando `updated_at`)
- Redução estimada: 30-40% dos writes no audit_log
- Cenário: app faz re-save do mesmo pedido sem alteração → antes gerava audit, agora não

### 3. Indices adicionais
- `idx_audit_created_at` — acelera DELETE do cleanup
- `idx_snapshots_created_at` — acelera DELETE do cleanup
- `idx_contratos_ativo` — partial index (WHERE deleted_at IS NULL)
- `idx_pedidos_data` — queries por período
- `idx_pedidos_empresa_status` — partial (status em aberto)
- `idx_nfs_empresa_status_pendente` — partial (NFs pendentes)
- `idx_snapshots_recent` — partial (últimos 7 dias para restore)

### 4. Statistics targets aumentados
- `created_at` em tabelas append-only: 500 (padrão é 100)
- `status` em tabelas operacionais: 200

### 5. Fillfactor otimizado
- Tabelas editáveis (pedidos, NFs, contas): **85%** — espaço para HOT updates
- Tabelas append-only (audit, snapshots, preços): **95%** — máximo empacotamento

### 6. Cleanup imediato
- Executa `cleanup_old_snapshots(90)` e `cleanup_old_audit(365)` na hora da migration

---

## Como Aplicar

**Opção A — SQL Editor (Dashboard Supabase):**
1. Abrir Dashboard → SQL Editor
2. Colar conteúdo de `supabase/migrations/017_disk_io_optimization.sql`
3. Executar

**Opção B — CLI:**
```bash
cd painel-caixa-escolar && npx supabase db push
```

---

## O Que NÃO Foi Alterado

- Nenhuma tabela criada/removida
- Nenhuma coluna adicionada/removida
- Nenhuma API serverless modificada
- Frontend inalterado
- Lógica de negócio intacta
- Dados existentes preservados (apenas registros > 90/365 dias são deletados)

---

## Próximos Passos (quando fizer upgrade)

| Ação | Quando | Benefício |
|------|--------|-----------|
| Upgrade compute addon | Quando vender sistema | Mais baseline I/O + RAM |
| Particionar `preco_historico` por mês | Pós-upgrade | Queries mais rápidas, cleanup mais eficiente |
| Deprecar `sync_data` + `nexedu_sync` | Refactor futuro | Elimina writes duplicados (-60% writes) |
| Materializar views de aggregation | Com mais dados | Elimina recalculo a cada query |

---

## Monitoramento

Após aplicar, verificar em 48h:
- Dashboard Supabase → Reports → Disk I/O (deve cair)
- Dashboard → Database → Table sizes (data_snapshots deve diminuir)
- Se alerta persistir após 1 semana → considerar upgrade de compute

---

*Documentado por Atlas (@analyst) — 2026-05-21*
