# Instalacao — Process Forge Squad

## Pre-requisitos

- Synkra AIOS instalado e funcional
- Claude Code configurado

## Passos

1. **Copie a pasta inteira** para `squads/process-forge/` dentro do seu projeto AIOS:

```bash
cp -r process-forge/ <seu-projeto-aios>/squads/process-forge/
```

2. **Registre a skill** no `.claude/settings.json` do seu projeto. Adicione em `customInstructions.skills` ou no bloco equivalente:

```json
{
  "processForge": {
    "type": "squad",
    "path": "squads/process-forge",
    "activation": "/processForge"
  }
}
```

> Se o seu AIOS ja tem auto-discovery de squads, basta colocar na pasta `squads/` e ele detecta automaticamente.

3. **Ative** no chat:

```
/processForge
```

## Estrutura

```
process-forge/
├── agents/           # 3 agentes (chief, archaeologist, smith)
├── tasks/            # 6 tasks do pipeline
├── workflows/        # 1 workflow (wf-process-forge)
├── checklists/       # 5 quality gates
├── templates/        # Templates de PU, process map, blueprint
├── data/             # Knowledge base + classificacoes
├── squad.yaml        # Configuracao principal
└── README.md         # Documentacao
```

## Notas

- A pasta `minds/` NAO esta incluida — ela e gerada em runtime quando voce roda o pipeline
- Dependencia opcional: `squad-creator` (para validacao de estrutura nuclear via squad-validator.js)
- Pipeline completo leva 2-12 horas dependendo da complexidade do processo
