# Validacao de Especialista — Database

**Fase:** Brownfield Discovery — Fase 5
**Agente:** @data-engineer (Dara)
**Data:** 2026-03-09
**Documento revisado:** `docs/prd/technical-debt-DRAFT.md`

---

## 1. Validacao dos Debitos de Dados

### 1.1 Debitos Confirmados

| ID DRAFT | Veredicto | Ajuste | Justificativa |
|----------|-----------|--------|---------------|
| D-01 (Senhas em texto plano) | **CONFIRMADO** | Severidade mantida CRITICO | Senhas de 5 escolas em plain text commitadas no repositorio. Risco real e imediato. Requer `git filter-branch` para limpar historico. |
| D-02 (Senha no comentario auth.js) | **CONFIRMADO** | Severidade mantida CRITICO | `lariucci2026` no comentario. Trivial de explorar. |
| D-03 (APIs sem autenticacao) | **CONFIRMADO** | Severidade mantida CRITICO | Qualquer pessoa pode POST /api/sgd/submit e enviar propostas reais ao SGD em nome do fornecedor. |
| D-04 (CNPJ real no .env.example) | **CONFIRMADO** | Severidade ajustada: ALTO → CRITICO | CNPJ real commitado permite rastreamento do fornecedor e engenharia social. Correcao e trivial (0.5h). |
| D-05 (Sem backup) | **CONFIRMADO** | Mantido ALTO | JSON files sao o unico storage. Sem backup = perda total. |
| D-06 (Escrita nao-atomica) | **CONFIRMADO** | Mantido ALTO | `writeFileSync` pode deixar arquivo corrompido (truncado) em caso de crash durante escrita. |
| D-07 (Sem validacao schema) | **CONFIRMADO** | Mantido ALTO | Nenhum ponto de validacao. Dados da API SGD sao confiados cegamente. |
| D-08 (Scan sequencial) | **CONFIRMADO** | Severidade ajustada: ALTO → MEDIO | Performance e ruim mas funcional. 5-10 min para 60 budgets e aceitavel no contexto de cron diario as 20h. |
| D-09 (Fuzzy match no submit) | **CONFIRMADO** | Severidade elevada: ALTO → CRITICO | Mapeamento errado de itens significa enviar **precos errados** ao SGD governamental. Pode configurar fraude ou irregularidade. |
| D-10 (Sem versionamento) | **CONFIRMADO** | Mantido MEDIO | Importante para auditoria mas nao urgente. |
| D-11 (readFileSync) | **CONFIRMADO** | Mantido MEDIO | Bloqueia event loop mas impacto real e baixo no volume atual. |
| D-12 (Coleta duplicada) | **CONFIRMADO** | Mantido MEDIO | Playwright e REST geram dados potencialmente inconsistentes. |
| D-13 (Estimativa ficticia) | **CONFIRMADO** | Severidade elevada: MEDIO → ALTO | A formula hash gera precos completamente ficticios que podem induzir o fornecedor a erro. Precisa integrar com banco-precos.json real. |
| D-14 (Nearest-match groups) | **CONFIRMADO** | Mantido MEDIO | Threshold de 30 e arbitrario. Pode falhar em SREs diferentes. |
| D-15 (Sem paginacao) | **CONFIRMADO** | Mantido MEDIO | Problemas so surgirao com >500 registros. |
| D-16 (ARP hardcoded) | **CONFIRMADO** | Mantido BAIXO | Atualizacao manual aceitavel por enquanto (anual). |
| D-17 (Sem indices) | **CONFIRMADO** | Mantido BAIXO | Volume atual e pequeno (<100 registros). |
| D-18 (Sem rotacao logs) | **CONFIRMADO** | Mantido BAIXO | Impacto real minimo no volume atual. |
| D-19 (PII LGPD) | **CONFIRMADO** | Severidade elevada: ALTO → CRITICO | Dados pessoais de responsaveis de escolas publicas expostos em repositorio. Violacao clara da LGPD (Lei 13.709/2018). |
| D-20 (Emails pessoais) | **CONFIRMADO** | Mantido MEDIO | Emails comerciais sao menos sensiveis que senhas, mas ainda PII. |

### 1.2 Debitos Removidos

Nenhum debito foi removido. Todos os 20 debitos de dados sao validos.

### 1.3 Debitos Adicionados

| ID | Debito | Severidade | Esforco | Justificativa |
|----|--------|-----------|---------|---------------|
| D-21 | **Sem transacoes** — operacoes que modificam multiplos arquivos JSON (orcamentos + scan-log + quotes) nao sao atomicas | ALTO | 6h | Se crash ocorrer entre escritas, dados ficam em estado inconsistente. |
| D-22 | **Sem migracao de schema** — nao ha mecanismo para evoluir o formato dos JSON files quando novos campos sao adicionados | MEDIO | 4h | Registros antigos podem nao ter campos novos, causando erros de acesso. |
| D-23 | **Colisao de concorrencia** — cron job e endpoint manual `/api/sgd/scan` podem executar simultaneamente, ambos lendo/escrevendo orcamentos.json | ALTO | 3h | Corrupcao de dados por race condition. Precisa de lock file ou mutex. |
| D-24 | **Netlify Blobs nao utilizado para dados criticos** — @netlify/blobs esta instalado mas dados criticos ficam em JSON local | MEDIO | 8h | Migrar dados criticos para Netlify Blobs daria persistencia serverless com redundancia. |
| D-25 | **Sem auditoria de acesso** — nenhum log de quem acessou ou modificou dados | ALTO | 4h | Em sistema governamental, auditoria e requisito. Nao ha como saber quem enviou uma proposta. |

---

## 2. Estimativas de Horas por Debito

| ID | Debito (resumo) | Horas Estimadas | Complexidade | Dependencias |
|----|-----------------|----------------|-------------|-------------|
| D-01 | Remover credenciais do repo + git filter-branch | 3h | Media | Nenhuma (pode ser feito primeiro) |
| D-02 | Remover senha comentada + auth server-side | 6h | Media | SEC-1 (implementar auth real) |
| D-03 | Middleware autenticacao Express + Netlify | 6h | Media | D-02 (precisa auth funcional) |
| D-04 | Substituir CNPJ no .env.example | 0.5h | Trivial | Nenhuma |
| D-05 | Backup rotativo com timestamped snapshots | 4h | Baixa | D-24 (idealmente usar Blobs) |
| D-06 | Escrita atomica: write-to-temp + rename | 3h | Baixa | Nenhuma |
| D-07 | Validacao com Zod em todos pontos de entrada | 10h | Alta | Nenhuma |
| D-08 | Paralelismo SGD scan com pool (max 5 concorrentes) | 4h | Media | Nenhuma |
| D-09 | Matching deterministico por idBudgetItem | 8h | Alta | Investigacao da API SGD para campos disponiveis |
| D-10 | Adicionar updatedAt + changelog em registros | 4h | Baixa | D-22 (migracao de schema) |
| D-11 | Migrar readFileSync → fs.promises | 2h | Baixa | Nenhuma |
| D-12 | Unificar pipeline coleta (eliminar Playwright) | 10h | Alta | Validar que REST cobre todos os cenarios |
| D-13 | Integrar estimativa com banco-precos.json real | 8h | Media | D-07 (banco validado) |
| D-14 | Cache local de expense groups por rede | 3h | Baixa | Nenhuma |
| D-15 | Paginacao server-side com query params | 4h | Media | Nenhuma |
| D-16 | Scraping do CatalogoMobile para ARP dinamica | 10h | Alta | Acesso ao CatalogoMobile |
| D-17 | Map em memoria para lookups frequentes | 2h | Baixa | Nenhuma |
| D-18 | Rotacao de logs com archiving | 2h | Baixa | Nenhuma |
| D-19 | Remover PII do repo + sanitizar + LGPD compliance | 6h | Media | D-01 (mesmo git filter-branch) |
| D-20 | Anonimizar emails pessoais | 2h | Baixa | Nenhuma |
| D-21 | Transacoes multi-arquivo (write-ahead log simples) | 6h | Alta | D-06 (escrita atomica) |
| D-22 | Sistema de migracao de schema JSON | 4h | Media | D-07 (schemas definidos) |
| D-23 | Lock file para prevenir concorrencia scan | 3h | Baixa | Nenhuma |
| D-24 | Migrar dados criticos para Netlify Blobs | 10h | Alta | Investigacao Netlify Blobs API |
| D-25 | Implementar audit log de acessos e operacoes | 6h | Media | D-03 (auth precisa existir) |

**Total estimado (dados):** ~131.5 horas

---

## 3. Priorizacao da Perspectiva de Dados

### 3.1 Ordem Recomendada de Resolucao

**Sprint 1 — Seguranca de Dados (IMEDIATO - Semana 1)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 1 | D-04 | CNPJ no .env.example | 0.5h | Trivial, correcao em 5 min |
| 2 | D-01 + D-19 | Credenciais + PII no repo | 6h | git filter-branch unico para limpar historico |
| 3 | D-02 | Senha no comentario | 1h | Remover comentario (auth real vem depois) |
| 4 | D-23 | Lock file concorrencia | 3h | Previne corrupcao imediata |
| **Subtotal** | | | **10.5h** | |

**Sprint 2 — Integridade de Dados (Semana 2-3)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 5 | D-06 | Escrita atomica | 3h | Previne corrupcao de JSON |
| 6 | D-03 | Auth nas APIs | 6h | Previne acesso nao autorizado |
| 7 | D-07 | Validacao schema (Zod) | 10h | Fundacao para qualidade de dados |
| 8 | D-09 | Matching deterministico | 8h | Evita precos errados no SGD |
| 9 | D-25 | Audit log | 6h | Rastreabilidade de operacoes |
| **Subtotal** | | | **33h** | |

**Sprint 3 — Qualidade e Consolidacao (Semana 4-5)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 10 | D-05 | Backup automatico | 4h | Protecao contra perda de dados |
| 11 | D-13 | Estimativas reais | 8h | Precos corretos para o fornecedor |
| 12 | D-12 | Unificar coleta | 10h | Eliminar duplicidade |
| 13 | D-21 | Transacoes multi-arquivo | 6h | Consistencia entre arquivos |
| 14 | D-22 | Migracao de schema | 4h | Evolucao sustentavel |
| **Subtotal** | | | **32h** | |

**Sprint 4 — Otimizacao (Semana 6-7)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 15 | D-10 | Versionamento de dados | 4h | Auditoria |
| 16 | D-11 | Async file operations | 2h | Performance |
| 17 | D-14 | Cache expense groups | 3h | Corretude |
| 18 | D-15 | Paginacao server-side | 4h | Escalabilidade |
| 19 | D-08 | Scan paralelo | 4h | Performance |
| 20 | D-24 | Netlify Blobs para dados | 10h | Persistencia robusta |
| **Subtotal** | | | **27h** | |

**Sprint 5 — Polish (Semana 8)**

| Ordem | ID | Debito | Horas | Justificativa |
|-------|-----|--------|-------|---------------|
| 21 | D-17 | Indices em memoria | 2h | Performance menor |
| 22 | D-18 | Rotacao de logs | 2h | Operacional |
| 23 | D-20 | Anonimizar emails | 2h | LGPD complementar |
| 24 | D-16 | ARP dinamica | 10h | Automacao |
| **Subtotal** | | | **16h** | |

---

## 4. Recomendacoes de Resolucao

### 4.1 Estrategia de Migracao de Storage

**Recomendacao: Migrar para Supabase (PostgreSQL) em fases.**

| Fase | Escopo | Justificativa |
|------|--------|---------------|
| Fase 1 | Manter JSON files + adicionar Zod validation | Estabilizar dados atuais sem mudar infra |
| Fase 2 | Migrar credenciais para Supabase Auth | Eliminar escolas-credentials.json |
| Fase 3 | Migrar orcamentos e pedidos para Supabase Database | Ganhar transacoes, indices, backups, RLS |
| Fase 4 | Eliminar JSON files restantes | Migrar banco-precos, ARP para Supabase |

**Por que Supabase e nao SQLite:**
- Netlify deploy e serverless — SQLite nao funciona bem com Netlify Functions
- Supabase oferece autenticacao, RLS (Row Level Security), backup automatico
- Free tier generoso para o volume de dados atual (~80 KB)
- Supabase Auth resolveria D-01, D-02, D-03, SEC-1, SEC-3, SEC-5 de uma vez

**Por que nao Netlify Blobs sozinho:**
- Netlify Blobs e key-value, sem queries, sem indices, sem transacoes
- Adequado para backup/cache mas nao como database principal

### 4.2 Validacao de Schema — Recomendacao Zod

```
Justificativa: Zod funciona em runtime JS puro (sem TypeScript necessario),
gera tipos automaticamente se/quando TypeScript for adotado,
e e a lib de validacao mais popular do ecossistema Node.js.
```

**Schemas prioritarios a definir:**
1. `OrcamentoSchema` — entidade principal
2. `PropostaSchema` — payload de envio ao SGD
3. `PedidoSchema` — pedido Olist/Tiny
4. `PrecoSchema` — item do banco de precos
5. `EscolaSchema` — dados de escola (sem credenciais)

### 4.3 Fuzzy Match (D-09) — Resolucao

O matching atual usa `includes()` bidirecional para mapear itens do banco de precos com itens do orcamento SGD. Isso e perigoso pois:
- "CAFE" faz match com "CAFE SOLUVEL" e "CAFE EM PO" sem distincao
- Fallback por indice assume que a ordem dos itens e igual em ambas as listas

**Recomendacao:** Mapear por `idBudgetItem` (ID unico do SGD) quando disponivel. Para casos onde o ID nao esta disponivel, usar matching por Levenshtein distance com threshold minimo de 80% de similaridade e confirmacao manual quando abaixo de 90%.

### 4.4 LGPD — Acoes Necessarias

| Acao | Prazo | Responsavel |
|------|-------|------------|
| Remover escolas-credentials.json do repo + historico | Imediato | @devops |
| Criar politica de retencao de dados | 30 dias | @pm |
| Implementar consentimento para coleta de PII | 60 dias | @dev + @pm |
| Nomear DPO (Data Protection Officer) ou responsavel | 30 dias | Gestao |
| Registrar tratamento de dados no ROPA | 60 dias | @pm |

---

## 5. Respostas as Perguntas do Architect

### Pergunta 1: Migracao de storage
**Resposta:** Supabase (PostgreSQL) em fases. SQLite nao funciona bem com Netlify serverless. Netlify Blobs para backup/cache complementar. Ver secao 4.1.

### Pergunta 2: Backup strategy
**Resposta:** Curto prazo: Netlify Blobs como backup automatico (JSON serializado) com retencao de 30 dias. Medio prazo: Supabase com backup automatico nativo.

### Pergunta 3: Zod ou JSON Schema?
**Resposta:** Zod. Funciona em runtime JS, API mais ergonomica, gera tipos se TypeScript for adotado. JSON Schema e mais verboso e requer lib adicional (Ajv).

### Pergunta 4: Fuzzy match e arriscado?
**Resposta:** Sim, confirmado CRITICO. `includes()` bidirecional pode gerar matches falso-positivos. Recomendar matching por ID do SGD com fallback Levenshtein. Ver secao 4.3.

### Pergunta 5: Formula de custo e ficticia?
**Resposta:** Sim. `4000 + ((idBudget % 1000) * 17)` gera valores entre R$4.000 e R$21.000 sem base real. Deve ser substituida por calculo baseado em banco-precos.json (custo real + margem).

### Pergunta 6: LGPD alem de remover do repo?
**Resposta:** Sim, multiplas acoes necessarias. Ver secao 4.4 — inclui politica de retencao, consentimento, DPO e ROPA.

---

*Validado por @data-engineer (Dara) — Brownfield Discovery Fase 5*
*Dara, dados com integridade*
