# Checklist: Architecture Coherence (QG-PF-003)

Validacao da Fase 3 — Arquitetura do Squad.

## Criterios Obrigatorios (BLOCKING)

- [ ] 1-7 agentes definidos (nem 0, nem >7)
- [ ] Cada agente tem rationale documentado (por que existe)
- [ ] Cada PU-STEP mapeado para exatamente 1 task
- [ ] Cada PU-DECISION mapeado para decision point em task ou quality gate
- [ ] Sem dependencia circular no grafo de tasks
- [ ] Cada task tem 1 agente responsavel atribuido
- [ ] Human touchpoints identificados explicitamente
- [ ] Bottleneck do processo abordado no design do workflow

## Criterios Recomendados (NON-BLOCKING)

- [ ] Tasks paralelas identificadas (se aplicavel)
- [ ] PU-EXCEPTIONs mapeadas para error handling nas tasks
- [ ] PU-TACITs convertidos em STRICT RULES dos agentes
- [ ] Executor classification justificada por passo

## Veto Conditions (AUTO-FAIL)

- [ ] VETO: 0 tasks geradas
- [ ] VETO: Dependencia circular detectada
- [ ] VETO: >50% das tasks sao Hybrid (decomposicao confusa)
- [ ] VETO: PU-STEP orfao (nao mapeado pra nenhuma task)
