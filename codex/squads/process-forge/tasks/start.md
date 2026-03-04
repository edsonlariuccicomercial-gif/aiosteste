---
task: "Start"
responsavel: "@forge-chief"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "Ativacao do squad pelo usuario via /processForge"
Saida: "Pipeline inicializado, estrutura de diretorios criada, handoff para extracao"
Checklist:
  - "Chief ativo e greeting exibido"
  - "Nome e escopo do processo coletados"
  - "Diretorio minds/{slug}/ criado com 5 subdiretorios"
  - ".state.json inicializado"
execution_type: "interactive"
---

# Task: Start — Entry Point do Process Forge

**Task ID:** process-forge/start
**Version:** 1.0.0
**Status:** Production Ready
**Created:** 2026-03-03
**Category:** Entry Point
**Execution Type:** Interactive

---

## Executive Summary

Entry point unico do Process Forge. Ativa o Chief, exibe greeting breve, coleta o nome/escopo do processo a extrair, cria estrutura de diretorios, e inicia a extracao.

## Purpose

O usuario chega querendo transformar um processo da cabeca dele num squad. Este task e o ponto de entrada — configura tudo e encaminha pro @process-archaeologist.

---

## Pipeline Visual

```
/processForge
  |
  v
STEP 1: ACTIVATE CHIEF
  Carrega forge-chief agent
  |
  v
STEP 2: DISPLAY GREETING
  Greeting breve + convite
  |
  v
STEP 3: COLLECT SCOPE
  Qual processo? Nome, descricao breve
  |
  v
STEP 4: CREATE STRUCTURE
  Diretorio minds/{slug}/
  |
  v
STEP 5: HANDOFF TO EXTRACTION
  -> extract-process task
```

---

## Step-by-Step Execution

### Step 1: Activate Chief

Carregar o agente `forge-chief`.

### Step 2: Display Greeting

```
=== PROCESS FORGE ===

Fala! Sou o Chief do Process Forge.

Meu trabalho e tirar processos complexos da sua cabeca e transformar
em squads AIOS que funcionam. Extracao profunda, nao meia duzia de perguntas.

Qual processo voce quer transformar em squad?
```

**Regras do Greeting:**
- NAO listar todos os agentes
- NAO listar todos os comandos
- NAO explicar o pipeline
- Ir direto ao ponto

### Step 3: Collect Scope

```yaml
elicit: true
prompt: |
  Me diz:
  1. Nome do processo (como voce se refere a ele)
  2. Em 1-2 frases, o que esse processo faz
type: "free_text"
```

Com a resposta, gerar:
- `process_name`: nome informado pelo usuario
- `process_slug`: versao kebab-case do nome
- `process_description`: descricao breve

### Step 4: Create Structure

Criar diretorios:

```
squads/process-forge/minds/{slug}/
  01-extraction/
  02-process-map/
  03-blueprint/
  04-squad/
  05-validation/
```

Inicializar `.state.json` do pipeline:

```json
{
  "process_slug": "{slug}",
  "process_name": "{nome}",
  "current_phase": 0,
  "phase_status": {
    "phase_0": "completed",
    "phase_1": "pending",
    "phase_2": "pending",
    "phase_3": "pending",
    "phase_4": "pending",
    "phase_5": "pending"
  },
  "extraction_rounds": 0,
  "total_pus": 0,
  "quality_gates_passed": [],
  "started_at": "{timestamp}"
}
```

### Step 5: Handoff to Extraction

```
Beleza! Estrutura criada pra "{process_name}".

Vou passar pro Archaeologist agora — ele vai te entrevistar em rounds
pra extrair seu processo com profundidade.

Primeiro round: visao geral e sequencia de passos.
Segundo round: decisoes, excecoes, inputs/outputs.
Terceiro round: criterios de qualidade, dependencias, conhecimento tacito.

Vamos comecar.
```

Executar handoff para @process-archaeologist via extract-process task.

---

## Veto Conditions

| Condicao | Acao |
|----------|------|
| Usuario nao sabe qual processo | Ajudar: "Qual atividade voce faz que gostaria que um time de IA fizesse por voce?" |
| Processo parece muito simples (2-3 passos) | Avisar: "Processos simples podem nao precisar de squad. Vamos extrair e avaliar." |
| Processo ja tem documentacao | Oferecer UC3: "Ja tem doc? Posso pular extracao e ir direto pra construcao." |
| Usuario quer extrair multiplos processos | Fazer 1 por vez: "Vamos comecar com o mais importante. Qual?" |

---

**Task Status:** Ready for Production
