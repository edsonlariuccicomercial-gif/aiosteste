---
task: "Playback Validate"
responsavel: "@forge-chief"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "01-extraction/process-units.yaml, extraction-metrics.yaml"
Saida: "02-process-map/process-map.yaml, dependency-graph.yaml, decision-trees.yaml"
Checklist:
  - "Processo apresentado em formato narrativo (nao YAML bruto)"
  - "Usuario confirmou 'esse e meu processo'"
  - "Todas as correcoes integradas nos PUs"
  - "Nenhum PU com 'usuario discorda' pendente"
execution_type: "interactive"
---

# Task: Playback Validate — Validacao por Apresentacao

**Task ID:** process-forge/playback-validate
**Version:** 1.0.0
**Status:** Production Ready
**Created:** 2026-03-03
**Category:** Validation
**Execution Type:** Interactive

---

## Executive Summary

Fase 2 do pipeline Process Forge. O @forge-chief apresenta o processo extraido de volta pro usuario em formato narrativo legivel. Usuario confirma, corrige ou complementa. Correcoes sao integradas no banco de PUs. So avanca pra Fase 3 quando usuario disser "esse e meu processo".

**Posicao no Workflow:** Fase 2 — Apos Extracao (Fase 1), antes de Arquitetura (Fase 3)
**Definicao de Sucesso:** Usuario confirma explicitamente que o processo esta correto
**Gate:** QG-PF-002 — User Validation

---

## Purpose

A extracao pode ter interpretado algo errado, pulado um detalhe, ou registrado na ordem errada. O Playback e a rede de seguranca: o usuario ve seu processo "de fora" pela primeira vez e pode corrigir antes que vire squad.

Sem Playback, o squad seria construido sobre premissas nao-validadas. Com Playback, o squad e construido sobre o processo que o usuario CONFIRMOU.

---

## Pipeline Visual

```
playback-validate
  |
  v
STEP 1: LOAD EXTRACTION DATA
  Ler PUs + metricas
  |
  v
STEP 2: GENERATE NARRATIVE
  Transformar PUs em narrativa legivel
  |
  v
STEP 3: PRESENT TO USER
  Mostrar processo + pedir confirmacao
  |
  v
STEP 4: COLLECT CORRECTIONS (loop)
  Usuario corrige -> integrar -> re-apresentar
  |
  v
STEP 5: GENERATE PROCESS MAP
  Consolidar processo validado
  |
  v
QUALITY GATE: QG-PF-002
  Usuario confirmou
  |
  v
HANDOFF -> architect-squad
```

---

## Step-by-Step Execution

### Step 1: Load Extraction Data

Ler:
- `01-extraction/process-units.yaml` — todos os PUs
- `01-extraction/extraction-metrics.yaml` — metricas

### Step 2: Generate Narrative

Transformar PUs em formato narrativo. NAO mostrar YAML pro usuario.

**Formato da Narrativa:**

```
=== SEU PROCESSO: {nome} ===

{descricao em 2-3 frases}

Trigger: {o que inicia}
Duracao estimada: {tempo total}
Total de passos: {N}

─── FLUXO ────────────────────────────

1. {Nome do Passo 1} ({tempo}, {executor_icon})
   {Descricao do que faz}
   Usa: {ferramentas}
   Precisa: {inputs}
   Produz: {outputs}

   {Se tem decisao:}
   ⚡ Decisao: {condicao}
      → Se sim: {branch A}
      → Se nao: {branch B}

   {Se tem excecao:}
   ⚠️ Se der errado: {trigger} → {response}

2. {Nome do Passo 2} ({tempo}, {executor_icon})
   ...

─── QUALITY CHECKS ───────────────────

✅ Apos passo {N}: {criterio}
✅ Apos passo {M}: {criterio}

─── GARGALO ──────────────────────────

🔗 O passo {N} e o mais lento/critico do processo.

─── CONHECIMENTO TACITO ──────────────

🧠 {Heuristica ou intuicao registrada}

─── METRICAS ─────────────────────────

PUs extraidos: {N}
Lentes cobertas: {X}/8
Confianca media: {0.XX}
```

**Legenda de executor icons:**
- 👤 = Human (so voce faz)
- 🤖 = Agent (IA pode fazer)
- 🤝 = Hybrid (IA prepara, voce revisa)
- ⚙️ = Worker (automacao)

### Step 3: Present and Ask

```yaml
elicit: true
prompt: |
  {narrativa gerada no Step 2}

  ───────────────────────────────────

  Esse e o seu processo como eu entendi.

  Me diz:
  - Isso bate com sua realidade?
  - Tem algo ERRADO?
  - Tem algo que FALTA?
  - A ordem ta certa?
type: "free_text"
```

### Step 4: Collect and Integrate Corrections

**Se usuario confirma ("ta certo", "bate", "isso mesmo"):**
- Marcar todos os PUs como `user_confirmed: true`
- Prosseguir para Step 5

**Se usuario corrige:**

Para cada correcao:
1. Identificar qual PU afeta
2. Atualizar o PU (content, confidence → 1.0)
3. Se correcao cria novo PU, adicionar ao banco
4. Se correcao remove PU, marcar como invalidado

Apos integrar correcoes:

```yaml
elicit: true
prompt: |
  Integrei as correcoes:
  {lista do que mudou}

  {Re-apresentar trecho afetado}

  Agora ta certo?
type: "confirmation"
```

**Loop:** Repetir ate usuario confirmar. Maximo 5 iteracoes de correcao.

### Step 5: Generate Process Map

Consolidar tudo em `02-process-map/process-map.yaml` usando template `templates/process-map-tmpl.yaml`.

Campos preenchidos a partir dos PUs validados:
- Sequencia de passos com todos os detalhes
- Arvore de decisoes
- Catalogo de excecoes
- Quality gates
- Grafo de dependencias
- Conhecimento tacito
- Metricas de validacao

### Step 6: Quality Gate — QG-PF-002

**Criterios:**

| Criterio | Obrigatorio |
|----------|-------------|
| Usuario disse "esse e meu processo" (ou equivalente) | Sim |
| Todas as correcoes integradas | Sim |
| Nenhum PU marcado como "usuario discorda" | Sim |

**Veto conditions:**
- Usuario rejeitou o processo ("nao e isso")
- Correcoes pendentes nao integradas

**Se QG-PF-002 nao passou:**
- Se usuario rejeitou: voltar pra extract-process com perguntas cirurgicas
- Se correcoes pendentes: integrar e re-apresentar

### Step 7: Handoff

```
Processo validado. {process_name} agora existe fora da sua cabeca.

{N} PUs confirmados.
Process map salvo em minds/{slug}/02-process-map/.

Proximo passo: @forge-smith vai transformar isso em squad AIOS.
```

---

## Outputs

| Arquivo | Conteudo |
|---------|----------|
| `02-process-map/process-map.yaml` | Processo validado completo |
| `02-process-map/dependency-graph.yaml` | Grafo de dependencias |
| `02-process-map/decision-trees.yaml` | Arvores de decisao |
| `01-extraction/process-units.yaml` | PUs atualizados (user_confirmed) |

---

## Error Handling

| Cenario | Acao |
|---------|------|
| Usuario discorda de tudo | Voltar pra extracao. "Parece que preciso refazer. Vamos de novo." |
| Correcoes contradizem entre si | Perguntar: "Voce disse X antes e Y agora. Qual e a regra real?" |
| Usuario quer adicionar processo novo | Separar: "Isso parece ser outro processo. Vamos terminar esse e depois fazemos o outro." |
| 5 iteracoes sem convergencia | Salvar estado. "Processo complexo. Vamos pausar e retomar com mente fresca." |

---

**Task Status:** Ready for Production
