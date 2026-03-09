# Runbook de Status Executivo

Data: 03/03/2026

## Objetivo
Consolidar em um comando unico o status operacional, discovery, fluxo de sync e frente comercial.

## Comando
```powershell
npm.cmd run exec:status
```

## O que mostra
- Saude operacional (`daily`, `alerts`, `eod`)
- KPIs operacionais-chave
- Distribuicao de status do sync (`fila/enviado/aceito/erro`)
- Progresso de discovery e decisao sugerida
- Quantidade de ofertas comerciais ativas
- Idade da ultima sessao de onboarding

## Veredito
- `GO`: operacao e discovery em estado GO
- `GO_OPERACIONAL_DISCOVERY_ABERTA`: operacao GO e discovery ainda em NO-GO
- `NO-GO`: operacao sem condicao de execucao
