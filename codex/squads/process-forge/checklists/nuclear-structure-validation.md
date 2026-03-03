# Checklist: Nuclear Structure Validation (QG-PF-004)

Validacao da Fase 4 — Montagem do Squad AIOS.

**Metodo primario:** Rodar `node .aios-core/development/scripts/squad/squad-validator.js {squad_path}`
**Este checklist manual:** Usado como FALLBACK se o script nao estiver disponivel.

## Manifest (squad.yaml)

- [ ] Arquivo squad.yaml existe (NAO config.yaml — deprecated)
- [ ] Campo `name` presente e kebab-case
- [ ] Campo `version` presente e semver (X.Y.Z)
- [ ] Campo `description` presente
- [ ] Campo `tiers` com pelo menos 1 agente
- [ ] Campo `tasks` com pelo menos 1 task
- [ ] Todos os arquivos referenciados existem fisicamente

## Diretorios

- [ ] `agents/` existe com >= 1 arquivo .md
- [ ] `tasks/` existe com >= 1 arquivo .md
- [ ] `workflows/` existe (se workflow definido no config)

## Tasks (TASK-FORMAT-SPECIFICATION-V1)

Para CADA task:
- [ ] Campo `task` presente (nome)
- [ ] Campo `responsavel` presente (@agent-id)
- [ ] Campo `responsavel_type` presente (agent|human|hybrid|worker)
- [ ] Campo `atomic_layer` presente (= "task")
- [ ] Campo `Entrada` presente
- [ ] Campo `Saida` presente
- [ ] Campo `Checklist` presente com >= 1 item
- [ ] Campo `execution_type` presente (deterministic|semantic|interactive)

## Agents

Para CADA agente:
- [ ] Tem frontmatter YAML com `agent:` OU heading markdown com ID
- [ ] Secao IDENTIDADE com Proposito
- [ ] Secao RESPONSABILIDADES
- [ ] Nome do arquivo e kebab-case

## Workflow

- [ ] YAML valido (sem erros de sintaxe)
- [ ] Tem campo `phases` com >= 1 fase
- [ ] Cada fase tem `name`, `tasks`, `agent`
- [ ] Fluxo e unidirecional (sem loops)
- [ ] Quality gates referenciados existem no config

## Coerencia

- [ ] Cada agente referenciado nas tasks existe em agents/
- [ ] Cada task referenciada no workflow existe em tasks/
- [ ] Sem dependencia circular entre tasks
- [ ] Sem agente orfao (sem tasks atribuidas)
