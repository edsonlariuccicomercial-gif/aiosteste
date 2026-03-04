# Process Forge — Knowledge Base

## O que e o Process Forge

Squad especialista em extracao profunda de processos e metodologias proprietarias do usuario. Transforma conhecimento tacito (que so existe na cabeca do dono) em squads AIOS funcionais.

## Quando Usar

- Voce tem um processo complexo que nunca documentou
- Voce nunca conseguiu delegar esse processo porque e minucioso demais
- Voce quer que um time de agentes IA execute (ou ajude a executar) esse processo
- Voce quer transformar "como eu faco X" num squad reutilizavel

## Quando NAO Usar

- Processo ja documentado → use Squad Creator Craft (*design-squad --docs)
- Voce quer clonar uma pessoa famosa → use Clone 360 ou Squad Creator Premium
- Processo e trivial (2-3 passos) → nao precisa de squad
- Voce nao sabe o que quer extrair → comece pelo Squad Advisor primeiro

## Pipeline

```
Fase 0: Setup (3-5 min)
  → Nomear processo, criar estrutura

Fase 1: Extracao (30-90 min, iterativa)
  → 8 lentes, N rounds, Process Units
  → Gate: QG-PF-001

Fase 2: Playback (10-20 min)
  → Apresentar processo de volta, usuario valida
  → Gate: QG-PF-002

Fase 3: Arquitetura (15-30 min)
  → Decompor em agentes, tasks, workflow
  → Gate: QG-PF-003

Fase 4: Montagem (30-60 min)
  → Gerar artefatos AIOS completos
  → Gate: QG-PF-004

Fase 5: Validacao (10-20 min)
  → Smoke tests + aprovacao usuario
  → Gate: QG-PF-005
```

## 8 Lentes de Extracao

| # | Lente | O que captura |
|---|-------|--------------|
| L1 | Visao Geral | Inicio, fim, proposito, frequencia |
| L2 | Sequencia | Passos em ordem |
| L3 | Decisoes | IF/THEN, bifurcacoes, criterios |
| L4 | Excecoes | Falhas, plano B, casos atipicos |
| L5 | Inputs/Outputs | Materiais, entregas, ferramentas |
| L6 | Qualidade | Criterios de "bem feito" |
| L7 | Dependencias | Ordem obrigatoria, gargalos |
| L8 | Tacito | Conhecimento automatico, intuicao |

## Process Units (PUs)

Unidades atomicas de conhecimento processual. 8 tipos:

- **STEP** — passo concreto executavel
- **DECISION** — bifurcacao com condicao
- **EXCEPTION** — falha ou caso atipico
- **QUALITY_GATE** — criterio de qualidade
- **DEPENDENCY** — relacao obrigatoria
- **INPUT** — material necessario
- **OUTPUT** — entregavel produzido
- **TACIT** — conhecimento nao-articulado

## Tipos de Executor

| Tipo | Simbolo | Quem faz |
|------|---------|----------|
| Agent | 🤖 | IA executa sozinha |
| Human | 👤 | So o dono pode fazer |
| Hybrid | 🤝 | IA prepara, dono revisa |
| Worker | ⚙️ | Automacao deterministica |

## Principios

1. **Zero Inference:** Nao inventar nada. Se parece faltar, perguntar.
2. **Vocabulario do Usuario:** Usar os termos dele, nao inventar nomenclatura.
3. **Iterativo:** Processos complexos precisam de N rounds.
4. **Playback Obrigatorio:** Sempre validar com usuario antes de construir.
5. **Task-First:** Tasks sao primarias, agentes sao executores.
6. **Unidirecional:** Pipeline nao volta. Decisoes sao upstream.
7. **Pausavel:** Pipeline pode ser pausado e retomado entre sessoes.
8. **Gemba (Go and See):** "Me mostra" > "Me conta". Quando o processo envolve ferramentas/telas/interfaces, pedir pro usuario MOSTRAR (screenshot, screenshare, copiar template) ao inves de apenas descrever. Captura os ~30% que o usuario esquece porque faz no automatico.

## Inspiracao Metodologica (NAO frameworks impostos)

- **Goldratt (TOC):** Encontrar gargalos e dependencias
- **Ohno (Toyota/5 Whys):** Perguntar "por que" ate chegar na raiz
- **Gawande (Checklist Manifesto):** Decompor em passos confiaveis

Esses pensadores informam O METODO de extracao. O Archaeologist extrai O PROCESSO DO USUARIO.

## Estrutura Nuclear AIOS (do Craft)

Todo squad gerado DEVE ter:
- `squad.yaml` com name (kebab-case) + version (semver) — **NAO config.yaml** (deprecated)
- `tasks/` com >= 1 .md seguindo TASK-FORMAT-SPEC-V1 (8 campos)
- `agents/` com >= 1 .md com frontmatter ou heading
- Tasks sao primarias, agentes sao executores (task-first)

## Tooling de Validacao (herdado do Craft)

O Process Forge usa a mesma infraestrutura de validacao automatizada do Squad Creator (Craft). Isso garante que squads gerados pelo Forge tem a mesma qualidade estrutural que squads criados diretamente pelo Craft.

### Scripts Disponiveis

| Script | Path | Quando Usar | Obrigatorio |
|--------|------|-------------|-------------|
| **squad-validator.js** | `.aios-core/development/scripts/squad/squad-validator.js` | Fase 4 (Step 7) + Fase 5 (Step 1) | SIM |
| **squad-analyzer.js** | `.aios-core/development/scripts/squad/squad-analyzer.js` | Fase 4 (Step 8) | Recomendado |

### squad-validator.js — O que valida

- **Manifest:** squad.yaml contra JSON Schema (name, version, tiers, tasks, workflows)
- **Estrutura:** Diretorios obrigatorios existem (agents/, tasks/)
- **Tasks:** Cada .md tem TASK-FORMAT-SPEC-V1 (8 campos no frontmatter YAML)
- **Agents:** Cada .md tem frontmatter ou heading com ID
- **Workflows:** YAML valido com sequence, references cruzadas
- **Integridade:** Tudo que squad.yaml referencia existe no filesystem

### Como rodar

```bash
# Validar squad gerado na Fase 4
node .aios-core/development/scripts/squad/squad-validator.js minds/{slug}/04-squad/

# Analisar cobertura (opcional)
node .aios-core/development/scripts/squad/squad-analyzer.js minds/{slug}/04-squad/
```

### Self-Healing Loop

Se o validator retornar ERRORS:
1. Ler cada erro reportado
2. Corrigir o artefato correspondente
3. Re-rodar o validator
4. Repetir ate PASS ou maximo 3 tentativas
5. Se 3 tentativas e FAIL → escalar pro Chief

### TASK-FORMAT-SPECIFICATION-V1 (8 campos)

```yaml
---
task: "Nome da Task"
responsavel: "@agent-id"
responsavel_type: "agent|human|hybrid|worker"
atomic_layer: "task"
Entrada: "inputs"
Saida: "outputs"
Checklist:
  - "criterio 1"
  - "criterio 2"
execution_type: "deterministic|semantic|interactive"
---
```

### Manifest (squad.yaml, NAO config.yaml)

```yaml
name: "squad-name"        # kebab-case, obrigatorio
version: "1.0.0"          # semver, obrigatorio
title: "Squad Title"
description: "..."
slash_prefix: "camelCase"
tiers:
  orchestrator: [chief]
  tier_1: [agent-2]
tasks: [start, task-1]
workflows: [wf-squad-name]
quality_gates: [...]
```
