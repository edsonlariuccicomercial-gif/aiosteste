# Synkra AIOX Development Rules for Claude Code

You are working with Synkra AIOX, an AI-Orchestrated System for Full Stack Development.

<!-- AIOX-MANAGED-START: core-framework -->
## Core Framework Understanding

Synkra AIOX is a meta-framework that orchestrates AI agents to handle complex development workflows. Always recognize and work within this architecture.
<!-- AIOX-MANAGED-END: core-framework -->

<!-- AIOX-MANAGED-START: constitution -->
## Constitution

O AIOX possui uma **Constitution formal** com princípios inegociáveis e gates automáticos.

**Documento completo:** `.aiox-core/constitution.md`

**Princípios fundamentais:**

| Artigo | Princípio | Severidade |
|--------|-----------|------------|
| I | CLI First | NON-NEGOTIABLE |
| II | Agent Authority | NON-NEGOTIABLE |
| III | Story-Driven Development | MUST |
| IV | No Invention | MUST |
| V | Quality First | MUST |
| VI | Absolute Imports | SHOULD |

**Gates automáticos bloqueiam violações.** Consulte a Constitution para detalhes completos.
<!-- AIOX-MANAGED-END: constitution -->

<!-- AIOX-MANAGED-START: sistema-de-agentes -->
## Sistema de Agentes

### Ativação de Agentes
Use `@agent-name` ou `/AIOX:agents:agent-name`:

| Agente | Persona | Escopo Principal |
|--------|---------|------------------|
| `@dev` | Dex | Implementação de código |
| `@qa` | Quinn | Testes e qualidade |
| `@architect` | Aria | Arquitetura e design técnico |
| `@pm` | Morgan | Product Management |
| `@po` | Pax | Product Owner, stories/epics |
| `@sm` | River | Scrum Master |
| `@analyst` | Alex | Pesquisa e análise |
| `@data-engineer` | Dara | Database design |
| `@ux-design-expert` | Uma | UX/UI design |
| `@devops` | Gage | CI/CD, git push (EXCLUSIVO) |

### Comandos de Agentes
Use prefixo `*` para comandos:
- `*help` - Mostrar comandos disponíveis
- `*create-story` - Criar story de desenvolvimento
- `*task {name}` - Executar task específica
- `*exit` - Sair do modo agente
<!-- AIOX-MANAGED-END: sistema-de-agentes -->

<!-- AIOX-MANAGED-START: agent-system -->
## Agent System

### Agent Activation
- Agents are activated with @agent-name syntax: @dev, @qa, @architect, @pm, @po, @sm, @analyst
- The master agent is activated with @aiox-master
- Agent commands use the * prefix: *help, *create-story, *task, *exit

### Agent Context
When an agent is active:
- Follow that agent's specific persona and expertise
- Use the agent's designated workflow patterns
- Maintain the agent's perspective throughout the interaction
<!-- AIOX-MANAGED-END: agent-system -->

## Development Methodology

### Story-Driven Development
1. **Work from stories** - All development starts with a story in `docs/stories/`
2. **Update progress** - Mark checkboxes as tasks complete: [ ] → [x]
3. **Track changes** - Maintain the File List section in the story
4. **Follow criteria** - Implement exactly what the acceptance criteria specify

### Code Standards
- Write clean, self-documenting code
- Follow existing patterns in the codebase
- Include comprehensive error handling
- Add unit tests for all new functionality
- Use TypeScript/JavaScript best practices

### Testing Requirements
- Run all tests before marking tasks complete
- Ensure linting passes: `npm run lint`
- Verify type checking: `npm run typecheck`
- Add tests for new features
- Test edge cases and error scenarios

<!-- AIOX-MANAGED-START: framework-structure -->
## AIOX Framework Structure

```
aiox-core/
├── agents/         # Agent persona definitions (YAML/Markdown)
├── tasks/          # Executable task workflows
├── workflows/      # Multi-step workflow definitions
├── templates/      # Document and code templates
├── checklists/     # Validation and review checklists
└── rules/          # Framework rules and patterns

docs/
├── stories/        # Development stories (numbered)
├── prd/            # Product requirement documents
├── architecture/   # System architecture documentation
└── guides/         # User and developer guides
```
<!-- AIOX-MANAGED-END: framework-structure -->

<!-- AIOX-MANAGED-START: framework-boundary -->
## Framework vs Project Boundary

O AIOX usa um modelo de 4 camadas (L1-L4) para separar artefatos do framework e do projeto. Deny rules em `.claude/settings.json` reforçam isso deterministicamente.

| Camada | Mutabilidade | Paths | Notas |
|--------|-------------|-------|-------|
| **L1** Framework Core | NEVER modify | `.aiox-core/core/`, `.aiox-core/constitution.md`, `bin/aiox.js`, `bin/aiox-init.js` | Protegido por deny rules |
| **L2** Framework Templates | NEVER modify | `.aiox-core/development/tasks/`, `.aiox-core/development/templates/`, `.aiox-core/development/checklists/`, `.aiox-core/development/workflows/`, `.aiox-core/infrastructure/` | Extend-only |
| **L3** Project Config | Mutable (exceptions) | `.aiox-core/data/`, `agents/*/MEMORY.md`, `core-config.yaml` | Allow rules permitem |
| **L4** Project Runtime | ALWAYS modify | `docs/stories/`, `packages/`, `squads/`, `tests/` | Trabalho do projeto |

**Toggle:** `core-config.yaml` → `boundary.frameworkProtection: true/false` controla se deny rules são ativas (default: true para projetos, false para contribuidores do framework).

> **Referência formal:** `.claude/settings.json` (deny/allow rules), `.claude/rules/agent-authority.md`
<!-- AIOX-MANAGED-END: framework-boundary -->

<!-- AIOX-MANAGED-START: rules-system -->
## Rules System

O AIOX carrega regras contextuais de `.claude/rules/` automaticamente. Regras com frontmatter `paths:` só carregam quando arquivos correspondentes são editados.

| Rule File | Description |
|-----------|-------------|
| `agent-authority.md` | Agent delegation matrix and exclusive operations |
| `agent-handoff.md` | Agent switch compaction protocol for context optimization |
| `agent-memory-imports.md` | Agent memory lifecycle and CLAUDE.md ownership |
| `coderabbit-integration.md` | Automated code review integration rules |
| `ids-principles.md` | Incremental Development System principles |
| `mcp-usage.md` | MCP server usage rules and tool selection priority |
| `story-lifecycle.md` | Story status transitions and quality gates |
| `workflow-execution.md` | 4 primary workflows (SDC, QA Loop, Spec Pipeline, Brownfield) |

> **Diretório:** `.claude/rules/` — rules são carregadas automaticamente pelo Claude Code quando relevantes.
<!-- AIOX-MANAGED-END: rules-system -->

<!-- AIOX-MANAGED-START: code-intelligence -->
## Code Intelligence

O AIOX possui um sistema de code intelligence opcional que enriquece operações com dados de análise de código.

| Status | Descrição | Comportamento |
|--------|-----------|---------------|
| **Configured** | Provider ativo e funcional | Enrichment completo disponível |
| **Fallback** | Provider indisponível | Sistema opera normalmente sem enrichment — graceful degradation |
| **Disabled** | Nenhum provider configurado | Funcionalidade de code-intel ignorada silenciosamente |

**Graceful Fallback:** Code intelligence é sempre opcional. `isCodeIntelAvailable()` verifica disponibilidade antes de qualquer operação. Se indisponível, o sistema retorna o resultado base sem modificação — nunca falha.

**Diagnóstico:** `aiox doctor` inclui check de code-intel provider status.

> **Referência:** `.aiox-core/core/code-intel/` — provider interface, enricher, client
<!-- AIOX-MANAGED-END: code-intelligence -->

<!-- AIOX-MANAGED-START: graph-dashboard -->
## Graph Dashboard

O CLI `aiox graph` visualiza dependências, estatísticas de entidades e status de providers.

### Comandos

```bash
aiox graph --deps                        # Dependency tree (ASCII)
aiox graph --deps --format=json          # Output como JSON
aiox graph --deps --format=html          # Interactive HTML (abre browser)
aiox graph --deps --format=mermaid       # Mermaid diagram
aiox graph --deps --format=dot           # DOT format (Graphviz)
aiox graph --deps --watch                # Live mode com auto-refresh
aiox graph --deps --watch --interval=10  # Refresh a cada 10 segundos
aiox graph --stats                       # Entity stats e cache metrics
```

**Formatos de saída:** ascii (default), json, dot, mermaid, html

> **Referência:** `.aiox-core/core/graph-dashboard/` — CLI, renderers, data sources
<!-- AIOX-MANAGED-END: graph-dashboard -->

## Workflow Execution

### Task Execution Pattern
1. Read the complete task/workflow definition
2. Understand all elicitation points
3. Execute steps sequentially
4. Handle errors gracefully
5. Provide clear feedback

### Interactive Workflows
- Workflows with `elicit: true` require user input
- Present options clearly
- Validate user responses
- Provide helpful defaults

## Best Practices

### When implementing features:
- Check existing patterns first
- Reuse components and utilities
- Follow naming conventions
- Keep functions focused and testable
- Document complex logic

### When working with agents:
- Respect agent boundaries
- Use appropriate agent for each task
- Follow agent communication patterns
- Maintain agent context

### When handling errors:
```javascript
try {
  // Operation
} catch (error) {
  console.error(`Error in ${operation}:`, error);
  // Provide helpful error message
  throw new Error(`Failed to ${operation}: ${error.message}`);
}
```

## Git & GitHub Integration

### Commit Conventions
- Use conventional commits: `feat:`, `fix:`, `docs:`, `chore:`, etc.
- Reference story ID: `feat: implement IDE detection [Story 2.1]`
- Keep commits atomic and focused

### GitHub CLI Usage
- Ensure authenticated: `gh auth status`
- Use for PR creation: `gh pr create`
- Check org access: `gh api user/memberships`

<!-- AIOX-MANAGED-START: aiox-patterns -->
## AIOX-Specific Patterns

### Working with Templates
```javascript
const template = await loadTemplate('template-name');
const rendered = await renderTemplate(template, context);
```

### Agent Command Handling
```javascript
if (command.startsWith('*')) {
  const agentCommand = command.substring(1);
  await executeAgentCommand(agentCommand, args);
}
```

### Story Updates
```javascript
// Update story progress
const story = await loadStory(storyId);
story.updateTask(taskId, { status: 'completed' });
await story.save();
```
<!-- AIOX-MANAGED-END: aiox-patterns -->

## Environment Setup

### Required Tools
- Node.js 18+
- GitHub CLI
- Git
- Your preferred package manager (npm/yarn/pnpm)

### Configuration Files
- `.aiox/config.yaml` - Framework configuration
- `.env` - Environment variables
- `aiox.config.js` - Project-specific settings

<!-- AIOX-MANAGED-START: common-commands -->
## Common Commands

### AIOX Master Commands
- `*help` - Show available commands
- `*create-story` - Create new story
- `*task {name}` - Execute specific task
- `*workflow {name}` - Run workflow

### Development Commands
- `npm run dev` - Start development
- `npm test` - Run tests
- `npm run lint` - Check code style
- `npm run build` - Build project
<!-- AIOX-MANAGED-END: common-commands -->

## Debugging

### Enable Debug Mode
```bash
export AIOX_DEBUG=true
```

### View Agent Logs
```bash
tail -f .aiox/logs/agent.log
```

### Trace Workflow Execution
```bash
npm run trace -- workflow-name
```

## Claude Code Specific Configuration

### Performance Optimization
- Prefer batched tool calls when possible for better performance
- Use parallel execution for independent operations
- Cache frequently accessed data in memory during sessions

### Tool Usage Guidelines
- Always use the Grep tool for searching, never `grep` or `rg` in bash
- Use the Task tool for complex multi-step operations
- Batch file reads/writes when processing multiple files
- Prefer editing existing files over creating new ones

### Session Management
- Track story progress throughout the session
- Update checkboxes immediately after completing tasks
- Maintain context of the current story being worked on
- Save important state before long-running operations

### Error Recovery
- Always provide recovery suggestions for failures
- Include error context in messages to user
- Suggest rollback procedures when appropriate
- Document any manual fixes required

### Testing Strategy
- Run tests incrementally during development
- Always verify lint and typecheck before marking complete
- Test edge cases for each new feature
- Document test scenarios in story files

### Documentation
- Update relevant docs when changing functionality
- Include code examples in documentation
- Keep README synchronized with actual behavior
- Document breaking changes prominently

## Vercel Deploy — Infraestrutura de Produção

### Projetos Vercel (2 projetos, 1 ativo)

| Projeto | Root Directory | URL | Status |
|---------|---------------|-----|--------|
| **painel-caixa-escolar** | `painel-caixa-escolar/` | `painel-caixa-escolar.vercel.app` | **ATIVO — usar este** |
| dashboard | `painel-caixa-escolar/squads/caixa-escolar/dashboard/` | URL gerado por deploy | REDUNDANTE — não usar |

### Como deployar

```bash

# Deploy de PRODUÇÃO (frontend + APIs):
cd painel-caixa-escolar && npx vercel --prod

# Deploy forçado (sem cache):
cd painel-caixa-escolar && npx vercel --prod --force
```

### Estrutura do deploy unificado
- **Frontend** (HTML/JS/CSS): `painel-caixa-escolar/squads/caixa-escolar/dashboard/`
- **APIs serverless**: `painel-caixa-escolar/api/`
- **Redirect**: `/` → `/squads/caixa-escolar/dashboard/gdp-contratos.html`
- **vercel.json**: `painel-caixa-escolar/vercel.json` (rewrites, redirects, functions config)

### IMPORTANTE
- NÃO deletar a pasta `painel-caixa-escolar/squads/caixa-escolar/dashboard/`
- O projeto `dashboard` no Vercel é redundante mas pode ficar
- Sempre deployar pelo projeto `painel-caixa-escolar` (root)

### ⚠️ SEMPRE usar `--force` no deploy (cache de build do Vercel)
- **Use `npx vercel --prod --force`** como padrão neste projeto, NÃO o `--prod` simples.
- **Motivo:** o deploy normal reaproveita o "build cache" do Vercel (`Restored build cache from previous deployment`). Em alterações de frontend estático (HTML/JS sob `dashboard/`), esse cache frequentemente **republica a versão antiga** mesmo com o código novo já na master — sem erro, silenciosamente.
- **Sintoma:** funcionalidade "some" / "sistema regrediu" em produção, mas a master e os arquivos locais estão corretos. Confirmar com:
  `curl -s "https://painel-caixa-escolar.vercel.app/squads/caixa-escolar/dashboard/gdp-contratos.html" | grep -o "gdp-api.js?v=[0-9]*"` — se a versão servida for menor que a do arquivo local, é o cache.
- **Correção:** `cd painel-caixa-escolar && npx vercel --prod --force --yes` reconstrói do zero (`Creating build cache...`).
- Sempre **bumpar a versão** dos scripts no HTML (`?v=N`) ao alterar um JS, e orientar o usuário a dar **Ctrl+Shift+R** (cache do navegador é uma camada separada do cache do Vercel).
- Histórico: incidente em 2026-06-13 (aba Conta-Corrente "sumiu" por build cache servindo `gdp-api.js?v=12` em vez de `v=14`).

### 🚫 Auto-deploy do Git DESCONECTADO na raiz (Vercel) — deploy é SEMPRE manual (`--force`)
- **✅ RESOLVIDO EM 2026-06-22 (sessão @devops):** a integração Git da Vercel foi **DESCONECTADA** via `vercel git disconnect` (projeto `painel-caixa-escolar`). Antes, o `git.deploymentEnabled.master = false` do `vercel.json` **estava sendo IGNORADO** — a conexão Git no painel da Vercel sobrepunha o arquivo, e cada `git push` disparava um deploy `...-git-<hash>-...` que sobrescrevia o `--force` manual com a versão sem functions. Agora nenhum push dispara deploy; **só `npx vercel --prod --force` publica**.
- **✅ FIX-C APLICADO (commit `455d0c1`):** `includeFiles` declarado em `api/gdp-integrations.js` no `vercel.json` (`squads/caixa-escolar/dashboard/server-lib/**`). Isso impede as functions de caírem por causa do `require()` dinâmico de `server-lib`.
- **Estado atual:** Git desconectado + `git.deploymentEnabled.master = false` (redundância). O merge/push na master **NÃO** dispara deploy automático. Só `npx vercel --prod --force` publica em produção.
- **NÃO reconectar o Git** (`vercel git connect`) nem reativar o auto-deploy sem validar o FIX-C em vários deploys manuais primeiro. Já foi reativado por engano uma vez (commit `dc27359`, revertido em `5131713`).
- **Por que está OFF:** o auto-deploy da integração Git da Vercel reaproveitava o build cache e **dropava as serverless functions `/api/*`** (todas davam **404** após cada merge — ex.: "Falha ao integrar cobrança com INTER: HTTP 404"). Havia uma **corrida**: o `--force` manual subia com functions, mas o deploy automático do merge sobrescrevia logo depois com a versão cacheada **sem** functions (o automático vencia). Diagnóstico em `.aiox/handoffs/handoff-analyst-to-devops-buildcache-rootcause-20260622.yaml`.
- **Sintoma de que voltou:** functions `/api/*` retornando 404 após um merge. Validar com:
  `for fn in gdp-data gdp-integrations bank-charge caixa-proxy ai-parse-price send-order-email; do curl -s -o /dev/null -w "$fn %{http_code}\n" "https://painel-caixa-escolar.vercel.app/api/$fn"; done` — **404 = function dropada** (200/400/405 = viva).
- **Responsabilidade:** o **@devops** roda o `--force` ao final de cada lote de mudanças (NÃO é tarefa do stakeholder). O usuário só dá Ctrl+Shift+R no navegador.
- **FIX-C ✅ APLICADO (2026-06-22, commit `455d0c1`):** `api/gdp-integrations.js` faz `require(path.join(__dirname, "..", "squads/.../server-lib/nfe-sefaz-client.js"))` (path **dinâmico, fora de `/api/`**). O tracer de dependências do Vercel (nft/esbuild) não resolve `require` dinâmico montado com `path.join` → não empacota `server-lib` → a function quebra no bundle e o Vercel derruba **TODAS** as `/api/*` (404 `NOT_FOUND`). **Solução aplicada:** `includeFiles: "squads/caixa-escolar/dashboard/server-lib/**"` na function `api/gdp-integrations.js` (cobre `nfe-sefaz-client.js`, `bank-provider-config.js` e `ibge-mg.json` transitivo). Só DEPOIS de validar isso em vários deploys o auto-deploy poderia ser religado.
- **Histórico do incidente 2026-06-22:** usuário gerou boletos Inter mas só 2 contas marcaram Inter + PDF do boleto dava 404 (`X-Vercel-Error: NOT_FOUND`). Diagnóstico (@analyst) → fix `includeFiles` → deploy `--force` (@devops) restaurava, mas o `git push` re-disparava o deploy Git que sobrescrevia. Solução final: `vercel git disconnect`. Validação pós-fix: function do PDF passou de `NOT_FOUND` para `502 {"ok":false,"error":"Verifique os dados..."}` (resposta do próprio Inter para `providerChargeId` fake = function VIVA). Handoff: `.aiox/handoffs/handoff-analyst-to-devops-api-404-includefiles-20260622.yaml`.

## Boletos "sumiram" / órfãos no Inter — CAUSA RAIZ (incidente 2026-06-22, parte 2)

**Sintoma:** boletos gerados aparecem no sistema e depois "somem" da conta a receber; usuário confirma que os boletos EXISTEM no app do Inter (pegou cópias). Investigação (@analyst) cruzou Inter (`bank-charge-list`) × Supabase (`contas_receber`): **45 boletos no Inter, só 5 com `providerChargeId` vinculado no sistema → 40 órfãos**.

**Causa raiz (dupla, comprovada):**
1. **`seuNumero` truncado no INÍCIO** — `api/bank-charge.js:133` usava `slice(0,15)`. O Inter limita `seuNumero` a 15 chars; o `conta.id` (ex.: `CR-20260622-46493`, 17 chars) era cortado para `CR-20260622-464`, **perdendo o sufixo único**. Resultado: impossível re-vincular boleto↔conta por `seuNumero`. **FIX:** `slice(-15)` (preserva o sufixo). O `seuNumero` carrega o ID da conta — é a chave de reconciliação.
2. **Emissão não-idempotente** — o boleto nasce no Inter, mas se a RESPOSTA falha (timeout/404 na volta, como na janela de instabilidade de hoje), o `catch` marcava falha SEM salvar o `providerChargeId` → boleto órfão (real no Inter, sem vínculo no sistema). **FIX:** rede de segurança no `catch` do create chama nova action `bank-charge-find-by-seu` (busca boleto por `seuNumero` no Inter e re-vincula antes de desistir).

**Observação:** dos 40 órfãos, ~35 são de versões ANTIGAS do sistema (quando `seuNumero` era o nosso-número sequencial `946...`, não o `CR-id`) ou testes (`CHK-FINAL`, `TST-CNPJ`) — muitos já `RECEBIDO`/`EXPIRADO`. Só ~5 são contas legítimas recuperáveis por `seuNumero`.

**Actions novas em `api/bank-charge.js`:** `bank-charge-list` (lista por período), `bank-charge-find-by-seu` (busca idempotente por seuNumero). **NÃO foi feito hard-delete de nada** — boletos órfãos antigos seguem no Inter (decisão do usuário: não recuperar).

**Commits:** `93e4bde` (guard backend offline), `1da6c89` (guard regerar/excluir NF), + fix seuNumero/idempotência (este). **Pendente @devops:** commit + `vercel --prod --force` + push.

## Squad Fiscal Engine v2.0 — Reforma Tributária

O módulo fiscal (`nfe-sefaz-client.js`) foi atualizado em 2026-05-18 com:

### Funcionalidades adicionadas
- **Grupo UB (IBS/CBS/IS)** — NT 2025.002: `buildIbsCbsXml()`, subgrupos IBSUF/IBSMun/CBS, totalizadores W03, `RTC_ALIQUOTAS` por ano (2026 piloto: CBS 0.9%, IBS 0.1%)
- **Validação certificado A1** — `validateCertificateA1()`: expiração, CNPJ match, bloqueio pré-emissão
- **NFeConsultaProtocolo4** — `consultarProtocolo()`: consulta status de NF-e por chave de acesso, 27 UFs
- **Validação CRT** — `validateCrt()`: 4 regimes (Simples, Excesso, Normal, MEI), `buildIcmsXml()` reescrito
- **Segurança** — credenciais removidas de `consulta-sefaz.js` e `retry-sefaz.js`

### Agentes do squad (v2.0)
Todos os 4 agentes em `squads/fiscal-engine/agents/` foram atualizados com conhecimento de:
- LC 214/2025, EC 132/2023, NT 2025.002 (v1.34), NT 2025.001, NT 2026.001
- CST e cClassTrib para IBS/CBS, Split Payment, penalidades PLP 108/2024
- Cronograma de transição 2026-2033

### Arquivo principal
- `painel-caixa-escolar/squads/caixa-escolar/dashboard/server-lib/nfe-sefaz-client.js` (~1568 linhas)
- 31 exports: inclui `validateCertificateA1`, `buildIbsCbsXml`, `RTC_ALIQUOTAS`, `consultarProtocolo`, `validateCrt`

## Portal Escolar — Arquitetura de Sync

O portal da escola (`gdp-portal.html`) foi integrado ao `gdp-api.js` em 2026-05-18:

### Problema resolvido
Pedidos feitos no portal ficavam apenas no localStorage do browser — invisíveis para outras máquinas.

### Solução
- Portal inclui `gdp-api.js` (Supabase data layer)
- `confirmOrder()` → `gdpApi.pedidos.save()` (persiste no Supabase)
- `salvarEdicaoPedido()` → `gdpApi.pedidos.save()`
- `excluirPedido()` → `gdpApi.pedidos.remove()`
- Pre-load contratos/pedidos/clientes do Supabase no init e após login
- Fallback graceful: `if (window.gdpApi)` com raw fetch como backup

### Fluxo de dados
```
Portal escola → gdpApi.pedidos.save() → Supabase (tabela pedidos)
Dashboard gestor → gdpApi.pedidos.list() → Supabase (mesmos dados)
```

### Unidades de produtos (parseUnidadeFromName)
O catálogo ARP (`lariucci-arp-2025.json`) não tem campo `unidade` nos produtos. A função `parseUnidadeFromName()` no portal extrai unidades dos nomes via regex + keywords inteligentes:
- Peso: "500 gr" → GR, "1,02 Kg" → KG
- Frutas/legumes: batata, cebola, alho → KG
- Carnes/queijos: mussarela, frango → KG
- Grãos: feijão, arroz, farinha → KG
- Polpa → KG
- Sem padrão → UN

### Escola Lauriston Souza
- Cadastrada em `escolas-credentials.json` (login: `lauriston`, senha: `escola2025`)
- Frutal/MG, SRE Uberaba, catálogo LAURISTON (16 produtos, ARP-LARIUCCI-2025)

---
*Synkra AIOX Claude Code Configuration v2.0*
