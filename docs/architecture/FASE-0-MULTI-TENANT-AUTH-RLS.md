# Arquitetura — Fase 0: Multi-Tenant (Supabase Auth + RLS)

**Autor:** Aria (@architect)
**Data:** 2026-06-08
**Status:** Proposta de arquitetura (pré-implementação)
**Contexto:** Transformar o sistema **Caixa Escolar** (marca: Licit-AIX) de single-tenant (uso interno Lariucci) em SaaS multi-tenant vendável por assinatura, SEM interromper o uso atual em produção.
**Ponto de retomada:** Este documento é a fonte de verdade para retomar o trabalho. Próximo passo após aprovação: @pm cria o épico EPIC-18 a partir daqui.

## Nomenclatura correta do sistema (CRÍTICO — não confundir)

**O sistema é o "Caixa Escolar" (marca de produto: Licit-AIX).** Ele NÃO é o "GDP" — o GDP é apenas UM de seus módulos. Estrutura real (verificada em `dashboard-home.html` e `index.html`):

> **Fonte:** árvore abaixo extraída por varredura do código (data-module, switchTab, switchFinanceiroTab, data-tab) em 2026-06-08 — não da memória. IDs internos entre parênteses.

```
SISTEMA: Caixa Escolar (Licit-AIX)
├── 🏠 Home / Dashboard      (dashboard-home.html) — visão geral, KPIs, entrada
│
├── 📡 Radar                 (index.html, module=radar) — Radar de Oportunidades
│       └── Oportunidades
│
├── 💰 IntelPreços           (index.html, module=intel-precos) — Inteligência de Preços
│       ├── Pré-orçamentos salvos     (data-tab=pre-orcamento)
│       ├── Enviados ao SGD           (data-tab=envio-sgd)
│       ├── Central de Produtos       (data-tab=central-precos)
│       └── Histórico de Preços       (data-tab=historico)
│
├── 📦 GDP                   (gdp-contratos.html, module=gdp) — Gestão de Pedidos Pós-Licitação
│       ├── Contratos                 (switchTab=contratos)
│       ├── Pedidos                   (switchTab=pedidos)
│       ├── Clientes                  (switchTab=usuarios → tabela `clientes`)
│       ├── Notas Fiscais             (switchTab=notas-fiscais)
│       ├── Notas de Entrada          (switchTab=notas-entrada)
│       ├── Fornecedores              (switchTab=fornecedores)
│       ├── Central de Produtos       (switchTab=estoque)
│       ├── Estoque                   (switchTab=estoque-op)
│       ├── Relatórios                (switchTab=relatorios)
│       └── Financeiro                (switchTab=financeiro)
│              ├── Caixa                  (switchFinanceiroTab=caixa)
│              ├── Contas a Pagar         (switchFinanceiroTab=contas-pagar)
│              ├── Contas a Receber       (switchFinanceiroTab=contas-receber)
│              └── Conciliação Bancária   (switchFinanceiroTab=conciliacao)
│       (nota: "Importar" NÃO é seção — é ação auxiliar via botão switchTab=importar)
│
└── ⚙️ Configurações         (index.html, module=config)
```

> O "caixa" onde ocorreram as correções de 06-07/06 é uma sub-aba do **Financeiro**, dentro do **módulo GDP**. GDP ≠ sistema. A Fase 0 (Auth + RLS) deve isolar **TODOS os módulos e TODAS as suas seções**, não só o GDP/caixa.
> ⚠️ "Central de Produtos" e "Estoque" são DUAS seções distintas no GDP (`estoque` vs `estoque-op`) — não confundir.

---

## 0. TL;DR para o stakeholder

> **DECISÃO DO STAKEHOLDER (2026-06-08):** seguir o **Caminho B (multi-tenant real)**, mesmo que demore mais — NÃO usar o Caminho A (instância isolada). A produção da Lariucci continua em uso normal e **continua recebendo ajustes/correções de funções em paralelo** enquanto o multi-tenant é construído em staging. Ver seção 3.1 (modelo de trabalho em paralelo).

- **Escopo:** o sistema é o **Caixa Escolar** (Home + Radar + IntelPreços + GDP + Configurações). A Fase 0 isola **todos os módulos** por empresa — não só o GDP.
- **Fundação parcial existe, MAS está DESLIGADA:** tabelas `empresas`, `user_empresa`, função `get_user_empresa_id()` e políticas RLS por tenant foram escritas (009/020), porém a migration **022 reverteu TUDO para permissivo** (`USING(true)`) e a **028 (mais recente) reafirmou** isso. ⚠️ Não é "falta pouco": a RLS precisa ser **reconstruída** e acoplada ao Auth — é a maior peça de engenharia do projeto (risco ALTO).
- **O que falta de verdade (confirmado por auditoria adversarial 2026-06-08):** (1) migrar o frontend para **Supabase Auth**; (2) propagar o `access_token` do usuário como Bearer em TODAS as ~56 chamadas REST (gdp-api.js, app-sync.js, gdp-core.js, gdp-realtime.js, sync-pedidos.js, sync-entregas.js); (3) reativar RLS estrita por `empresa_id` em todas as tabelas **E** no `sync_data` (que nunca teve RLS); (4) tratar config sensível (bancária/fiscal) que hoje trafega no `sync_data`; (5) cobrir os **portais** `gdp-portal.html` e `gdp-entregador.html` (escrevem `empresa_id:'LARIUCCI'` literal). Auth + RLS devem ir no **mesmo deploy atômico**.
- **Seu uso atual NÃO para:** todo o trabalho é feito em ambiente de teste (staging). A virada em produção é curta, ensaiada, com backup e rollback. Seus dados viram o "tenant nº 1" — nada é apagado.
- **Risco respeitado:** religar RLS é a mesma operação que quebrou o sync na migration 020. A diferença: agora vem junto com o Auth (que faltava). DEVE ser testado em staging com **dois tenants fictícios** antes de produção.

---

## 1. Estado atual (verificado no código)

### 1.1 Identidade
- `getEmpresaId()` (gdp-api.js L37-61): resolve `emp.syncUserId || nomeFantasia || nome || cnpj || 'LARIUCCI'` de `localStorage['nexedu.empresa']`.
- `LARIUCCI` é **fallback fixo**. SSoT de empresa_id documentada — todos os módulos delegam aqui.

### 1.2 Autenticação (o gap principal)
- Login próprio (usuário/senha em tabela), sessão em `sessionStorage['ce.auth']`.
- **NÃO usa Supabase Auth.** Logo, não há `auth.uid()` / `auth.jwt()` no banco → RLS real é impossível hoje.

### 1.3 Isolamento — RLS DESLIGADA (o bloqueador de venda)
- Migration **022** reverteu para permissivo: `CREATE POLICY anon_full_access ... FOR ALL TO anon USING (true) WITH CHECK (true)`.
- Efeito: a anon key (exposta no frontend) lê/escreve TODAS as linhas de TODAS as empresas. **Bloqueador absoluto para multi-cliente.**
- Comentário da própria 022: *"reativar RLS só após o frontend migrar de anon key para Supabase Auth"*.

### 1.4 Fundação multi-tenant que JÁ EXISTE (reaproveitável)
| Artefato | Migration | Estado |
|----------|-----------|--------|
| Tabela `empresas` (id, ...) | 001 | ✅ existe |
| Tabela `user_empresa` (user_id→empresa_id, role) | 009 / 020 | ✅ existe, RLS própria |
| Função `get_user_empresa_id()` (auth.uid → empresa_id) | 009 | ✅ existe (SECURITY DEFINER) |
| Políticas `*_isolation` dual-mode (auth OU session) | 009 / 020 | ⚠️ escritas, depois revertidas pela 022 |
| `empresa_id` em todas as tabelas de negócio | 001+ | ✅ existe |

**Conclusão:** não partimos do zero. A Fase 0 é principalmente (a) ligar o frontend ao Auth e (b) re-aplicar/depurar a RLS que já foi desenhada.

---

## 2. Arquitetura-alvo (Fase 0)

### 2.1 Modelo de identidade
```
auth.users (Supabase Auth)  →  user_empresa (user_id, empresa_id, role)  →  empresas (id = tenant)
                                          ↓
                          get_user_empresa_id() resolve o tenant do usuário logado
                                          ↓
              RLS em cada tabela: USING (empresa_id = get_user_empresa_id())
```

- **Tenant = `empresas.id`.** Cada empresa cliente é um registro em `empresas`.
- **Usuário pertence a 1+ empresa** via `user_empresa` (suporta multi-usuário por empresa: você + Angela sob a mesma empresa).
- **JWT carrega a identidade**; a RLS resolve o tenant via `auth.uid()` → `user_empresa`. Sem `empresa_id` no localStorage para isolamento (localStorage vira só cache).

### 2.2 Fluxo de autenticação novo
1. Usuário loga via **Supabase Auth** (email/senha ou magic link).
2. Supabase emite JWT com `auth.uid()`.
3. Frontend usa o **access token do usuário** (não a anon key) nas chamadas ao Supabase.
4. RLS no banco filtra automaticamente por `empresa_id = get_user_empresa_id()`.
5. `getEmpresaId()` no cliente passa a ler o empresa_id do perfil autenticado (não mais fallback LARIUCCI).

### 2.3 RLS-alvo (TODAS as tabelas de TODOS os módulos)
```sql
-- Modelo aplicado a cada tabela de negócio (ver lista abaixo, cobrindo os 4 módulos).
ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabela>
  FOR ALL
  TO authenticated
  USING      (empresa_id = get_user_empresa_id())
  WITH CHECK (empresa_id = get_user_empresa_id());

-- anon: SEM acesso a dados de negócio (revogar). Só endpoints públicos explícitos, se houver.
```

**⚠️ DOIS mecanismos de persistência — AMBOS precisam de isolamento (ponto crítico):**

O sistema grava dados de DUAS formas. Esquecer a segunda causa vazamento entre empresas (foi onde as "Notas de Entrada" viviam nos testes de 06-07/06).

**Mecanismo 1 — Tabelas dedicadas (isolam por `empresa_id`):**

| Módulo | Seção | Tabela |
|--------|-------|--------|
| 📦 GDP | Contratos | `contratos` |
| 📦 GDP | Pedidos | `pedidos` |
| 📦 GDP | Notas Fiscais | `notas_fiscais`, `nf_counter` |
| 📦 GDP | Financeiro / Caixa | `extratos`, `conciliacoes`, `caixa_config`, `contas_receber`, `contas_pagar` |
| 📦 GDP | Clientes (Usuários) | `clientes` |
| 📦 GDP | Entregas | `entregas` |
| 📦 GDP | Central de Produtos | `produtos` |
| 📡 Radar | Oportunidades / equivalências | `resultados_orcamento`, `radar_equivalencias`, `data_snapshots` |
| 💰 IntelPreços | Pré-orçamento / Enviados ao SGD | `resultados_orcamento` |
| 💰 IntelPreços | Histórico | `preco_historico` ⚠️ (hoje fail-CLOSED: 0 linhas/indisponível — não vaza, mas precisa de RLS correta — auditoria F05) |
| 💰 IntelPreços | Estoque | `estoque_simples` |
| 🔐 Identidade | — | `empresas` (isola por `id`), `user_empresa` (por `user_id`) |
| 🔴 **Cross-cutting** | **Auditoria** | **`audit_log`** — CRÍTICO: contém snapshots `dados_antes/dados_depois` reais; nunca gravável por anon; leitura restrita por tenant (auditoria F09) |

**Mecanismo 2 — `sync_data` (store chave-valor; HOJE SEM RLS — risco confirmado pela auditoria):**

Várias seções NÃO têm tabela própria — vivem como chaves no `sync_data` via `cloudSave`. **A auditoria adversarial (2026-06-08) confirmou que `sync_data` NUNCA recebeu RLS em nenhuma das 28 migrations** — o isolamento por `user_id` é apenas um filtro de query no cliente (spoofável). Estas chaves **vazam entre empresas hoje** (latente, pois só há 1 tenant):

Lista REAL e COMPLETA extraída de `SYNC_KEYS`/`SHARED_SYNC_KEYS`/`CONFIG_SYNC_KEYS` (app-state.js L628-720) em 2026-06-08 — **31 chaves**, não ~12:

| Módulo | Categoria | Chaves em `sync_data` |
|--------|-----------|------------------------|
| 📦 GDP | Notas de Entrada | `gdp.notas-entrada.v1` (+ `.deleted.v1`) |
| 📦 GDP | Fornecedores | `gdp.estoque-intel.fornecedores.v1` (+ `.deleted.v1`) |
| 📦 GDP | Estoque (intel) | `gdp.estoque-intel.{movimentacoes,embalagens,compras,pedidos,pedido-itens,produtos}.v1` |
| 📦 GDP | Estoque (op) | `gdp.estoque.v1`, `gdp.estoque.movimentos.v1` |
| 📦 GDP | Produtos / Conversões / Demandas | `gdp.produtos.v1`, `gdp.conversoes.v1`, `gdp.demandas.v1`, `gdp.lista-compras.v1` |
| 📦 GDP | Equivalências / Integrações | `gdp.equivalencias.v1`, `gdp.integracoes.v1` |
| 📦/💰 | Central de Produtos (cache SSoT) | `intel.central-produtos.v2` |
| 💰 IntelPreços | Histórico de licitações | `intel.historico-licitacoes.v1` |
| 📡/💰 | Dados legados caixaescolar.* | `caixaescolar.{banco,contratos,preorcamentos,resultados}.v1`, `caixaescolar.{orcamentos,descartados,itens-mestres,arquivos-importados,pncp.cache}` |
| 🔴 **SENSÍVEL** | **Config bancária / fiscal / API** | **`nexedu.config.contas-bancarias`, `nexedu.config.bank-api`, `nexedu.config.notas-fiscais`** |
| 🔐 | Identidade da empresa (perfil) | `nexedu.empresa` |
| 📦 GDP | Relatórios | *derivado* — sem store próprio (herda o isolamento das fontes) |

> 🔴 **CRÍTICO (auditoria F02/AUD-003/REFUTE-004):** `sync_data` carrega **configuração bancária, parâmetros de NF-e e credenciais de API** (`nexedu.config.*`). Sob a anon key sem RLS, isso é **exposição de credencial financeira/fiscal**, não só "dados de negócio". Tratamento obrigatório: (1) `ALTER TABLE sync_data ENABLE ROW LEVEL SECURITY` com isolamento real por tenant via Auth; (2) **config sensível NÃO deve trafegar por `sync_data` sob anon key** — migrar para tabela dedicada com RLS ou Edge Function com `service_role`; (3) **auditar e rotacionar** credenciais que estiveram acessíveis via anon key.
> ⚠️ O `user_id` de `sync_data` NÃO é `auth.uid()` — vem de `getEmpresaId()` (fallback localStorage), que é **colidível** (dois tenants com mesmo `nomeFantasia` → mesma linha) e **spoofável**. Substituir por identidade determinística do JWT antes de ligar RLS (F0.4/F0.7).
> Diferença vs. migration 020 (que quebrou): lá o frontend usava anon key SEM sessão autenticada → `auth.uid()` era NULL → RLS barrava tudo. A reativação exige Auth + RLS no MESMO deploy atômico.

### 2.4 Cache tenant-aware (corrige a causa dos "fantasmas")
- Hoje o cache em localStorage de TODOS os módulos (`gdp.*` do GDP, `intel.*`/`radar.*` de IntelPreços/Radar, `caixaescolar.*`) NÃO distingue tenant. Risco: trocar de empresa/login no mesmo navegador mistura dados; cache antigo re-empurra dados (incidente observado em 2026-06-07 no caixa).
- **Alvo:** namespacear o cache por empresa_id (ex.: `<empresaId>.gdp.conciliacao.v1`) OU limpar TODO o cache de negócio (de todos os módulos) no login/logout/troca de tenant. Boot merge passa a ser tenant-aware (nunca re-enviar itens de outro tenant nem itens já soft-deletados).

---

## 3. Estratégia de execução SEM downtime (protege o uso atual)

> Princípio: o ambiente que a Lariucci usa NÃO é tocado até a virada final ensaiada.

### 3.1 Modelo de trabalho em PARALELO (decisão do stakeholder)

O stakeholder vai **continuar usando a produção e fazendo ajustes/correções de funções** durante toda a construção do multi-tenant. Para que as duas frentes não colidam:

- **Frente PRODUÇÃO (contínua):** correções e melhorias de funções existentes seguem normalmente na branch `master` → deploy Vercel de produção, como hoje. Cada ajuste é um commit/story isolado (ex.: o fix de realtime DELETE da Story 17.8). **Não exige Auth/RLS.**
- **Frente MULTI-TENANT (épico EPIC-18, em staging):** desenvolvida numa **branch dedicada** (ex.: `feature/multi-tenant`) e em **Supabase/Vercel de staging**. Não toca produção até a virada (Trilha B).
- **Sincronização das frentes:** as correções de produção devem ser **mescladas periodicamente** na branch do multi-tenant (rebase/merge) para evitar divergência grande. Recomenda-se que mudanças de produção que alterem schema/identidade sejam sinalizadas ao épico (impactam F0.4/F0.7).
- **Regra de ouro do paralelo:** nenhuma correção de produção deve introduzir NOVO `empresa_id:'LARIUCCI'` literal ou nova chave em `sync_data` sem registrar — senão amplia o trabalho de isolamento. Gate: `grep "'LARIUCCI'"` e revisão de novas chaves `cloudSave` no pre-push.

### Trilha A — Construção em STAGING (não afeta produção)
1. Criar **projeto Supabase de staging** (cópia do schema + dados de exemplo, NÃO os dados reais).
2. Criar **deploy de staging** (Vercel preview/branch).
3. Implementar Auth + RLS + cache tenant-aware no staging.
4. Testar à exaustão: incluindo o **teste de penetração de tenant** (logar como empresa A e provar que NÃO lê dados de B via API direta).
5. Ensaiar a migração de dados (carimbar empresa_id + ligar RLS) e provar que o **sync não quebra** (o erro da 020).

### Trilha B — Virada em PRODUÇÃO (curta, agendada, reversível)
1. **Backup/snapshot** do Supabase de produção (imediatamente antes).
2. **Migração de dados:** a Lariucci vira o **tenant nº 1** — criar registro em `empresas`, criar usuários no Auth, popular `user_empresa`, e `UPDATE` carimbando `empresa_id` real nos registros existentes (hoje já são 'LARIUCCI' → vira o id canônico da empresa). **Nada é apagado.**
3. **Ativar RLS** (reaplicar políticas `tenant_isolation`, reverter a 022) — em transação.
4. **Deploy do frontend** com Auth.
5. **Validação pós-corte:** você + Angela logam, veem todos os dados, sync funciona.
6. **Rollback pronto:** se o sync quebrar, reverter para a 022 (permissivo) + deploy anterior. Janela recomendada: noite/fim de semana.

---

## 4. Decomposição em blocos (insumo para o @pm montar o épico)

| # | Bloco | Complexidade | Risco | Depende de |
|---|-------|-------------|-------|-----------|
| F0.1 | Provisionar staging (Supabase + Vercel) + branch `feature/multi-tenant` | S | Baixo | — |
| F0.2 | Migrar login próprio → Supabase Auth (frontend) | L | Médio | F0.1 |
| F0.3 | Propagar `access_token` do usuário (Bearer) em TODAS as ~56 chamadas REST: gdp-api.js, app-sync.js, gdp-core.js, gdp-realtime.js, sync-pedidos.js, sync-entregas.js. `apikey`=anon só no header apikey | L | **Alto** | F0.2 |
| F0.4 | Reativar RLS `tenant_isolation` em TODAS as tabelas dedicadas **+ `sync_data` (hoje SEM RLS)** + `audit_log`; reverter 022, depurar 020. Auth+RLS no MESMO deploy atômico | L | **Alto** | F0.2, F0.3 |
| F0.4b | **Config sensível** (`nexedu.config.contas-bancarias/.bank-api/.notas-fiscais`) sai do `sync_data` sob anon → tabela dedicada com RLS ou Edge Function `service_role`. **Rotacionar** credenciais expostas | M | **Alto** | F0.4 |
| F0.5 | Cache + boot merge tenant-aware (todos os módulos: gdp.*, intel.*, radar.*, caixaescolar.*) + **purge no login/logout/troca de tenant** | M | Médio | F0.3 |
| F0.6 | Remover fallback `LARIUCCI` fixo + seeds hardcoded **INCLUSIVE nos portais `gdp-portal.html` e `gdp-entregador.html`** (escrevem `empresa_id:'LARIUCCI'` literal via REST direto). Gate: `grep "'LARIUCCI'"` = 0 | M | Médio | F0.4 |
| F0.7 | Migração de dados Lariucci → tenant nº 1. **Dedup/normalizar identidade** (user_id de sync_data é colidível) + garantir `empresa_id NOT NULL` em toda linha antes de ligar RLS | M | **Alto** | F0.4 |
| F0.8 | Teste de penetração AUTOMATIZADO com **DOIS tenants fictícios (FAKE-A/FAKE-B)** em staging: A não lê/escreve B em NENHUMA tabela nem chave `sync_data`, em todos os módulos. Versionar como script | M | — | F0.4..F0.7 |
| F0.9 | Runbook de virada produção + rollback + **pré-check** (100% requests autenticadas, `user_empresa` populado, `empresa_id NOT NULL`) | S | — | todos |

**Esforço total:** 1 épico — a maior peça de engenharia do projeto, **risco ALTO** (auditoria adversarial 2026-06-08 confirmou 7 CRITICAL + 9 HIGH latentes). Reaproveita 009/020 mas exige reconstrução da RLS + Auth juntos. **Portais e `sync_data`/config sensível são os pontos cegos mais perigosos.**

---

## 5. Gates de segurança ANTES de qualquer venda (inegociável)

1. RLS estrita ativa: `USING (empresa_id = get_user_empresa_id())` em TODAS as tabelas de negócio **E** isolamento equivalente no `sync_data` (cobrindo Notas de Entrada, Fornecedores, Central de Produtos e demais chaves KV).
2. Supabase Auth com usuário→empresa via `user_empresa` (não empresa_id no localStorage para isolamento).
3. Anon key SEM acesso a dados de negócio.
4. Teste de penetração em TODOS os módulos (GDP, Radar, IntelPreços): empresa A logada NÃO consegue ler/escrever dados de B via API direta, em nenhuma tabela. **Provado, não presumido.**
5. Cache local isolado/limpo por tenant no login/logout/troca.

> Enquanto a política for `USING (true)` (estado atual da 022), o produto NÃO está apto a multi-cliente.

---

## 6. Caminho rápido (Caminho A) — ❌ DESCARTADO pelo stakeholder

> **Decisão 2026-06-08:** o stakeholder optou por NÃO usar o Caminho A (instância isolada por cliente). O destino é o **multi-tenant compartilhado (Caminho B)**, mesmo levando mais tempo, para evitar retrabalho de migração futura. Mantido aqui só como registro histórico.
>
> ~~Caminho A: banco Supabase + deploy próprios por cliente, isolamento físico, ~10 clientes, migrar para B depois.~~ — não será adotado.
>
> ⚠️ Consequência: **nenhuma venda de segundo tenant** até os 5 gates da Seção 5 estarem PROVADOS em teste de penetração automatizado (F0.8). A produção da Lariucci permanece como tenant único até lá.

---

## 7. Próximos passos

1. **[stakeholder]** Aprovar esta arquitetura.
2. **[@pm]** Criar EPIC-18 (Multi-Tenant Fase 0) com stories a partir da seção 4.
3. **[@data-engineer]** Detalhar DDL das políticas RLS e migração de dados (F0.4, F0.7).
4. **[@dev]** Implementar por story, sempre em staging primeiro.
5. **[@devops]** Provisionar staging, conduzir a virada de produção (runbook F0.9) + rollback.

---

## 8. Proveniência / Auditoria (como este inventário foi verificado)

Para evitar erros de memória, o inventário de módulos, seções, tabelas e chaves `sync_data` foi extraído por **varredura determinística do código** em 2026-06-08, não por recordação. Reproduzível:

| O que | Como foi extraído (fonte da verdade) |
|-------|--------------------------------------|
| Módulos | `grep data-module=` em `index.html`/`dashboard-home.html` → radar, intel-precos, gdp, config |
| Abas GDP | `grep switchTab(` em `gdp-contratos.html`/`js/*.js` → 11 abas + labels via `data-gdp-tab` |
| Sub-abas Financeiro | `grep switchFinanceiroTab(` → caixa, contas-pagar, contas-receber, conciliacao |
| Abas IntelPreços | `grep data-tab=` em `index.html` → pre-orcamento, envio-sgd, central-precos, historico |
| Tabelas Supabase | `grep CREATE TABLE` em `supabase/migrations/` → 20 tabelas |
| Tabelas com API | `createEntityApi(` / `table:` em `gdp-api.js` → 11 + caixa_config |
| Chaves `sync_data` | `SYNC_KEYS`/`SHARED_SYNC_KEYS`/`CONFIG_SYNC_KEYS` em `app-state.js` L628-720 → **31 chaves** |

**Divergências corrigidas na varredura inicial (2026-06-08):** (1) "Central de Produtos" vs "Estoque" eram tratadas como uma; são duas seções distintas (`estoque` vs `estoque-op`). (2) Faltava "Clientes" na árvore. (3) Nomes do IntelPreços aproximados → corrigidos. (4) `sync_data` subdimensionado → lista real. (5) "Importar" classificado como ação, não seção.

### 8.1 Auditoria adversarial (2026-06-08) — 61 agentes, 818 verificações de código

Workflow adversarial: 5 auditores independentes tentando REFUTAR o documento (segurança/RLS, vazamento sync_data, risco de migração, completude de escopo, viabilidade do Auth); cada achado verificado contra o código real. Resultado: **55 alegações → 27 confirmadas, 28 falso-positivos descartados** (7 CRITICAL, 9 HIGH, 9 MEDIUM, 2 LOW). Veredito: *"Apto a virar EPIC-18; NÃO apto a vender multi-tenant hoje (bloqueador absoluto)"*.

**Correções aplicadas a este documento a partir da auditoria (2026-06-08):**
1. ✅ TL;DR: deixado explícito que a RLS foi REVERTIDA (022) e reafirmada (028) — não é "falta pouco"; é reconstrução.
2. ✅ `sync_data`: lista real de **31 chaves** (não ~12), com destaque para config **bancária/fiscal/API** sensível → novo bloco F0.4b (sair do sync_data + rotacionar credenciais).
3. ✅ `nexedu.empresa` no KV não isola por empresa_id (corrigido).
4. ✅ `audit_log` elevado a tabela CRÍTICA; `preco_historico` marcado fail-closed.
5. ✅ Portais `gdp-portal.html`/`gdp-entregador.html` (escrevem `'LARIUCCI'` literal) incluídos em F0.6 e no teste F0.8.
6. ✅ F0.3 detalhado (Bearer token nas ~56 chamadas); F0.7 com dedup de identidade; F0.8 com dois tenants fictícios automatizados; F0.9 com pré-check.

**Achados-raiz CRITICAL/HIGH (todos endereçados na seção 4):** RLS permissiva total (F01/F04/F12/AUD-002); `sync_data` sem RLS com credenciais (F02/AUD-003/REFUTE-004); identidade via localStorage colidível/spoofável (F0006/F03/F11); produtos/estoque permissivos (F07); portais com `'LARIUCCI'` literal (AUD-005); cache sem namespace/purge (F0008).

> **Status de confiança:** documento agora alinhado ao código E validado adversarialmente. Confiança ALTA como PLANO. Como atestado de prontidão para venda: ZERO até os 5 gates (Seção 5) serem PROVADOS em teste de penetração com dois tenants reais.

---

*Arquitetura Fase 0 — Aria (@architect). Ancorada nas migrations reais 001/006/009/020/022/028, em inventário por varredura e em auditoria adversarial (61 agentes) — 2026-06-08. Validada e pronta para virar EPIC-18.*
