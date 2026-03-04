# Runbook Operacional Diario (15 min)

Data de consolidacao: 02/03/2026

## Objetivo
Executar a rotina diaria de priorizacao e envio com evidencias objetivas, minimizando risco de perda de prazo.

## Tempo-alvo
- Meta total: <= 15 minutos.

## Pre-condicoes
- Credenciais SGD configuradas (`SGD_DOC`/`SGD_CNPJ` e `SGD_PASS`).
- Ambiente Node funcional no projeto.

## Sequencia operacional
### Abertura do dia (recomendado)
```powershell
npm.cmd run ops:start-day
```

### Abertura do dia com coleta
```powershell
npm.cmd run ops:start-day:collect
```

### Fechamento do dia (recomendado)
```powershell
npm.cmd run ops:end-day
```

### Fechamento do dia com coleta
```powershell
npm.cmd run ops:end-day:collect
```

### Monitoramento proativo (com alertas)
```powershell
npm.cmd run ops:monitor
```

### Monitoramento proativo com coleta
```powershell
npm.cmd run ops:monitor:collect
```

### Fechar turno e gerar handoff (recomendado)
```powershell
npm.cmd run ops:close-shift
```

### Gerar somente handoff
```powershell
npm.cmd run ops:handoff
```

### Atualizar tendencia operacional
```powershell
npm.cmd run ops:trend
```

### Modo rapido (recomendado)
```powershell
npm.cmd run ops:daily
```

### Modo completo (com coleta no inicio)
```powershell
npm.cmd run ops:daily:collect
```

### Modo manual (detalhado)
1. Atualizar base de cotacoes.
```powershell
npm.cmd run dashboard:collect
```
2. Rodar auditorias de qualidade de dados.
```powershell
npm.cmd run dashboard:audit:territory
npm.cmd run dashboard:audit:sku
npm.cmd run dashboard:validate:sku
```
3. Gerar snapshot operacional do dia.
```powershell
npm.cmd run dashboard:snapshot:daily
```
4. Exportar CSV de urgentes (<= 48h).
```powershell
npm.cmd run dashboard:export:urgent
```
5. Abrir dashboard e executar a lista priorizada.
```powershell
npm.cmd run dashboard:serve
```

## Artefatos esperados
- `dashboard/data/operational-daily-snapshot.json`
- `dashboard/data/operational-urgent.csv`
- `dashboard/data/ops-daily-run-report.json`
- `dashboard/data/ops-eod-summary.json`
- `dashboard/data/ops-alerts.json`
- `dashboard/data/ops-handoff.json`
- `dashboard/data/ops-trend-history.json`
- `docs/ops/ops-daily-last-run.md`
- `docs/ops/ops-daily-eod.md`
- `docs/ops/ops-alerts.md`
- `docs/ops/handoff-next-shift.md`
- `docs/ops/ops-weekly-trend.md`

## Regra de decisao
- Se `urgent48h > 0`: tratar todos os itens urgentes primeiro.
- Se `actionableQuotes = 0`: registrar "sem acionaveis" e encerrar rotina.
- Se validacao SKU reprovar: nao seguir para envio ate corrigir regras de objeto/SKU.

## Incidentes e contingencia
- Coleta com `0` cotacoes: verificar artefatos de diagnostico em `.aios/sgd-audit-logged/`.
- Falha no snapshot/export: rerodar etapa 3 e 4; se persistir, abrir incidente tecnico com log da execucao.
