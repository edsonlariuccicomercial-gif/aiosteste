---
task: "Assemble Squad"
responsavel: "@forge-smith"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "03-blueprint/squad-blueprint.yaml"
Saida: "04-squad/ (diretorio completo do squad AIOS)"
Checklist:
  - "squad.yaml valido (name kebab-case + version semver)"
  - "agents/ com >=1 .md com frontmatter ou heading"
  - "tasks/ com >=1 .md com 8 campos TASK-FORMAT-SPEC-V1"
  - "workflows/ com YAML valido e fluxo unidirecional"
  - "Todos os arquivos referenciados em config existem"
  - "Sem dependencia circular"
execution_type: "semantic"
---

# Task: Assemble Squad — Montagem dos Artefatos AIOS

**Task ID:** process-forge/assemble-squad
**Version:** 1.0.0
**Status:** Production Ready
**Created:** 2026-03-03
**Category:** Construction
**Execution Type:** Semantic

---

## Executive Summary

Fase 4 do pipeline Process Forge. O @forge-smith gera todos os artefatos AIOS a partir do blueprint: squad.yaml, agents, tasks, workflows, checklists, knowledge base. Valida contra a estrutura nuclear do AIOS (squad-validator.js ou checklist interno).

**Posicao no Workflow:** Fase 4 — Apos Arquitetura (Fase 3), antes de Validacao (Fase 5)
**Definicao de Sucesso:** Squad completo que passa no squad-validator.js
**Gate:** QG-PF-004 — Nuclear Structure

---

## Purpose

O blueprint diz O QUE o squad deve ser. Esta task CONSTROI o squad — gera cada arquivo seguindo os padroes AIOS. O resultado e um diretorio pronto pra copiar pra `squads/` e ativar.

---

## Step-by-Step Execution

### Step 1: Read Blueprint

Ler `03-blueprint/squad-blueprint.yaml` — agentes, tasks, workflow, quality gates.

### Step 2: Generate squad.yaml

Seguindo o padrao de squads existentes (squad-advisor, clone-360):

```yaml
# ═══════════════════════════════════════════════════════════════════════════
# SQUAD: {title}
# {descricao breve baseada no processo}
# ═══════════════════════════════════════════════════════════════════════════

name: "{squad-name}"
title: "{Squad Title}"
version: "1.0.0"
author: "{dono}"
description: >
  {Descricao baseada no processo extraido. 2-3 linhas.}

slash_prefix: "{camelCase}"
pattern_prefix: "{2-3 letras}"
target_user: "{Quem usa}"

tiers:
  orchestrator:
    - "{chief-agent-id}"
  tier_1:
    - "{agent-2-id}"
    # ...

tasks:
  - start
  - "{task-1}"
  # ...

workflows:
  - "wf-{squad-name}"

quality_gates:
  # Gerados a partir dos PU-QUALITY_GATEs
  - id: "QG-{PREFIX}-01"
    name: "{Nome}"
    transition: "{fase} -> {fase}"
    blocking: true
    criteria: "{Criterio do processo original}"

dependencies:
  required: []
  optional: []
```

### Step 3: Generate Agents

Para cada agente no blueprint, gerar arquivo `.md` em `04-squad/agents/`:

**Formato obrigatorio:**

```markdown
# Agent: {agent-id}

**ID:** {agent-id}
**Tier:** {Orchestrator|Tier 1|Tier 2}
**Version:** 1.0.0

---

## IDENTIDADE

### Proposito
{Baseado no rationale do blueprint}

### Dominio de Expertise
{Baseado nos PUs que este agente cobre}

### Personalidade
{Tom adequado ao tipo de trabalho: analitico, criativo, preciso, etc}

### Estilo de Comunicacao
{3-5 bullets}

---

## RESPONSABILIDADES CORE

### {Responsabilidade 1}
{Baseada nos PU-STEPs atribuidos}

### {Responsabilidade 2}
...

---

## COMMANDS

| Comando | Descricao |
|---------|-----------|
| `*{cmd}` | {descricao} |
| `*help` | Listar comandos |
| `*exit` | Sair |

---

## STRICT RULES

### NUNCA:
{Derivado de PU-EXCEPTIONs e PU-QUALITY_GATEs}

### SEMPRE:
{Derivado de PU-STEPs e PU-TACITs}
```

### Step 4: Generate Tasks

Para cada task no blueprint, gerar arquivo `.md` em `04-squad/tasks/`:

**TASK-FORMAT-SPECIFICATION-V1 — 8 campos obrigatorios:**

```yaml
---
task: "{Nome da Task}"
responsavel: "@{agent-id}"
responsavel_type: "{agent|human|hybrid|worker}"
atomic_layer: "task"
Entrada: |
  {Inputs — derivados de PU-INPUTs}
Saida: |
  {Outputs — derivados de PU-OUTPUTs}
Checklist:
  - "{criterio 1 — de PU-QUALITY_GATE}"
  - "{criterio 2}"
execution_type: "{deterministic|semantic|interactive}"
---

# Task: {Nome}

## Executive Summary
{O que esta task faz, baseado nos PUs}

## Steps

### Step 1: {Nome}
{Derivado de PU-STEP}

### Step 2: {Nome}
...

## Error Handling
{Derivado de PU-EXCEPTIONs}
```

**Task start.md especial:**

```yaml
---
task: "Start"
responsavel: "@{chief-agent-id}"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "Ativacao do squad pelo usuario"
Saida: "Squad ativo, greeting exibido, pronto pra operar"
Checklist:
  - "Chief ativo"
  - "Greeting exibido"
  - "Primeiro comando executado"
execution_type: "interactive"
---
```

### Step 5: Generate Workflow

Gerar `04-squad/workflows/wf-{squad-name}.yaml`:

```yaml
name: "wf-{squad-name}"
version: "1.0.0"
description: "{Baseado no processo}"
trigger: "{Como o workflow inicia}"

phases:
  - phase: 0
    name: "{Nome}"
    tasks:
      - "{task-name}"
    agent: "@{agent-id}"
    blocking: true
    duration: "{estimativa}"
    quality_gate: "QG-{PREFIX}-01"

  - phase: 1
    # ...

# Quality gates derivados do processo
quality_gates:
  - id: "QG-{PREFIX}-01"
    transition: "phase_0 -> phase_1"
    criteria: "{Do PU-QUALITY_GATE original}"
    blocking: true
```

### Step 6: Generate Supporting Files

**Checklists** (se processo tem quality gates):

```markdown
# Checklist: {Nome}

- [ ] {Criterio 1 — de PU-QUALITY_GATE}
- [ ] {Criterio 2}
- [ ] {Criterio 3}
```

**Knowledge Base** (se processo tem contexto):

```markdown
# {Squad Name} — Knowledge Base

## Contexto
{Descricao do processo original}

## Regras do Processo
{Derivado de PU-DECISIONs e PU-TACITs}

## Excecoes Conhecidas
{Derivado de PU-EXCEPTIONs}
```

**README.md:**

```markdown
# {Squad Title}

{Descricao}

## Ativacao
/{slashPrefix}

## Agentes
| Agente | Role |
|--------|------|
| @{agent} | {role} |

## Pipeline
{Workflow resumido}
```

### Step 7: Automated Validation — squad-validator.js (OBRIGATORIO)

**Este step usa a mesma infraestrutura de validacao do Squad Creator (Craft).**

**Rodar:**
```bash
node .aios-core/development/scripts/squad/squad-validator.js minds/{slug}/04-squad/
```

O validator checa automaticamente:
- squad.yaml contra JSON Schema
- Estrutura de diretorios (task-first architecture)
- Tasks contra TASK-FORMAT-SPEC-V1 (8 campos)
- Agent definitions
- Workflow YAML (sequence, references)
- Referencias cruzadas

**Self-Healing Loop (OBRIGATORIO se falhar):**

```
Tentativa 1: Rodar validator
  → Se PASS: prosseguir para Step 8
  → Se ERRORS: ler erros, corrigir artefatos

Tentativa 2: Re-rodar validator
  → Se PASS: prosseguir
  → Se ERRORS: corrigir novamente

Tentativa 3: Re-rodar validator
  → Se PASS: prosseguir
  → Se ERRORS: HALT — reportar ao Chief com lista de erros irresolvidos
```

**Regras:**
- ERRORS sao BLOQUEANTES — nao avanca ate resolver
- WARNINGS sao non-blocking — logar no report, nao bloquear
- Max 3 tentativas de self-healing antes de escalar

**Fallback (SOMENTE se script nao existir no path):**

Usar checklist nuclear manual:
- [ ] squad.yaml tem name + version
- [ ] squad.yaml name e kebab-case
- [ ] tasks/ dir existe com >= 1 .md
- [ ] agents/ dir existe com >= 1 .md
- [ ] Cada task tem 8 campos obrigatorios (TASK-FORMAT-SPEC-V1)
- [ ] Cada agent tem frontmatter ou heading com ID
- [ ] Todos os arquivos referenciados em squad.yaml existem
- [ ] Workflow YAML e valido
- [ ] Sem dependencia circular no workflow

### Step 8: Coverage Analysis — squad-analyzer.js (RECOMENDADO)

**Opcional mas recomendado. Gera metricas de cobertura e sugestoes de melhoria.**

```bash
node .aios-core/development/scripts/squad/squad-analyzer.js minds/{slug}/04-squad/
```

Resultado esperado:
- Inventario de componentes (agents, tasks, workflows, checklists, data)
- Metricas de cobertura (% de diretorios populados, tasks com 8 campos, etc)
- Sugestoes de melhoria (componentes faltantes, boas praticas nao seguidas)

**Se analyzer nao disponivel:** Pular — nao e bloqueante.

### Step 9: Quality Gate — QG-PF-004

**Criterio principal:** squad-validator.js retornou VALID (0 errors)

| Criterio | Fonte | Obrigatorio |
|----------|-------|-------------|
| squad-validator.js PASS | Step 7 | Sim |
| Zero ERRORS | Step 7 | Sim |
| squad-analyzer.js coverage > 70% | Step 8 | Nao |

**Veto conditions:**
- squad-validator.js retornou INVALID com errors nao resolvidos apos 3 tentativas
- Task sem 8 campos obrigatorios (TASK-FORMAT-SPEC-V1)
- squad.yaml invalido (name ou version faltando)

---

## Outputs

```
minds/{slug}/04-squad/
  squad.yaml
  README.md
  agents/
    {agent-1}.md
    {agent-2}.md
    ...
  tasks/
    start.md
    {task-1}.md
    {task-2}.md
    ...
  workflows/
    wf-{squad-name}.yaml
  checklists/
    {checklist-1}.md
  data/
    {squad-name}-kb.md
```

---

**Task Status:** Ready for Production
