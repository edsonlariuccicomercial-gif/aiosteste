# SOP — Recuperação de Incidentes & Continuidade Operacional

**Código:** SOP-IR-001 | **Versão:** 1.0 | **Data:** 2026-03-17
**Squad:** Caixa Escolar | **Módulo:** Operações de Produção
**Autor:** Deming (SOP Factory) | **Solicitante:** River (SM)

---

## Sumário Executivo

Este SOP define os procedimentos padrão para **detecção, resposta, recuperação e continuidade** quando o sistema de desenvolvimento (agentes AIOS, APIs externas, infraestrutura local ou cloud) sofrer qualquer tipo de interrupção. O objetivo é que qualquer membro da equipe saiba exatamente o que fazer, sem depender de conhecimento tribal.

---

## 1. Classificação de Incidentes

| Severidade | Descrição | Exemplos | Tempo de Resposta |
|------------|-----------|----------|-------------------|
| **P1 — Crítico** | Sistema completamente parado | API Anthropic 500, Vercel fora do ar, servidor local crash | < 5 min |
| **P2 — Alto** | Funcionalidade principal quebrada | SGD API fora, Tiny rejeitando pedidos, order.js falhando | < 15 min |
| **P3 — Médio** | Degradação parcial | Sync lento, dados desatualizados, tab do dashboard quebrada | < 1 hora |
| **P4 — Baixo** | Cosmético ou não-bloqueante | Bug visual, tooltip errado, log excessivo | Próximo turno |

---

## 2. Playbook de Resposta por Tipo de Falha

### 2.1 — Falha de API Externa (Anthropic, SGD, Tiny, PNCP)

**Sintomas:**
- Erro 500/502/503 nos agentes ou no dashboard
- Mensagem: `API Error: 500 {"type":"error","error":{"type":"api_error"}}`
- Agentes param de responder no terminal
- Dashboard mostra "Erro de conexão" ou dados não carregam

**Ação imediata (0–5 min):**

1. **Identificar qual API caiu** — ler a mensagem de erro:
   | Mensagem contém | API afetada |
   |-----------------|-------------|
   | `anthropic` ou `api_error` | Claude API (Anthropic) |
   | `caixaescolar.educacao.mg.gov.br` | SGD |
   | `tiny.com.br` ou `api.tiny` | Tiny ERP |
   | `pncp.gov.br` | PNCP |

2. **Verificar se é problema geral ou local:**
   - Anthropic: checar https://status.anthropic.com
   - SGD: testar login manual no portal
   - Tiny: checar painel admin do Tiny
   - Vercel: checar https://vercel-status.com

3. **Se API externa está fora:** PARE de tentar. Não fique reexecutando comandos — isso gasta tokens e não resolve nada.

**Recuperação (5–15 min):**

4. **Salvar o contexto atual** antes de fechar qualquer coisa:
   ```
   - Anotar qual story estava sendo trabalhada (ex: Story 4.13)
   - Anotar qual agente estava ativo (ex: @dev)
   - Anotar o último comando executado
   - Verificar se há mudanças não salvas:
   ```
   ```bash
   git status
   git diff --stat
   ```

5. **Se a API é a Anthropic (agentes AIOS):**
   - Fechar o terminal do Claude Code
   - Aguardar 5–10 minutos
   - Reabrir e testar com um comando simples (ex: `git status`)
   - Se funcionar, retomar o trabalho (ver Seção 4)

6. **Se a API é SGD/Tiny/PNCP:**
   - O dashboard continua funcionando com dados em cache
   - Não submeta pedidos ou cotações até a API voltar
   - Monitore o status e retome quando disponível

**Pós-incidente:**
- Executar checklist da Seção 5
- Registrar incidente (Seção 6)

---

### 2.2 — Crash do Terminal / VS Code / Editor

**Sintomas:**
- Terminal fecha sozinho
- VS Code trava ou reinicia
- Tela azul (Windows BSOD)
- Processo do Node morre

**Ação imediata (0–5 min):**

1. **Reabrir o editor/terminal**

2. **Verificar estado do git:**
   ```bash
   git status
   git log --oneline -5
   ```

3. **Verificar se o servidor local está rodando:**
   ```bash
   # Se usava localhost:8082
   curl http://localhost:8082 2>/dev/null || echo "Servidor parado"
   ```

4. **Reiniciar servidor se necessário:**
   ```powershell
   cd painel-caixa-escolar/squads/caixa-escolar/dashboard
   npx http-server -p 8082 -c-1 --cors
   ```

**Recuperação:**
- Mudanças commitadas estão seguras (git protege)
- Mudanças não commitadas: verificar com `git diff`
- Se houve perda: verificar backups do editor (VS Code tem recovery automático)

---

### 2.3 — Queda de Energia / Internet

**Sintomas:**
- Tudo parou de funcionar
- PC desligou

**Ação imediata ao retornar:**

1. **Ligar o PC, abrir o terminal**

2. **Verificar integridade do repositório:**
   ```bash
   git status
   git fsck --quick
   ```
   - Se `git fsck` reportar erros: `git fsck --full` e seguir instruções

3. **Verificar arquivos de dados JSON:**
   ```bash
   # Testar se os JSONs principais estão válidos
   node -e "JSON.parse(require('fs').readFileSync('dashboard/data/banco-precos.json'))"
   ```
   - Se JSON corrompido: restaurar do último commit:
     ```bash
     git checkout -- dashboard/data/arquivo-corrompido.json
     ```

4. **Reconectar cloud sync (Supabase):**
   - Abrir o dashboard no browser
   - Clicar no botão de sync cloud (se existir)
   - Ou: verificar localStorage no DevTools do browser

---

### 2.4 — Erro de Git (Conflito, Branch Corrompida, Merge Errado)

**Sintomas:**
- `git pull` dá conflito
- Branch sumiu ou está em estado estranho
- Commit foi para branch errada

**Ação imediata:**

1. **NUNCA usar `git reset --hard` ou `git clean -f` sem pensar** — pode perder trabalho

2. **Ver onde você está:**
   ```bash
   git branch -v
   git log --oneline -10
   git status
   ```

3. **Conflito de merge:**
   ```bash
   # Ver quais arquivos têm conflito
   git diff --name-only --diff-filter=U
   # Resolver manualmente cada arquivo, depois:
   git add arquivo-resolvido.js
   git commit -m "fix: resolver conflito de merge em arquivo.js"
   ```

4. **Commit na branch errada:**
   ```bash
   # Salvar o commit
   git log --oneline -1  # anotar o hash
   # Voltar para branch correta
   git checkout feat/caixa-escolar-fase3-sgd
   # Trazer o commit
   git cherry-pick <hash>
   ```

5. **Branch corrompida — pedir ajuda ao @devops** (não tente resolver sozinho)

---

### 2.5 — Falha de Deploy (Vercel)

**Sintomas:**
- `vercel --prod` falha
- Dashboard live mostra erro 404/500
- Build não completa

**Ação imediata:**

1. **Verificar logs do deploy:**
   ```bash
   vercel logs
   ```

2. **Rollback para versão anterior:**
   ```bash
   vercel rollback
   ```

3. **Se o problema é no código:**
   - Identificar o commit que quebrou: `git log --oneline -5`
   - Reverter: `git revert <hash-do-commit-quebrado>`
   - Redesployer: `vercel --prod`

4. **Se Vercel está fora do ar:** aguardar, o deploy anterior continua funcionando

---

### 2.6 — Perda de Dados (localStorage, JSON, Supabase)

**Sintomas:**
- Dashboard abriu vazio
- Pré-orçamentos sumiram
- Banco de preços zerado

**Ação imediata — NÃO ENTRE EM PÂNICO:**

1. **Verificar se é problema do browser:**
   - Abrir em aba anônima — se dados aparecem, é cache corrompido
   - Limpar cache do site específico (não todo o browser)

2. **Restaurar localStorage:**
   ```javascript
   // No console do browser (F12)
   // Verificar o que existe:
   Object.keys(localStorage).filter(k => k.startsWith('caixaescolar'))
   ```

3. **Restaurar de Supabase (cloud backup):**
   - Abrir dashboard → seção de sync → "Carregar do Cloud"

4. **Restaurar JSONs de dados do git:**
   ```bash
   git checkout -- dashboard/data/
   ```

---

## 3. Fluxograma de Decisão

```
INCIDENTE DETECTADO
       │
       ▼
┌──────────────┐
│ O que falhou? │
└──────┬───────┘
       │
       ├─── API externa? ──────► Seção 2.1
       ├─── Terminal/Editor? ──► Seção 2.2
       ├─── Energia/Internet? ─► Seção 2.3
       ├─── Git? ──────────────► Seção 2.4
       ├─── Deploy? ───────────► Seção 2.5
       └─── Dados perdidos? ───► Seção 2.6
```

---

## 4. Procedimento de Continuidade — Retomar o Trabalho

Após qualquer incidente resolvido, siga estes passos para retomar de onde parou:

### Passo 1 — Verificar estado do projeto
```bash
git status
git log --oneline -5
git branch -v
```

### Passo 2 — Identificar a story ativa
```bash
# Ver a story mais recente na branch atual
ls -la painel-caixa-escolar/docs/stories/4.*.story.md
```
- Abrir a story e verificar quais tarefas estão marcadas [x] e quais estão pendentes [ ]

### Passo 3 — Verificar mudanças não commitadas
```bash
git diff --stat
```
- Se houver mudanças pendentes: decidir se commita ou descarta
- Se não houver: o último commit é o ponto de retomada

### Passo 4 — Reativar o agente correto
- Chamar o agente que estava ativo antes do incidente:
  ```
  @dev   → para continuar implementação
  @qa    → para continuar testes
  @sm    → para gestão de stories
  ```

### Passo 5 — Dar contexto ao agente
Ao chamar o agente, informar:
```
"Estávamos trabalhando na Story X.Y, task Z.
Último commit: [hash]. Branch: [nome].
Retomar de onde paramos."
```

### Passo 6 — Verificar servidor local
```powershell
# Se precisa do servidor local
cd painel-caixa-escolar/squads/caixa-escolar/dashboard
npx http-server -p 8082 -c-1 --cors
```

---

## 5. Checklist Pós-Incidente

Executar após QUALQUER incidente, independente da severidade:

### Verificação de Integridade
- [ ] `git status` mostra estado limpo ou mudanças conhecidas
- [ ] `git log --oneline -5` mostra os commits esperados
- [ ] Branch correta está ativa (`git branch --show-current`)
- [ ] Nenhum arquivo foi corrompido ou perdido

### Verificação de Dados
- [ ] JSONs em `dashboard/data/` estão válidos (não corrompidos)
- [ ] localStorage do browser contém os dados esperados
- [ ] Cloud sync (Supabase) está funcional

### Verificação de Infraestrutura
- [ ] Servidor local responde (se aplicável)
- [ ] Dashboard Vercel está acessível
- [ ] APIs externas estão respondendo (SGD, Tiny)

### Verificação de Trabalho
- [ ] Story ativa identificada e checkboxes conferidos
- [ ] Nenhum trabalho em andamento foi perdido
- [ ] Mudanças não commitadas foram salvas ou documentadas

---

## 6. Registro de Incidentes

Após resolver o incidente e executar o checklist, registrar em `docs/ops/incidents/`:

**Formato do arquivo:** `YYYY-MM-DD-tipo-resumo.md`

**Template:**
```markdown
# Incidente: [Título curto]

- **Data/Hora:** YYYY-MM-DD HH:MM
- **Severidade:** P1/P2/P3/P4
- **Tipo:** API | Terminal | Energia | Git | Deploy | Dados
- **Duração:** X minutos
- **Impacto:** [O que ficou parado]

## O que aconteceu
[Descrição breve]

## Como foi resolvido
[Passos tomados]

## Causa raiz
[Por que aconteceu]

## Ação preventiva
[O que fazer para evitar no futuro — se aplicável]
```

---

## 7. Prevenção — Boas Práticas Diárias

### Commits frequentes
- **Commitar a cada tarefa concluída**, não acumular mudanças
- Mensagem clara: `feat:`, `fix:`, `docs:` + referência à story

### Backup de dados
- Usar cloud sync (Supabase) diariamente
- Exportar JSONs críticos antes de operações arriscadas

### Verificação de saúde
- Executar `npm.cmd run ops:start-day` no início do turno
- Verificar status das APIs antes de começar trabalho crítico

### Contexto documentado
- Sempre anotar a story ativa e a task atual
- Ao pausar o trabalho: commitar ou anotar o estado

---

## 8. Matriz de Escalação

| Situação | Escalar para | Como |
|----------|-------------|------|
| Incidente P1 > 15 min sem resolução | @devops (Gage) | Chamar no terminal |
| Suspeita de perda de dados | @data-engineer (Dara) | Chamar no terminal |
| Problema de arquitetura | @architect (Aria) | Chamar no terminal |
| Impacto no negócio | @pm (Morgan) | Notificar |
| Tudo falhou | @aios-master | Escalação máxima |

---

## 9. Referências Relacionadas

| Documento | Caminho |
|-----------|---------|
| Runbook Operacional Diário | `docs/ops/operational-daily-runbook.md` |
| Release Checklist | `docs/ops/release-checklist.md` |
| Pré-Cotação SGD | `docs/ops/pre-cotacao-sgd-runbook.md` |
| Arquitetura do Sistema | `docs/architecture/system-architecture.md` |
| SOP Inteligência de Preços | `docs/stories/SOP-INTELIGENCIA-PRECOS-V2.md` |

---

## Histórico de Revisões

| Versão | Data | Autor | Mudança |
|--------|------|-------|---------|
| 1.0 | 2026-03-17 | Deming (SOP Factory) | Versão inicial — criada após incidente API 500 |

---

**Quality Gate:** SOP-IR-001 ✓ | PDCA Compliant ✓ | ISO 9001:2015 §7.5 ✓

*Produzido pela SOP Factory — Deming, Orchestrator 🏭*
