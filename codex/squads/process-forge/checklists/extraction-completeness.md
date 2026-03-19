# Checklist: Extraction Completeness (QG-PF-001)

Validacao da Fase 1 — Extracao de Processo.

## Criterios Obrigatorios (BLOCKING)

- [ ] Total de PUs >= 15
- [ ] PU-STEPs >= 5
- [ ] PU-DECISIONs >= 2
- [ ] PU-QUALITY_GATEs >= 1
- [ ] PU-DEPENDENCYs >= 1
- [ ] Lentes cobertas >= 6 de 8
- [ ] Confianca media >= 0.7
- [ ] PUs inferred < 30% do total

## Criterios Recomendados (NON-BLOCKING)

- [ ] Total de PUs >= 25
- [ ] 8/8 lentes cobertas
- [ ] Confianca media >= 0.85
- [ ] PUs inferred < 10%
- [ ] Cada passo tem pelo menos 1 decisao ou excecao explorada
- [ ] Gargalo (bottleneck) identificado
- [ ] Pelo menos 2 PU-TACITs capturados
- [ ] Vocabulario do usuario registrado

## Veto Conditions (AUTO-FAIL)

- [ ] VETO: PUs total < 5
- [ ] VETO: Zero PU-DECISIONs (processo sem decisao = incompleto)
- [ ] VETO: Zero PU-QUALITY_GATEs (processo sem criterio de qualidade = incompleto)
- [ ] VETO: Zero PU-DEPENDENCYs (processo sem dependencia = suspeito)
- [ ] VETO: >50% dos PUs marcados como inferred (extracao superficial)

## Metricas

| Metrica | Valor | Threshold |
|---------|-------|-----------|
| Total PUs | ___ | >=15 |
| PU-STEPs | ___ | >=5 |
| PU-DECISIONs | ___ | >=2 |
| PU-EXCEPTIONs | ___ | >=1 |
| PU-QUALITY_GATEs | ___ | >=1 |
| PU-TACITs | ___ | >=0 |
| Lentes cobertas | ___/8 | >=6 |
| Confianca media | ___ | >=0.7 |
| % Inferred | ___% | <30% |
| Rounds completados | ___ | >=2 |
