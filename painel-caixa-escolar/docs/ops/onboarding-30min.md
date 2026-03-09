# Onboarding Operacional em 30 Minutos

Data: 02/03/2026

## Objetivo
Colocar um novo fornecedor em operacao com rotina diaria funcional, sem dependencia tecnica externa.

## Comando unico (inicio da sessao)
```powershell
npm.cmd run onboarding:start
```

Saidas geradas:
- `docs/ops/onboarding-session.json`
- `docs/ops/onboarding-session.md`

## Estrutura de tempo

1. Bloco 1 (0-10 min): acesso, credenciais e ambiente.
2. Bloco 2 (10-20 min): primeira rodada operacional.
3. Bloco 3 (20-30 min): leitura de indicadores e acao.

## Passo a passo

### 1) Preparacao (0-10 min)
- Configurar credenciais SGD (`SGD_DOC`/`SGD_CNPJ` e `SGD_PASS`).
- Validar acesso local ao projeto.
- Confirmar objetivo do dia (SREs foco e volume alvo).

### 2) Primeira rodada (10-20 min)
- Rodar pipeline consolidado:
```powershell
npm.cmd run ops:daily:collect
```
- Confirmar que relatorios foram gerados:
  - `dashboard/data/ops-daily-run-report.json`
  - `docs/ops/ops-daily-last-run.md`

### 3) Execucao guiada (20-30 min)
- Abrir dashboard:
```powershell
npm.cmd run dashboard:serve
```
- Filtrar cotacoes por SRE/municipio prioritario.
- Exportar urgentes e iniciar tratativa de itens <= 48h.

## Criterios de sucesso do onboarding

- Pipeline `ops:daily:collect` concluido sem erro.
- Cobertura SKU >= 95%.
- Operador consegue gerar lista de urgentes sem suporte.

## Escalonamento

- Se coleta retornar 0 cotacoes: revisar credencial e artefatos em `.aios/sgd-audit-logged/`.
- Se cobertura SKU < meta: curar `object-sku-rules.json` e rerodar auditoria.
- Se dashboard ficar sem referencias de preco: rerodar `dashboard:history:build/summary`.
