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

## Proximas acoes priorizadas
```powershell
npm.cmd run discovery:next
```

## O que o ciclo executa
1. `discovery:validate` - valida formato e consistencia das entrevistas.
2. `discovery:summary` - consolida metricas e decisao sugerida por regra.
3. `discovery:status` - mostra status rapido no terminal.
4. `discovery:plan` - gera plano de sprint para entrevistas restantes.
5. `discovery:day` - gera checklist diario com foco e meta do dia.
6. `discovery:next` - gera lista de acoes prioritarias com base no status atual.

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

## Frequencia sugerida
- Rodar no inicio e no fim de cada dia de descoberta.
