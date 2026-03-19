---
task: "Extract Process"
responsavel: "@process-archaeologist"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "process_slug, process_name, scope (do start.md)"
Saida: "01-extraction/process-units.yaml, extraction-metrics.yaml, round-*.md"
Checklist:
  - ">=15 PUs extraidos"
  - ">=5 PU-STEPs"
  - ">=2 PU-DECISIONs"
  - ">=1 PU-QUALITY_GATE"
  - ">=1 PU-DEPENDENCY"
  - "6/8 lentes cobertas"
  - "Confianca media >=0.7"
  - "<30% PUs inferred"
execution_type: "interactive"
---

# Task: Extract Process — Extracao Iterativa de Processo

**Task ID:** process-forge/extract-process
**Version:** 1.0.0
**Status:** Production Ready
**Created:** 2026-03-03
**Category:** Knowledge Extraction
**Execution Type:** Interactive

---

## Executive Summary

Fase 1 do pipeline Process Forge. O @process-archaeologist conduz entrevista iterativa em N rounds usando 8 lentes de extracao. Cada round explora angulos diferentes do processo. Entre rounds, analisa gaps e gera perguntas cirurgicas. Output: banco de Process Units (PUs) estruturado.

**Posicao no Workflow:** Fase 1 — Apos Setup (Fase 0), antes de Playback (Fase 2)
**Definicao de Sucesso:** >=15 PUs, 6/8 lentes cobertas, confianca media >=0.7
**Gate:** QG-PF-001 — Extraction Completeness

---

## Purpose

Processos complexos nao saem da cabeca de ninguem com meia duzia de perguntas. Esta task conduz uma extracao profunda e iterativa — cada round vai mais fundo, cada gap gera perguntas novas, cada PU e validado contra regras de qualidade.

A extracao NAO e um formulario. E uma CONVERSA guiada por 8 lentes que garantem cobertura completa: visao geral, passos, decisoes, excecoes, I/O, qualidade, dependencias e tacito.

---

## Pipeline Visual

```
extract-process
  |
  v
ROUND 1: EXPLORACAO (L1 + L2)
  Visao geral + sequencia de passos
  15-30 min | Output: ~50% completo
  |
  v
GAP ANALYSIS
  Identificar lacunas, gerar perguntas
  |
  v
ROUND 2: PROFUNDIDADE (L3 + L4 + L5)
  Decisoes + excecoes + inputs/outputs
  15-30 min | Output: ~75% completo
  |
  v
GAP ANALYSIS
  |
  v
ROUND 3: PRECISAO (L6 + L7 + L8)
  Qualidade + dependencias + tacito
  10-20 min | Output: ~90% completo
  |
  v
GAP ANALYSIS
  |
  v
ROUND N: CIRURGICO (gap-driven)
  Perguntas cirurgicas nos gaps
  5-15 min | Output: >=95%
  Repete ate completude >= 0.95
  |
  v
QUALITY GATE: QG-PF-001
  >=15 PUs, 6/8 lentes, confianca >=0.7
  |
  v
HANDOFF -> playback-validate
```

---

## Step-by-Step Execution

### Step 1: Round 1 — Exploracao (L1 + L2)

**Agente:** @process-archaeologist
**Lentes:** L1 (Visao Geral) + L2 (Sequencia)
**Duracao:** 15-30 min
**Referencia:** `data/extraction-lenses.yaml`

```yaml
elicit: true
prompt: |
  === ROUND 1: EXPLORACAO ===

  Vou comecar entendendo o macro do seu processo e depois os passos.

  Me descreve esse processo como se eu fosse alguem que nunca viu.
  Comeca com: o que dispara ele? O que acontece primeiro?
type: "conversation"
rounds: "2-5 trocas de mensagens"
```

**O Archaeologist neste round:**

1. Explorar L1 (visao geral): trigger, endpoint, frequencia, contexto, participantes
2. Explorar L2 (sequencia): passo a passo, duracao, ferramentas
3. Numerar passos conforme usuario descreve
4. Registrar vocabulario do usuario
5. Marcar pontos que precisam de L3+ (decisoes, excecoes)

**Salvar em:** `01-extraction/round-1-exploration.md`

**PUs gerados neste round:**
- PU-STEP para cada passo identificado
- PU-INPUT/OUTPUT quando mencionados
- Confidence: 0.7-0.9 (confirmacao direta do usuario)

### Step 2: Gap Analysis 1

**Agente:** @process-archaeologist (automatico)

Analisar PUs do Round 1:

```yaml
gap_analysis:
  steps_found: N
  steps_without_decisions: [list]
  steps_without_exceptions: [list]
  steps_without_io: [list]
  lens_coverage: "2/8"
  completeness: "~0.50"
  next_round_focus: "L3 (decisoes nos passos {list}) + L4 (excecoes) + L5 (I/O)"
```

Mostrar ao usuario:

```
=== FIM DO ROUND 1 ===

Capturei {N} passos do seu processo.
Sequencia basica mapeada.

Agora vou aprofundar: decisoes, excecoes e materiais.
```

### Step 3: Round 2 — Profundidade (L3 + L4 + L5)

**Agente:** @process-archaeologist
**Lentes:** L3 (Decisoes) + L4 (Excecoes) + L5 (Inputs/Outputs)
**Duracao:** 15-30 min

```yaml
elicit: true
prompt: |
  === ROUND 2: PROFUNDIDADE ===

  Agora vou investigar as decisoes, problemas e materiais do seu processo.

  Comecando pelo passo {N mais critico}:
  {pergunta especifica de L3, L4 ou L5 baseada nos gaps}
type: "conversation"
rounds: "3-5 trocas de mensagens"
```

**O Archaeologist neste round:**

1. Para cada passo com decisao pendente: aplicar L3
2. Para passos criticos: aplicar L4 (o que da errado?)
3. Para todos os passos: aplicar L5 (o que entra, o que sai?)
4. Usar tecnica "5 Whys" quando usuario diz "depende"
5. Usar tecnica "O Cenario" quando usuario e abstrato
6. Usar tecnica "O Gemba" quando passo envolve ferramenta/tela — pedir pra MOSTRAR

**PUs gerados neste round:**
- PU-DECISION para cada bifurcacao
- PU-EXCEPTION para cada falha/plano B
- PU-INPUT e PU-OUTPUT para cada passo

### Step 4: Gap Analysis 2

Repetir analise. Mostrar progresso:

```
=== FIM DO ROUND 2 ===

Capturei:
- {X} passos
- {Y} decisoes
- {Z} excecoes
- {W} inputs/outputs

Lentes cobertas: {N}/8
Completude estimada: ~75%

Proximo round: criterios de qualidade, dependencias e conhecimento tacito.
```

### Step 5: Round 3 — Precisao (L6 + L7 + L8)

**Agente:** @process-archaeologist
**Lentes:** L6 (Qualidade) + L7 (Dependencias) + L8 (Tacito)
**Duracao:** 10-20 min

```yaml
elicit: true
prompt: |
  === ROUND 3: PRECISAO ===

  Ultimo round principal. Vou investigar qualidade, dependencias e conhecimento tacito.

  {pergunta de L6, L7 ou L8 baseada nos gaps}
type: "conversation"
rounds: "2-4 trocas de mensagens"
```

**O Archaeologist neste round:**

1. L6: criterios de qualidade pra cada passo critico
2. L7: dependencias, gargalo, paralelismo
3. L8: conhecimento tacito, intuicao, regras informais
4. Usar tecnica "O Observador" pra tacito
5. Usar tecnica "O Gargalo" pra dependencias

**PUs gerados neste round:**
- PU-QUALITY_GATE para cada criterio
- PU-DEPENDENCY para cada relacao
- PU-TACIT para cada conhecimento nao-articulado

### Step 6: Gap Analysis 3 + Decisao

```yaml
gap_analysis:
  total_pus: N
  lens_coverage: "X/8"
  completeness: "~0.90"
  remaining_gaps: [list]
  recommendation: "Round cirurgico focado em {gaps}" | "Extracao completa"
```

**Se completude >= 0.95:**
- Prosseguir para QG-PF-001

**Se completude < 0.95:**
- Perguntar ao usuario:

```yaml
elicit: true
prompt: |
  Processo ta {X}% mapeado. Ainda tem {N} gaps:
  {lista de gaps}

  Quer que eu faca mais 1 round cirurgico (~5-10 min) pra fechar?
  Ou o que temos ja e suficiente?
type: "choice"
options: ["Sim, mais 1 round", "Suficiente, vamos em frente"]
```

### Step 7: Round N — Cirurgico (se necessario)

Perguntas especificas geradas pela gap analysis. So os gaps. 5-15 min.

### Step 8: Quality Gate — QG-PF-001

**Criterios:**

| Criterio | Minimo | Ideal |
|----------|--------|-------|
| Total PUs | >=15 | >=25 |
| Lentes cobertas | 6/8 | 8/8 |
| Confianca media | >=0.7 | >=0.85 |
| PU-STEPs | >=5 | >=10 |
| PU-DECISIONs | >=2 | >=5 |
| PU-QUALITY_GATEs | >=1 | >=3 |
| PU-DEPENDENCYs | >=1 | >=3 |
| PUs inferred | <30% | <10% |
| Passos sem decisao explorada | <3 | 0 |

**Veto conditions (BLOQUEANTE):**
- PUs total < 5
- Zero PU-DECISIONs
- Zero PU-QUALITY_GATEs (processo sem criterio de qualidade = incompleto)
- Zero PU-DEPENDENCYs (processo sem dependencia = suspeito)
- >50% dos PUs sao inferred

**Se QG-PF-001 nao passou:**
- Informar o que falta
- Oferecer round cirurgico adicional
- Se usuario recusar, registrar warning e prosseguir (non-blocking override)

### Step 9: Consolidar e Handoff

Gerar arquivos finais:

```yaml
# 01-extraction/process-units.yaml
metadata:
  process_slug: "{slug}"
  total_pus: N
  rounds_completed: N
  lens_coverage: "X/8"
  average_confidence: 0.XX
  completeness: 0.XX
  extracted_at: "{timestamp}"

units:
  - pu_id: "PU-{slug}-001"
    type: STEP
    content: "..."
    # ... todos os PUs
```

```yaml
# 01-extraction/extraction-metrics.yaml
rounds: N
duration_minutes: N
pus_by_type: {STEP: N, DECISION: N, ...}
pus_by_round: {R1: N, R2: N, ...}
lens_coverage: {L1: true, L2: true, ...}
gaps_remaining: [list]
qg_pf_001: "PASS|FAIL"
```

Handoff para @forge-chief com mensagem:

```
Extracao completa.

{N} PUs extraidos em {N} rounds.
{X}/8 lentes cobertas.
Confianca media: {0.XX}

Quality Gate QG-PF-001: {PASS/FAIL}

Proximo passo: Playback Validation — apresentar processo pro usuario confirmar.
```

---

## Outputs

| Arquivo | Conteudo |
|---------|----------|
| `01-extraction/round-1-exploration.md` | Transcricao Round 1 |
| `01-extraction/round-2-depth.md` | Transcricao Round 2 |
| `01-extraction/round-3-precision.md` | Transcricao Round 3 |
| `01-extraction/round-N-surgical.md` | Rounds cirurgicos |
| `01-extraction/process-units.yaml` | Banco de PUs estruturado |
| `01-extraction/gap-report.yaml` | Gaps detectados |
| `01-extraction/extraction-metrics.yaml` | Metricas gerais |

---

## Error Handling

| Cenario | Acao |
|---------|------|
| Usuario cansa | Pausar. "Retomamos na proxima." State salvo. |
| Respostas vagas | Pedir exemplo: "Me conta da ultima vez..." |
| Processo muda durante extracao | Registrar ambas versoes. Perguntar qual e a atual. |
| Muitos gaps apos 4 rounds | Aceitar como esta. Registrar gaps. Playback mostrara. |

---

**Task Status:** Ready for Production
