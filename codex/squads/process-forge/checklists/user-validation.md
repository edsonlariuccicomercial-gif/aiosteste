# Checklist: User Validation (QG-PF-002)

Validacao da Fase 2 — Playback Validation.

## Criterios Obrigatorios (BLOCKING)

- [ ] Processo apresentado em formato narrativo legivel (nao YAML bruto)
- [ ] Usuario disse "esse e meu processo" (ou equivalente explicito)
- [ ] Todas as correcoes do usuario integradas nos PUs
- [ ] Nenhum PU marcado como "usuario discorda" pendente
- [ ] Process map gerado em 02-process-map/

## Criterios Recomendados (NON-BLOCKING)

- [ ] Correcoes feitas em <= 3 iteracoes
- [ ] Usuario adicionou detalhes novos (sinal de engajamento)
- [ ] Vocabulario do usuario preservado na narrativa

## Veto Conditions (AUTO-FAIL)

- [ ] VETO: Usuario rejeitou o processo ("nao e isso", "ta errado")
- [ ] VETO: Correcoes pendentes nao integradas
- [ ] VETO: Playback apresentado em YAML bruto (sem narrativa)
