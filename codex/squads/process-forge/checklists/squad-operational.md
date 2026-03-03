# Checklist: Squad Operational (QG-PF-005)

Validacao da Fase 5 — Validacao Final.

## Criterios Obrigatorios (BLOCKING)

- [ ] Validacao estrutural PASS (QG-PF-004 confirmado)
- [ ] Smoke test 1 (caminho feliz) executado
- [ ] Smoke test 2 (decisao) executado
- [ ] Smoke test 3 (excecao) executado
- [ ] Pelo menos 2 de 3 smoke tests PASS
- [ ] Usuario aprova o squad gerado

## Criterios Recomendados (NON-BLOCKING)

- [ ] 3/3 smoke tests PASS
- [ ] Usuario nao teve correcoes no walkthrough
- [ ] Squad ativavel via slash command sem erros

## Veto Conditions (AUTO-FAIL)

- [ ] VETO: Usuario rejeita ("nao funciona", "ta errado")
- [ ] VETO: 0/3 smoke tests passam
- [ ] VETO: Validacao estrutural falhou (QG-PF-004 nao passou)
