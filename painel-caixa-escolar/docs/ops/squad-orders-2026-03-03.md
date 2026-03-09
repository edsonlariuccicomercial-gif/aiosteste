# Ordem de Execucao - Squads (03/03/2026)

## Comando Central (Orion)
- Objetivo: manter operacao em GO e avancar discovery para 2/10 hoje.
- Janela: execucao imediata ate fechamento do dia.

## PM
- Acao: consolidar plano diario com dono e prazo para cada item de discovery.
- Saida esperada: board atualizado + checkpoint de meio de dia.
- Gate: plano publicado e comunicado.

## Nimbus (Analyst/Comercial)
- Acao: recrutar e conduzir 2 entrevistas de 15-20 min.
- Saida esperada: 2 registros completos em `docs/ops/discovery-interviews.json`.
- Gate: campos de dor e disposicao de pagamento preenchidos.

## Dev
- Acao: monitorar saude operacional sem regressao.
- Comandos:
  - `npm.cmd run ops:status`
  - `npm.cmd run exec:status`
- Gate: manter veredito operacional em GO.

## QA
- Acao: validar evidencias de discovery no fechamento.
- Comandos:
  - `npm.cmd run discovery:status`
  - `npm.cmd run discovery:go-check`
- Gate: parecer final GO/NO-GO com justificativa objetiva.

## Checkpoints do dia
1. 12:00 - status de recrutamento e agendas confirmadas.
2. 16:00 - entrevistas concluídas e dados registrados.
3. Fechamento - rodada `discovery:cycle` + parecer QA.
