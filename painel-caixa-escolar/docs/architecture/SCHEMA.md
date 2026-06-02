# Database Schema — GDP Painel Caixa Escolar

**Fase:** Brownfield Discovery — Fase 2
**Agente:** @data-engineer (executado por @architect)
**Data:** 2026-06-02
**Database:** Supabase PostgreSQL (mvvsjaudhbglxttxaeop.supabase.co)
**Migrations:** 19 arquivos (001-018)

---

## 1. Visão Geral

| Métrica | Valor |
|---------|-------|
| Tabelas operacionais | 10 |
| Tabelas auxiliares | 5 (audit, backup, pricing, inventory) |
| Tabelas auth | 1 (user_empresa) + Supabase auth.users |
| Total tabelas | 16+ |
| RPC Functions | 11 |
| Triggers | 15+ |
| Indexes | 44+ |
| RLS | Ativo em todas as tabelas |
| Multi-tenant | empresa_id em todas as tabelas |

---

## 2. Entity Relationship Diagram

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  empresas   │────<│  contratos   │────<│   pedidos     │
│  (tenant)   │     │  (licitação) │     │   (orders)    │
│             │     │              │     │               │
│ id (PK)     │     │ id (PK)      │     │ id (PK)       │
│ cnpj UNIQUE │     │ empresa_id FK│     │ empresa_id FK │
│ config_fiscal│    │ escola       │     │ contrato_id FK│
│ config_banc. │    │ status CHECK │     │ status CHECK  │
└──────┬──────┘     └──────────────┘     │ valor NOT NULL│
       │                                  └───────┬───────┘
       │                                          │
       │     ┌──────────────┐              ┌──────┴───────┐
       ├────<│  clientes    │              │ notas_fiscais│
       │     │  (escolas)   │              │ (NF-e)       │
       │     │              │              │              │
       │     │ id (PK)      │              │ id (PK)      │
       │     │ empresa_id FK│              │ empresa_id FK│
       │     │ cnpj         │              │ pedido_id FK │
       │     │ login/senha  │              │ numero       │
       │     └──────────────┘              │ chave_acesso │
       │                                   │ xml_autorizado│
       │     ┌──────────────┐              └──────┬───────┘
       ├────<│ contas_pagar │                     │
       │     │ valor NOT NULL│             ┌──────┴───────┐
       │     │ vencimento   │              │contas_receber│
       │     └──────────────┘              │ valor NOT NULL│
       │                                   │ vencimento   │
       │     ┌──────────────┐              └──────────────┘
       ├────<│  entregas    │
       │     │ pedido_id FK │
       │     │ foto/assinat.│
       │     └──────────────┘
       │
       │     ┌──────────────┐     ┌───────────────┐
       ├────<│  extratos    │────<│ conciliacoes  │
       │     │ (bank stmt)  │     │ (reconcil.)   │
       │     └──────────────┘     │ vinculado_a   │
       │                          └───────────────┘
       │
       ├────<│  nf_counter  │ (atomic, 1 row/empresa)
       ├────<│  produtos    │────< estoque_simples
       ├────<│  resultados_orcamento │ (win-loss)
       └────<│  preco_historico │ (price tracking)
```

---

## 3. Tabelas — Definições Completas

### 3.1 empresas (Multi-tenant Root)

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | gen_random_uuid() | PK |
| nome | TEXT | NOT NULL | - | |
| nome_fantasia | TEXT | YES | - | |
| razao_social | TEXT | YES | - | |
| cnpj | TEXT | NOT NULL | - | UNIQUE |
| ie | TEXT | YES | - | Inscrição estadual |
| crt | TEXT | YES | '1' | Código regime tributário |
| endereco | JSONB | YES | '{}' | |
| config_fiscal | JSONB | YES | '{}' | Ambiente, série, CFOP, cert A1 |
| config_bancaria | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | Auto-update trigger |

### 3.2 clientes (Escolas/Caixas Escolares)

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| nome | TEXT | NOT NULL | - | |
| cnpj | TEXT | YES | - | |
| ie | TEXT | YES | - | |
| uf | TEXT | YES | 'MG' | |
| cep | TEXT | YES | - | |
| sre | TEXT | YES | - | Superintendência Regional |
| email | TEXT | YES | - | |
| telefone | TEXT | YES | - | |
| endereco | JSONB | YES | '{}' | |
| contratos_vinculados | TEXT[] | YES | '{}' | Array de IDs |
| login | TEXT | YES | - | (Migr. 016) |
| senha | TEXT | YES | - | (Migr. 016) |
| municipio | TEXT | YES | - | (Migr. 016) |
| responsavel | TEXT | YES | - | (Migr. 016) |
| cargo | TEXT | YES | - | (Migr. 016) |
| contribuinte_icms | TEXT | YES | '9' | (Migr. 016) |
| categoria_catalogo | TEXT | YES | - | (Migr. 016) |
| arp_vinculada | TEXT | YES | - | (Migr. 016) |
| saldo_total | NUMERIC | YES | - | (Migr. 016) |
| saldo_disponivel | NUMERIC | YES | - | (Migr. 016) |
| dados_extras | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.3 contratos

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| escola | TEXT | NOT NULL | - | Nome da escola |
| processo | TEXT | YES | - | Número do processo |
| edital | TEXT | YES | - | |
| objeto | TEXT | YES | - | |
| status | TEXT | YES | 'ativo' | CHECK: ativo/encerrado/suspenso/cancelado |
| fornecedor | TEXT | YES | - | |
| vigencia | JSONB | YES | '{}' | |
| observacoes | TEXT | YES | - | |
| data_apuracao | DATE | YES | - | Convertido de TEXT (Migr. 011) |
| itens | JSONB | YES | '[]' | |
| cliente_snapshot | JSONB | YES | '{}' | |
| escola_cliente_id | TEXT | YES | - | (Migr. 015) |
| dados_extras | JSONB | YES | '{}' | |
| deleted_at | TIMESTAMPTZ | YES | - | Soft delete |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.4 pedidos

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| contrato_id | TEXT | YES | - | FK → contratos |
| escola | TEXT | NOT NULL | - | |
| data | DATE | YES | - | |
| status | TEXT | YES | 'em_aberto' | CHECK: em_aberto/em_preparo/entregue/cancelado/faturado |
| valor | NUMERIC(12,2) | NOT NULL | 0 | Backfilled Migr. 010 |
| obs | TEXT | YES | - | |
| itens | JSONB | YES | '[]' | Array de PedidoItem |
| fiscal | JSONB | YES | '{}' | |
| cliente | JSONB | YES | '{}' | |
| pagamento | JSONB | YES | '{}' | |
| marcador | TEXT | YES | - | |
| audit | JSONB | YES | '{}' | |
| dados_extras | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.5 notas_fiscais

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| pedido_id | TEXT | YES | - | FK → pedidos |
| contrato_id | TEXT | YES | - | FK → contratos |
| numero | TEXT | NOT NULL | - | |
| serie | TEXT | YES | '1' | |
| valor | NUMERIC(12,2) | NOT NULL | 0 | |
| status | TEXT | YES | 'pendente' | CHECK: pendente/autorizada/cancelada/rejeitada/denegada/inutilizada |
| tipo_nota | TEXT | YES | 'nfe_real' | CHECK: nfe_real/simulacao/contingencia/devolucao |
| origem | TEXT | YES | 'pedido' | |
| emitida_em | TIMESTAMPTZ | YES | - | |
| vencimento | DATE | YES | - | |
| cliente | JSONB | YES | '{}' | |
| itens | JSONB | YES | '[]' | |
| sefaz | JSONB | YES | '{}' | |
| cobranca | JSONB | YES | '{}' | |
| documentos | JSONB | YES | '{}' | |
| parametros | JSONB | YES | '{}' | |
| integracoes | JSONB | YES | '{}' | |
| xml_autorizado | TEXT | YES | - | XML completo SEFAZ |
| chave_acesso | TEXT | YES | - | 44 dígitos |
| protocolo | TEXT | YES | - | Protocolo SEFAZ |
| audit | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

**UNIQUE:** (empresa_id, numero, serie) — Migr. 008

### 3.6 contas_receber

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| pedido_id | TEXT | YES | - | FK → pedidos |
| origem_id | TEXT | YES | - | |
| descricao | TEXT | YES | - | |
| valor | NUMERIC(12,2) | NOT NULL | 0 | |
| status | TEXT | YES | 'pendente' | CHECK: pendente/emitida/recebida/atrasada/cancelada |
| forma | TEXT | YES | - | Forma de pagamento |
| categoria | TEXT | YES | - | |
| vencimento | DATE | YES | - | |
| cliente | JSONB | YES | '{}' | |
| cobranca | JSONB | YES | '{}' | |
| automacao | JSONB | YES | '{}' | |
| audit | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.7 contas_pagar

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| descricao | TEXT | YES | - | |
| valor | NUMERIC(12,2) | NOT NULL | 0 | |
| status | TEXT | YES | 'pendente' | CHECK: pendente/paga/atrasada/cancelada/emitida |
| forma | TEXT | YES | - | |
| categoria | TEXT | YES | - | |
| vencimento | DATE | YES | - | |
| fornecedor | JSONB | YES | '{}' | |
| audit | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.8 entregas

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | gen_random_uuid() | PK |
| empresa_id | TEXT | NOT NULL | - | FK → empresas |
| pedido_id | TEXT | YES | - | FK → pedidos |
| escola | TEXT | YES | - | |
| data_entrega | DATE | YES | - | |
| status_entrega | TEXT | YES | 'pendente' | CHECK: pendente/entregue/devolvido/parcial |
| recebedor | TEXT | YES | - | |
| obs | TEXT | YES | - | |
| foto | TEXT | YES | - | URL/path |
| assinatura | TEXT | YES | - | URL/path |
| created_at | TIMESTAMPTZ | YES | now() | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.9 extratos (Migr. 018)

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | 'LARIUCCI' | |
| data | DATE | YES | - | |
| arquivo | TEXT | YES | - | Nome arquivo OFX |
| conta_financeira | TEXT | YES | 'Conta Principal' | |
| conciliados | INTEGER | YES | 0 | |
| total | INTEGER | YES | 0 | |
| is_open | BOOLEAN | YES | FALSE | |
| criado_em | TIMESTAMPTZ | YES | NOW() | |
| created_at | TIMESTAMPTZ | YES | NOW() | |
| updated_at | TIMESTAMPTZ | YES | NOW() | |

### 3.10 conciliacoes (Migr. 018)

| Coluna | Tipo | Nullable | Default | Notas |
|--------|------|----------|---------|-------|
| id | TEXT | NOT NULL | - | PK |
| empresa_id | TEXT | NOT NULL | 'LARIUCCI' | |
| extrato_id | TEXT | YES | - | Ref extratos (não FK formal) |
| data | DATE | YES | - | |
| descricao | TEXT | YES | - | |
| valor | NUMERIC(12,2) | NOT NULL | 0 | |
| tipo | TEXT | YES | 'credito' | credito/debito |
| conciliado | BOOLEAN | YES | FALSE | |
| conciliado_em | DATE | YES | - | |
| vinculado_a | JSONB | YES | '{}' | {tipo: 'cp'/'cr', contaId} |
| historico | TEXT | YES | - | |
| categoria_dre | TEXT | YES | - | Classificação DRE |
| metadata | JSONB | YES | '{}' | |
| created_at | TIMESTAMPTZ | YES | NOW() | |
| updated_at | TIMESTAMPTZ | YES | NOW() | |

### 3.11 nf_counter

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| empresa_id | TEXT | NOT NULL | - | PK + FK → empresas |
| counter | INTEGER | YES | 0 | |
| updated_at | TIMESTAMPTZ | YES | now() | |

### 3.12 user_empresa (Migr. 009)

| Coluna | Tipo | Nullable | Default |
|--------|------|----------|---------|
| user_id | UUID | NOT NULL | - | PK (composite) + FK → auth.users |
| empresa_id | TEXT | NOT NULL | - | PK (composite) + FK → empresas |
| role | TEXT | NOT NULL | 'operador' | admin/operador |
| created_at | TIMESTAMPTZ | NOT NULL | now() | |

---

## 4. RPC Functions

| Função | Retorno | Propósito |
|--------|---------|-----------|
| `next_nf_number(empresa_id)` | INTEGER | Atomic NF-e counter (FOR UPDATE lock) |
| `snapshot_table(empresa, tabela, motivo)` | INTEGER | Backup uma tabela |
| `snapshot_all(empresa, motivo)` | TABLE | Backup todas as tabelas |
| `cleanup_old_snapshots(retain_days)` | INTEGER | Limpa snapshots > N dias |
| `cleanup_old_audit(retain_days)` | INTEGER | Limpa audit > N dias |
| `run_retention_cleanup()` | TABLE | Executa ambos cleanups |
| `set_empresa_context(empresa_id)` | void | Set RLS context |
| `get_user_empresa_id()` | TEXT | Empresa do user logado |
| `preco_historico_tendencia(...)` | TABLE | Tendência preço/mês |
| `preco_historico_por_regiao(...)` | TABLE | Preço por SRE/escola |
| `preco_historico_competitividade(...)` | TABLE | Win-loss por SKU |

---

## 5. Indexes (44+)

Veja DB-AUDIT.md para lista completa de indexes.

---

## 6. RLS Strategy

| Fase | Migration | Abordagem |
|------|-----------|-----------|
| v1 | 006 | Session-based (`set_empresa_context()`) |
| v2 | 007 | Permissive (anon/auth full access, filtro client-side) |
| v3 | 009 | Hybrid (auth.uid() → user_empresa → fallback session) |

**Status atual:** Todas as tabelas com RLS ativo. Tabelas principais usam abordagem permissiva (007) + hybrid (009). Extratos/conciliações (018) usam anon full access.

---

*Gerado por @architect (Aria) — Brownfield Discovery Fase 2*
