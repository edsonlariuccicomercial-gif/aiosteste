---
task: "Validate Squad"
responsavel: "@forge-chief"
responsavel_type: "agent"
atomic_layer: "task"
Entrada: "04-squad/ (squad completo), 02-process-map/process-map.yaml"
Saida: "05-validation/validation-report.yaml"
Checklist:
  - "Validacao estrutural PASS (config + agents + tasks + workflow)"
  - "2/3 smoke tests OK"
  - "Usuario aprova squad"
execution_type: "interactive"
---

# Task: Validate Squad — Validacao Final

**Task ID:** process-forge/validate-squad
**Version:** 1.0.0
**Status:** Production Ready
**Created:** 2026-03-03
**Category:** Validation
**Execution Type:** Interactive

---

## Executive Summary

Fase 5 do pipeline Process Forge. Validacao final antes de marcar o squad como pronto. Combina validacao estrutural (AIOS compliance), smoke tests (cenarios reais), e aprovacao do usuario.

**Posicao no Workflow:** Fase 5 — Apos Montagem (Fase 4). Ultima fase.
**Definicao de Sucesso:** Squad validado + usuario aprova
**Gate:** QG-PF-005 — Squad Operational

---

## Purpose

Um squad pode estar estruturalmente correto (config valido, tasks com 8 campos) mas operacionalmente quebrado (passo critico faltando, agente errado pra task). Os smoke tests validam que o squad FUNCIONA, nao so que EXISTE.

---

## Step-by-Step Execution

### Step 1: Structural Validation (squad-validator.js)

**Agente:** @forge-smith

Rodar squad-validator.js para confirmar que QG-PF-004 esta valido (ou re-validar):

```bash
node .aios-core/development/scripts/squad/squad-validator.js minds/{slug}/04-squad/
```

**Se validator disponivel**, apresentar resultado:

```
=== VALIDACAO ESTRUTURAL (squad-validator.js) ===

Resultado: {VALID/INVALID}
Errors: {N} ({lista ou "nenhum"})
Warnings: {N} ({lista ou "nenhum"})
```

**Se validator retornar ERRORS:** Aplicar self-healing loop (corrigir → re-validar, max 3 tentativas).

**Se validator nao disponivel no path**, usar checklist manual:

```
=== VALIDACAO ESTRUTURAL (checklist manual) ===

squad.yaml: {PASS/FAIL}
Agents: {N} encontrados, {N} validos
Tasks: {N} encontradas, {N} validas (8 campos)
Workflows: {N} encontrados, {N} validos
Erros: {lista ou "nenhum"}
Warnings: {lista ou "nenhum"}
```

**OPCIONAL — squad-analyzer.js para metricas de cobertura:**

```bash
node .aios-core/development/scripts/squad/squad-analyzer.js minds/{slug}/04-squad/
```

### Step 2: Smoke Tests

**Agente:** @forge-chief

Apresentar 2-3 cenarios reais ao usuario e simular como o squad responderia.

**Como construir cada cenario:** Usar os PUs extraidos pra montar cenarios REAIS do processo do usuario, nao cenarios genericos. Cada smoke test deve referenciar passos, decisoes e excecoes especificas do processo extraido.

**Cenario 1: Caminho Feliz**

Simular o fluxo principal do processo — trigger ate entregavel final, sem desvios.

```yaml
elicit: true
prompt: |
  === SMOKE TEST 1: Caminho Feliz ===

  Imagina que alguem ativa esse squad e diz:
  "{trigger normal do processo — do PU que descreve o inicio}"

  O squad faria isso:
  1. {Agente X} executa {task Y}: {resultado especifico do PU-STEP}
  2. {Agente Z} executa {task W}: {resultado especifico do PU-STEP}
  3. Quality gate: {criterio real do PU-QUALITY_GATE}
  4. Output final: {entregavel real do PU-OUTPUT}

  Isso e o que deveria acontecer? Ta correto?
type: "confirmation"
```

**Exemplo concreto** (se o processo fosse "montar oferta"):
```
Imagina que alguem ativa esse squad e diz:
"Preciso montar uma oferta pro meu curso de R$997"

O squad faria isso:
1. @pesquisador executa pesquisa-dores: lista 10 dores do publico a partir do briefing
2. @copywriter executa escrever-headline: headline usando PAS com as dores pesquisadas
3. Quality gate: validar que headline tem os 4 elementos da Value Equation
4. @copywriter executa montar-pagina: pagina de vendas completa com headline + bullets + CTA
5. Output final: pagina de vendas pronta pra revisao do dono

Isso e o que deveria acontecer? Ta correto?
```

**Cenario 2: Decisao**

Simular uma bifurcacao real do processo — usar um PU-DECISION especifico.

```yaml
elicit: true
prompt: |
  === SMOKE TEST 2: Decisao ===

  E se durante o processo, {condicao real de um PU-DECISION}?

  O squad faria:
  → {branch A do PU-DECISION}: {acao especifica}
  → Se fosse o contrario ({condicao oposta}): {branch B}

  Esse e o caminho certo?
type: "confirmation"
```

**Exemplo concreto:**
```
E se durante o processo, o ticket da oferta for acima de R$500?

O squad faria:
→ Garantia de 30 dias com reembolso total (risco percebido alto)
→ Se fosse abaixo de R$500: garantia padrao de 7 dias

Esse e o caminho certo?
```

**Cenario 3: Excecao**

Simular uma falha real do processo — usar um PU-EXCEPTION especifico.

```yaml
elicit: true
prompt: |
  === SMOKE TEST 3: Excecao ===

  E se {trigger real de um PU-EXCEPTION}?

  O squad faria:
  → {response real do PU-EXCEPTION}
  → Severity: {severity do PU-EXCEPTION}

  E isso que deveria acontecer?
type: "confirmation"
```

**Exemplo concreto:**
```
E se o cliente reclama que a promessa da headline e exagerada?

O squad faria:
→ @copywriter reescreve headline adicionando proof elements e disclaimer
→ Severity: degraded (processo continua mas com retrabalho)

E isso que deveria acontecer?
```

**Criterio:** 2 de 3 cenarios PASS

### Step 3: User Walkthrough

```yaml
elicit: true
prompt: |
  === SQUAD FINAL ===

  Seu processo "{process_name}" virou o squad "{squad_name}".

  Resumo:
  - {N} agentes: {nomes}
  - {N} tasks
  - {N} quality gates
  - Workflow de {N} fases

  Pra usar: /{slashPrefix}

  O squad ta no diretorio: minds/{slug}/04-squad/
  Pra ativar, copie pra squads/{squad-name}/

  Voce aprova esse squad? Algo que gostaria de ajustar?
type: "free_text"
```

### Step 4: Quality Gate — QG-PF-005

**Criterios:**

| Criterio | Obrigatorio |
|----------|-------------|
| Validacao estrutural PASS | Sim |
| 2/3 smoke tests OK | Sim |
| Usuario aprova | Sim |

**Veto conditions:**
- Usuario rejeita ("nao funciona", "ta errado")
- 0/3 smoke tests passam
- Validacao estrutural falhou

**Se QG-PF-005 nao passou:**
- Se smoke test falhou: identificar gap, voltar pra extracao cirurgica ou ajustar blueprint
- Se usuario rejeitou: coletar feedback, ajustar

### Step 5: Finalize

Gerar `05-validation/`:

```yaml
# 05-validation/validation-report.yaml
structural:
  config: PASS
  agents: PASS
  tasks: PASS
  workflows: PASS
  warnings: []

smoke_tests:
  test_1_happy_path: PASS
  test_2_decision: PASS
  test_3_exception: PASS
  score: "3/3"

user_approval:
  approved: true
  feedback: "{comentarios}"
  approved_at: "{timestamp}"

overall: PASS
```

Atualizar `.state.json`:

```json
{
  "current_phase": 5,
  "phase_status": {
    "phase_5": "completed"
  },
  "quality_gates_passed": ["QG-PF-001", "QG-PF-002", "QG-PF-003", "QG-PF-004", "QG-PF-005"],
  "completed_at": "{timestamp}"
}
```

Mensagem final:

```
=== PROCESS FORGE — COMPLETO ===

Processo "{process_name}" → Squad "{squad_name}"

Pipeline:
✅ Fase 0: Setup
✅ Fase 1: Extracao ({N} PUs, {N} rounds)
✅ Fase 2: Playback (validado pelo usuario)
✅ Fase 3: Arquitetura ({N} agentes, {N} tasks)
✅ Fase 4: Montagem (AIOS compliant)
✅ Fase 5: Validacao (smoke tests + aprovacao)

Squad pronto em: minds/{slug}/04-squad/

Pra ativar:
1. Copie minds/{slug}/04-squad/ pra squads/{squad-name}/
2. Use /{slashPrefix}

Seu processo agora e um squad. Nao esta mais so na sua cabeca.
```

---

## Outputs

| Arquivo | Conteudo |
|---------|----------|
| `05-validation/validation-report.yaml` | Relatorio completo |
| `.state.json` | Estado final (completed) |

---

**Task Status:** Ready for Production
