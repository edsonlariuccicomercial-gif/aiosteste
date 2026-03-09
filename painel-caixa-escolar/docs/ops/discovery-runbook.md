# Runbook de Descoberta Comercial

Data: 03/03/2026

## Objetivo
Executar a rotina de descoberta com velocidade e consistencia, do preenchimento de entrevistas ate decisao preliminar GO/NO-GO.

## Comando recomendado (ciclo completo)
```powershell
npm.cmd run discovery:cycle
```

## Brief diario (inicio do dia)
```powershell
npm.cmd run discovery:day
```

## Abertura do dia (comando unico)
```powershell
npm.cmd run discovery:start-day
```

## Fechamento do dia (comando unico)
```powershell
npm.cmd run discovery:end-day
```

## Proximas acoes priorizadas
```powershell
npm.cmd run discovery:next
```

## Gate de decisao automatica
```powershell
npm.cmd run discovery:go-check
```

## O que o ciclo executa
1. `discovery:validate` - valida formato e consistencia das entrevistas.
2. `discovery:summary` - consolida metricas e decisao sugerida por regra.
3. `discovery:status` - mostra status rapido no terminal.
4. `discovery:plan` - gera plano de sprint para entrevistas restantes.
5. `discovery:day` - gera checklist diario com foco e meta do dia.
6. `discovery:next` - gera lista de acoes prioritarias com base no status atual.
7. `discovery:go-check` - valida criterios minimos e retorna GO/NO-GO.
8. `discovery:start-day` - gera brief, proximas acoes e status em sequencia.
9. `discovery:end-day` - roda ciclo completo, gera relatorio de fechamento e executa gate GO/NO-GO.

## Fonte de dados
- `docs/ops/discovery-interviews.json`

## Saidas geradas
- `docs/ops/discovery-summary.json`
- `docs/ops/discovery-summary.md`
- `docs/ops/discovery-go-no-go-draft.md`
- `docs/ops/discovery-sprint-plan.json`
- `docs/ops/discovery-sprint-plan.md`
- `docs/ops/discovery-daily-brief.md`
- `docs/ops/discovery-next-actions.md`
- `docs/ops/discovery-end-day-report.json`
- `docs/ops/discovery-end-day-report.md`

## Frequencia sugerida
- Rodar no inicio e no fim de cada dia de descoberta.
