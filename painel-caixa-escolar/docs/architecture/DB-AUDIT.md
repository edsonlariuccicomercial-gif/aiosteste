# Database Audit — GDP Painel Caixa Escolar

**Fase:** Brownfield Discovery — Fase 2
**Agente:** @data-engineer (executado por @architect)
**Data:** 2026-06-02
**Database:** Supabase PostgreSQL

---

## 1. Resumo Executivo

O banco de dados evoluiu de **zero** (JSON flat files) para **19 migrations** em ~2 meses (abril-junho 2026). A arquitetura é sólida para o estágio atual, com multi-tenant, RLS, audit trail, retention policies e indexes otimizados. Existem débitos pontuais que devem ser endereçados para escalar.

---

## 2. Pontos Fortes

| Aspecto | Avaliação | Detalhes |
|---------|-----------|---------|
| Multi-tenant | ✅ Sólido | empresa_id em todas as tabelas, RLS ativo |
| Audit trail | ✅ Completo | audit_log com trigger em 7 tabelas operacionais |
| Backup | ✅ Automatizado | data_snapshots + snapshot_all() RPC |
| Retention | ✅ Configurado | pg_cron: 90 dias snapshots, 365 dias audit |
| Atomic counter | ✅ Thread-safe | next_nf_number() com FOR UPDATE lock |
| Indexes | ✅ Otimizado | 44+ indexes, partial indexes, fillfactor tuning |
| Type safety | ✅ CHECK constraints | Status enums validados no banco |
| Financial integrity | ✅ NOT NULL | Valores financeiros obrigatórios (Migr. 010) |
| Analytics | ✅ RPC Functions | 3 funções de pricing intelligence |
| Disk I/O | ✅ Otimizado | Fillfactor 85/95, audit skip unchanged (Migr. 017) |

---

## 3. Débitos Identificados

### 3.1 CRÍTICOS

| ID | Débito | Impacto | Recomendação |
|----|--------|---------|-------------|
| DB-C1 | RLS permissivo (anon full access) em tabelas principais | Segurança: qualquer requisição anon pode ler/escrever qualquer empresa | Migrar para RLS baseado em auth.uid() + user_empresa; remover policies anon_full_access |
| DB-C2 | Credenciais de clientes (login/senha) em plaintext na tabela clientes | Segurança: senhas sem hash | Hash bcrypt via trigger ou mover auth para Supabase Auth |

### 3.2 ALTOS

| ID | Débito | Impacto | Recomendação |
|----|--------|---------|-------------|
| DB-A1 | conciliacoes.extrato_id não é FK formal | Integridade: referência órfã possível | ALTER TABLE ADD CONSTRAINT FK |
| DB-A2 | TypeScript definitions (database.ts) desatualizadas | Dev experience: tipos não refletem colunas adicionadas em 015/016/018 | Atualizar database.ts com colunas de clientes, extratos, conciliacoes |
| DB-A3 | Tabelas extratos/conciliacoes sem audit_trigger | Rastreabilidade incompleta | Adicionar audit trigger como nas outras tabelas |
| DB-A4 | Três estratégias RLS coexistindo (006, 007, 009) | Complexidade: difícil de auditar qual policy está ativa | Consolidar em uma única estratégia (preferir auth.uid()) |

### 3.3 MÉDIOS

| ID | Débito | Impacto | Recomendação |
|----|--------|---------|-------------|
| DB-M1 | PK tipo TEXT para IDs (não UUID nativo) | Performance: TEXT PK é mais lento que UUID | Aceitável para volume atual; migrar se escalar |
| DB-M2 | JSONB extensivo (15+ colunas JSONB) | Query: difícil de indexar/filtrar | Aceitável para flexibilidade; extrair para colunas se padrões se estabilizarem |
| DB-M3 | empresa_id default 'LARIUCCI' hardcoded em extratos/conciliacoes | Multi-tenant: assume single tenant | Remover default, exigir empresa_id explícito |
| DB-M4 | Sem ENUM types (usa TEXT + CHECK) | Validação: CHECK constraints são mais frágeis | Aceitável; ENUMs PostgreSQL são mais rígidos para migração |
| DB-M5 | Sem foreign key em resultados_orcamento.orcamento_id | Integridade: loose coupling com orçamentos | Aceitável se orçamentos vêm do SGD (fonte externa) |
| DB-M6 | Migration 002 (DML) mistura data migration com schema | Manutenção: DML em migration pode falhar em re-run | Marcar como one-time; adicionar guard IF NOT EXISTS |

### 3.4 BAIXOS

| ID | Débito | Impacto | Recomendação |
|----|--------|---------|-------------|
| DB-B1 | Comentários SQL parciais (apenas em algumas funções) | Documentação: inconsistente | Padronizar COMMENT ON para todas as funções |
| DB-B2 | Migration 007 duplicada (007a + 007b) | Organização: numeração ambígua | Aceitável; não afeta execução |
| DB-B3 | ALL_MIGRATIONS_006_013.sql consolidado | Redundância: arquivo gigante duplicando 8 migrations | Remover ou mover para docs/sql |

---

## 4. Análise de Indexes

### 4.1 Cobertura por Tabela

| Tabela | Indexes | FK Idx | Status Idx | Date Idx | Composite | Partial |
|--------|---------|--------|------------|----------|-----------|---------|
| empresas | 1 (PK) | - | - | - | - | - |
| clientes | 2 | ✅ | - | - | - | - |
| contratos | 4 | ✅ | ✅ | - | - | ✅ (ativo) |
| pedidos | 5 | ✅ | ✅ | ✅ | ✅ | ✅ (status) |
| notas_fiscais | 8 | ✅ | ✅ | ✅ | ✅ | ✅ (pendente) |
| contas_receber | 4 | ✅ | ✅ | ✅ | ✅ | ✅ (vencimento) |
| contas_pagar | 3 | ✅ | - | ✅ | ✅ | ✅ (vencimento) |
| entregas | 3 | ✅ | - | ✅ | - | - |
| extratos | 2 | ✅ | - | ✅ | - | - |
| conciliacoes | 4 | ✅ | - | ✅ | ✅ | - |
| resultados_orcamento | 6 | ✅ | ✅ | ✅ | - | - |
| preco_historico | 7 | ✅ | ✅ | ✅ | ✅ | - |

### 4.2 Gaps de Index

| Gap | Tabela | Recomendação |
|-----|--------|-------------|
| Sem index em clientes.login | clientes | Adicionar se usado para auth |
| Sem index em clientes.municipio | clientes | Adicionar se filtrado por município |
| Sem partial index em entregas | entregas | Considerar WHERE status_entrega = 'pendente' |

---

## 5. Análise de RLS

### 5.1 Evolução das Policies

```
Migration 006 (v1): Session-based
  └→ get_current_empresa_id() retorna current_setting('app.current_empresa_id')
  └→ Problema: session var não persiste entre HTTP requests

Migration 007 (v2): Permissive workaround
  └→ anon_full_access: USING (true) WITH CHECK (true)
  └→ auth_full_access: USING (true) WITH CHECK (true)
  └→ Problema: ZERO isolamento real — client-side filtering

Migration 009 (v3): Hybrid
  └→ COALESCE(get_user_empresa_id(), current_setting(...))
  └→ Melhor: auth.uid() lookup + fallback session
  └→ Problema: anon_full_access de 007 ainda ativa — override

Migration 018 (v4): Extratos/conciliacoes
  └→ anon_read + anon_write: USING (true) WITH CHECK (true)
  └→ Mesma abordagem permissiva de 007
```

### 5.2 Recomendação de RLS

**Plano de migração:**
1. Garantir todos os users usam Supabase Auth (não anon key)
2. Remover policies `anon_full_access` e `auth_full_access` de 007
3. Atualizar policies para usar `get_user_empresa_id()` de 009
4. Testar com auth.uid() exclusivamente
5. Manter `set_empresa_context()` como fallback para scripts server-side

---

## 6. Análise de Triggers

### 6.1 Cobertura

| Trigger | Tabelas Cobertas | Tabelas SEM |
|---------|-----------------|-------------|
| update_updated_at | 12/16 tabelas | resultados_orcamento (usa set_updated_at), sync_data, nexedu_sync |
| audit_trigger | 7 tabelas operacionais | extratos, conciliacoes, produtos, estoque_simples, resultados_orcamento, preco_historico |

### 6.2 Gap: Audit Trail Incompleto

Tabelas **sem audit_trigger** (mudanças não rastreadas):
- `extratos` — Deveria ter (dados financeiros)
- `conciliacoes` — Deveria ter (dados financeiros)
- `produtos` — Opcional (catálogo)
- `estoque_simples` — Opcional (inventário)
- `resultados_orcamento` — Opcional (analytics)
- `preco_historico` — Não precisa (append-only)

---

## 7. Análise de Performance

### 7.1 Fillfactor

| Tabela | Fillfactor | Justificativa |
|--------|-----------|---------------|
| pedidos | 85 | Frequentemente atualizado (status transitions) |
| notas_fiscais | 85 | Status updates, XML storage |
| contas_receber | 85 | Status updates |
| contas_pagar | 85 | Status updates |
| entregas | 85 | Status updates |
| data_snapshots | 95 | Append-only |
| audit_log | 95 | Append-only |
| preco_historico | 95 | Append-only |

### 7.2 pg_cron Jobs

| Job | Schedule | Função |
|-----|----------|--------|
| cleanup_snapshots | Sunday 03:00 UTC | cleanup_old_snapshots(90) |
| cleanup_audit | Sunday 03:30 UTC | cleanup_old_audit(365) |

### 7.3 Estimativa de Volume

| Tabela | Volume Estimado (1 ano, 1 empresa) |
|--------|-----------------------------------|
| pedidos | ~500-2000 registros |
| notas_fiscais | ~500-2000 registros |
| contas_receber | ~500-2000 registros |
| contas_pagar | ~200-500 registros |
| entregas | ~500-2000 registros |
| contratos | ~50-200 registros |
| clientes | ~50-200 registros |
| preco_historico | ~5000-20000 registros |
| audit_log | ~10000-50000 registros/ano |
| data_snapshots | ~365 registros/ano (diário) |

**Conclusão:** Volume baixo-médio. Schema atual suporta sem problemas. Indexes e retention estão adequados.

---

## 8. Resumo de Ações Recomendadas

### Prioridade Imediata (Sprint atual)
1. **DB-C1:** Planejar migração RLS para auth.uid() exclusivo
2. **DB-C2:** Hash senhas de clientes ou migrar para Supabase Auth
3. **DB-A2:** Atualizar database.ts com colunas faltantes

### Próximo Sprint
4. **DB-A1:** FK formal em conciliacoes.extrato_id
5. **DB-A3:** Adicionar audit_trigger em extratos/conciliacoes
6. **DB-A4:** Consolidar estratégia RLS

### Backlog
7. **DB-M3:** Remover default 'LARIUCCI' em novas tabelas
8. **DB-M6:** Guard em migration 002
9. **DB-B3:** Remover ALL_MIGRATIONS consolidado

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 2*
