# Runbook de Descoberta Comercial

Data: 03/03/2026

## Objetivo
Executar a rotina de descoberta com velocidade e consistencia, do preenchimento de entrevistas ate decisao preliminar GO/NO-GO.

## Comando recomendado (ciclo completo)
```powershell
npm.cmd run discovery:cycle
```

## O que o ciclo executa
1. `discovery:validate` - valida formato e consistencia das entrevistas.
2. `discovery:summary` - consolida metricas e decisao sugerida por regra.
3. `discovery:status` - mostra status rapido no terminal.
4. `discovery:plan` - gera plano de sprint para entrevistas restantes.

## Fonte de dados
- `docs/ops/discovery-interviews.json`

## Saidas geradas
- `docs/ops/discovery-summary.json`
- `docs/ops/discovery-summary.md`
- `docs/ops/discovery-go-no-go-draft.md`
- `docs/ops/discovery-sprint-plan.json`
- `docs/ops/discovery-sprint-plan.md`

## Frequencia sugerida
- Rodar no inicio e no fim de cada dia de descoberta.
