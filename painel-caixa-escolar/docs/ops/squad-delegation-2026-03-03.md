# Delegacao de Funcoes - Squads

- Data: 2026-03-03
- Orquestrador: Orion (@aios-master)
- Objetivo do ciclo: manter operacao em GO e destravar discovery (0/10 -> 2/10 hoje)

## Squad PM (Planejamento e Prioridade)
- Responsavel: @pm
- Missao:
  - Travar plano do dia com foco em discovery e evidencias.
  - Confirmar criterio de pronto: 2 entrevistas registradas + `discovery:cycle` executado.
- Entregaveis:
  - Atualizacao do board com status do dia.
  - Lista de prioridades com dono e prazo.
- Comandos sugeridos:
  - `*plan create`
  - `*status`

## Squad Nimbus (Comercial e Recrutamento)
- Responsavel: @analyst (apoio comercial)
- Missao:
  - Executar recrutamento ativo para entrevistas de discovery.
  - Disparar convites e fechar pelo menos 1 entrevista ainda hoje.
- Entregaveis:
  - Contatos abordados e agenda confirmada.
  - Registros em `docs/ops/discovery-interviews.json`.
- Referencias:
  - `docs/ops/discovery-daily-brief.md`
  - `docs/ops/discovery-next-actions.md`

## Squad Dev (Execucao Tecnica)
- Responsavel: @dev
- Missao:
  - Garantir que pipeline operacional siga estavel durante discovery.
  - Preparar qualquer ajuste tecnico necessario sem quebrar o GO.
- Entregaveis:
  - Check de saude operacional sem regressao.
  - Evidencia de comandos executados.
- Comandos:
  - `npm.cmd run ops:status`
  - `npm.cmd run exec:status`

## Squad QA (Validacao e Gate)
- Responsavel: @qa
- Missao:
  - Auditar se evidencias do dia estao completas para decisao.
  - Bloquear fechamento se discovery estiver sem dados minimos.
- Entregaveis:
  - Parecer de risco do ciclo (GO/NO-GO discovery).
  - Checklist de evidencias validado.
- Comandos:
  - `npm.cmd run discovery:status`
  - `npm.cmd run discovery:go-check`

## Sequencia de Execucao (mandatoria)
1. PM fixa plano do dia e donos.
2. Nimbus executa recrutamento e coleta entrevistas.
3. Dev monitora saude operacional em paralelo.
4. QA valida evidencias e publica gate no fechamento.

## Definicao de Sucesso (hoje)
- Discovery: >= 2 entrevistas registradas.
- Operacao: manter `Veredito: GO`.
- Executivo: manter `GO_OPERACIONAL_DISCOVERY_ABERTA` com avanco em discovery.
