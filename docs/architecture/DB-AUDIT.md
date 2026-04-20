# DB-AUDIT.md -- Auditoria do Banco de Dados GDP

**Projeto:** Painel Caixa Escolar (GDP - Gestao de Pedidos)
**Data:** 2026-04-20
**Avaliador:** @data-engineer (Dara)
**Escopo:** Todas as migracoes em `painel-caixa-escolar/supabase/migrations/` + codigo de acesso

---

## 1. Resumo

| Metrica | Valor |
|---------|-------|
| Total de tabelas (migracoes) | 13 |
| Tabelas com RLS | 2 de 13 (15%) |
| Tabelas sem RLS critico | 8 (empresas, clientes, contratos, pedidos, notas_fiscais, contas_receber, contas_pagar, entregas) |
| Colunas JSONB | 30+ |
| Indices criados | 28 |
| CHECK constraints | 2 |
| UNIQUE constraints | 2 (cnpj em empresas, empresa_id+orcamento_id em resultados) |
| Foreign keys definidas | 12 |
| Triggers ativos | 18 (9 updated_at + 7 audit + 2 RLS tables updated_at) |

### Classificacao Geral: **RISCO MEDIO-ALTO**

O schema demonstra boa organizacao e coerencia conceitual, porem apresenta vulnerabilidades significativas em seguranca (RLS), consistencia (constraints) e normalizacao (excesso de JSONB). A arquitetura esta em transicao de um modelo key-value (sync_data) para tabelas normalizadas, com vestgios do modelo antigo ainda ativos.

---

## 2. Problemas Encontrados

### CRITICAL

#### C1. RLS ausente em 8 tabelas operacionais criticas

**Tabelas afetadas:** empresas, clientes, contratos, pedidos, notas_fiscais, contas_receber, contas_pagar, entregas

**Risco:** Qualquer usuario com a chave `anon` do Supabase pode ler/escrever dados de TODAS as empresas. A chave esta exposta no frontend (hardcoded no JavaScript do dashboard).

**Evidencia:** A chave `sb_publishable_uBqL8sLjMGWnZ2aaQ1zwvg_mlQrZUXR` esta em pelo menos 4 arquivos JS do frontend, sem nenhuma camada de autenticacao.

**Impacto:** Violacao total de privacidade entre tenants. Um concorrente pode acessar contratos, precos e dados fiscais de outras empresas.

---

#### C2. Chave Supabase exposta no frontend sem autenticacao

**Arquivos afetados:**
- `dashboard/gdp-api.js` (linha 9)
- `dashboard/app-results.js` (linha 5)
- `dashboard/js/gdp-init.js` (linha 5)
- `dashboard/radar-matcher.js` (linha 6)

**Risco:** A chave `anon` esta exposta publicamente. Sem RLS habilitado e sem autenticacao via `auth.uid()`, qualquer pessoa com a chave pode fazer operacoes de CRUD em todas as tabelas.

**Impacto:** Exposicao total dos dados. Nao ha barreira entre o frontend e o banco.

---

#### C3. Funcao `set_updated_at()` referenciada mas nao definida nas migracoes

**Arquivo:** `004_resultados_orcamento.sql` (linha 44)

**Evidencia:** O trigger `trg_resultados_updated_at` referencia `set_updated_at()`, mas a migracao `001_gdp_tables.sql` define `update_updated_at()`.

**Risco:** Se `set_updated_at()` nao existir no banco, a migracao 004 falha silenciosamente ou o trigger nao funciona.

**Impacto:** `updated_at` de `resultados_orcamento` pode nunca ser atualizado automaticamente.

---

### HIGH

#### H1. Ausencia de NOT NULL em colunas criticas

**Exemplos:**
- `contratos.escola`: Definido como NOT NULL, OK
- `pedidos.valor`: Nullable (permite pedido sem valor)
- `notas_fiscais.valor`: Nullable (permite NF sem valor)
- `contas_receber.valor`: Nullable (permite cobranca sem valor)
- `contas_pagar.valor`: Nullable (permite conta sem valor)
- `clientes.cnpj`: Nullable (permite cliente sem identificacao fiscal)
- `pedidos.contrato_id`: Nullable (permite pedido orfao)

**Impacto:** Dados inconsistentes que geram problemas em relatorios e integracoes financeiras.

---

#### H2. Ausencia de FK entre `contas_receber.origem_id` e `notas_fiscais.id`

**Situacao:** A coluna `origem_id` em `contas_receber` e usada para referenciar a NF de origem, mas nao possui FK formal.

**Impacto:** Registros de contas podem referenciar notas inexistentes, gerando inconsistencia no fluxo financeiro.

---

#### H3. Campo `contratos.data_apuracao` como TEXT em vez de DATE

**Situacao:** A coluna armazena datas mas e do tipo TEXT, permitindo valores invalidos.

**Impacto:** Impossibilidade de fazer queries temporais corretas; dados corrompidos silenciosamente.

---

#### H4. Tabela `nf_counter` sem protecao contra race condition

**Situacao:** O contador de NF usa SELECT + UPDATE separados (no codigo JS). Nao ha `FOR UPDATE` ou funcao atomica no banco.

**Impacto:** Em concorrencia, duas requisicoes podem obter o mesmo numero de NF, gerando duplicidade na SEFAZ (rejeicao de NF).

---

#### H5. Soft delete inconsistente

**Situacao:** Apenas `contratos` tem `deleted_at`. Nenhuma outra tabela implementa soft delete.

**Impacto:** Exclusao de pedidos, NFs e entregas e permanente e irreversivel, enquanto contratos podem ser restaurados.

---

#### H6. Indice ausente em `contas_pagar.vencimento`

**Situacao:** Queries de "contas vencidas" (muito frequentes no dashboard) filtram por `vencimento < hoje`, mas nao ha indice.

**Impacto:** Full table scan em queries financeiras frequentes.

---

#### H7. Indice ausente em `contas_receber.vencimento`

**Situacao:** Mesmo problema que H6 para contas a receber.

**Impacto:** Full table scan em queries de cobranca.

---

### MEDIUM

#### M1. Excesso de colunas JSONB sem validacao de schema

**Tabelas mais afetadas:**
- `notas_fiscais`: 8 colunas JSONB (cliente, itens, sefaz, cobranca, documentos, parametros, integracoes, audit)
- `pedidos`: 6 colunas JSONB (itens, fiscal, cliente, pagamento, audit, dados_extras)
- `contratos`: 4 colunas JSONB (vigencia, itens, cliente_snapshot, dados_extras)

**Risco:** Sem CHECK constraints em JSONB, os dados podem ter estrutura inconsistente. Exemplo: `itens` pode ser um objeto em vez de array.

**Impacto:** Bugs silenciosos em queries que assumem estrutura especifica.

---

#### M2. Duplicacao de dados do cliente em multiplas tabelas

**Situacao:** Dados do cliente (nome, cnpj, endereco) estao armazenados em:
- `clientes` (tabela normalizada)
- `contratos.cliente_snapshot` (JSONB)
- `pedidos.cliente` (JSONB)
- `notas_fiscais.cliente` (JSONB)
- `contas_receber.cliente` (JSONB)

**Impacto:** Atualizacao de dados do cliente nao propaga para snapshots existentes. Relatorios podem mostrar dados desatualizados.

---

#### M3. Nomenclatura inconsistente de colunas de status

**Exemplos:**
- `contratos.status`: valores como 'ativo', 'encerrado'
- `pedidos.status`: valores como 'em_aberto', 'entregue'
- `notas_fiscais.status`: valores como 'pendente', 'autorizada'
- `entregas.status_entrega`: usa nome diferente (status_entrega vs status)
- `contas_receber.status`: valores como 'pendente', 'recebida'
- `contas_pagar.status`: valores como 'pendente', 'paga'

**Impacto:** Nao ha CHECK constraints validando os valores permitidos (exceto resultados_orcamento e preco_historico). Qualquer string pode ser inserida.

---

#### M4. Tipo TEXT para PKs em vez de UUID nativo

**Situacao:** Todas as tabelas usam `TEXT` como PK com `DEFAULT gen_random_uuid()::text`. O tipo correto seria `UUID`.

**Impacto:** Uso de 36 bytes por PK em vez de 16 bytes (UUID nativo). Indices maiores, joins mais lentos. Permite insercao de IDs invalidos (qualquer texto).

---

#### M5. Ausencia de indice em `entregas.data_entrega`

**Situacao:** Queries de entregas por periodo nao possuem indice dedicado.

**Impacto:** Performance ruim em relatorios de entregas por data.

---

#### M6. Tabela `data_snapshots.snapshot` cresce indefinidamente

**Situacao:** Cada snapshot salva TODOS os registros de uma tabela como JSONB. Nao ha politica de retencao.

**Impacto:** Crescimento ilimitado da tabela. Um snapshot de 1000 contratos salva ~1MB por execucao. Sem purge automatico.

---

#### M7. `audit_log` sem politica de retencao

**Situacao:** Cada INSERT/UPDATE/DELETE em 7 tabelas gera um registro de audit. Sem TTL ou particoes.

**Impacto:** Em 1 ano de operacao intensa, pode acumular milhoes de registros sem necessidade.

---

### LOW

#### L1. Coluna `entregas.foto` e `entregas.assinatura` como TEXT

**Situacao:** Armazenam URLs ou base64 de imagens diretamente no PostgreSQL.

**Impacto:** Se base64, linhas com megabytes de dados. Deveria usar Supabase Storage com apenas URL na tabela.

---

#### L2. Array TEXT[] em `clientes.contratos_vinculados` sem FK

**Situacao:** A coluna armazena IDs de contratos como TEXT array, sem referencia formal.

**Impacto:** IDs podem ficar orfaos (contrato deletado mas referencia permanece no array).

---

#### L3. Coexistencia de 3 sistemas de storage (sync_data, nexedu_sync, tabelas)

**Situacao:** O sistema mantem 3 mecanismos de persistencia:
1. `sync_data` (key-value, usado pelo frontend via cloud sync)
2. `nexedu_sync` (key-value, usado pelas serverless functions)
3. Tabelas normalizadas (GDP API)

**Impacto:** Dados podem ficar dessincronizados entre os 3 sistemas. Complexidade desnecessaria de manutencao.

---

#### L4. Ausencia de COMMENT em tabelas novas

**Situacao:** `resultados_orcamento` e `preco_historico` nao possuem COMMENT ON TABLE.

**Impacto:** Baixa; apenas documentacao no banco.

---

#### L5. Indice `idx_nfs_numero` nao e UNIQUE

**Situacao:** Dois registros podem ter o mesmo numero de NF para a mesma empresa, o que viola regras da SEFAZ.

**Impacto:** Possibilidade de dados duplicados que causam rejeicao na SEFAZ.

---

## 3. Recomendacoes

### Prioridade 1 -- Seguranca (CRITICAL)

| # | Acao | Esforco | Impacto |
|---|------|---------|---------|
| R1 | Habilitar RLS em TODAS as 8 tabelas operacionais + audit_log + data_snapshots + nf_counter | Medio | Elimina C1 |
| R2 | Criar policies de RLS usando `empresa_id = current_setting('app.current_empresa_id', true)` | Medio | Complementa R1 |
| R3 | Implementar autenticacao Supabase Auth no frontend (eliminar uso direto de anon key sem sessao) | Alto | Elimina C2 |
| R4 | Criar funcao `set_updated_at()` ou corrigir referencia para `update_updated_at()` em 004 | Baixo | Elimina C3 |

### Prioridade 2 -- Integridade (HIGH)

| # | Acao | Esforco | Impacto |
|---|------|---------|---------|
| R5 | Adicionar NOT NULL em `pedidos.valor`, `notas_fiscais.valor`, `contas_receber.valor`, `contas_pagar.valor` | Baixo | Elimina parte de H1 |
| R6 | Criar FK formal `contas_receber.origem_id -> notas_fiscais.id` (ou polimorfismo com tipo) | Baixo | Elimina H2 |
| R7 | Alterar `contratos.data_apuracao` de TEXT para DATE | Baixo | Elimina H3 |
| R8 | Criar funcao atomica `next_nf_number(empresa_id)` com `FOR UPDATE` | Medio | Elimina H4 |
| R9 | Adicionar indice em `contas_pagar(vencimento)` e `contas_receber(vencimento)` | Baixo | Elimina H6, H7 |
| R10 | Criar UNIQUE INDEX em `notas_fiscais(empresa_id, numero, serie)` | Baixo | Elimina L5 |

### Prioridade 3 -- Qualidade (MEDIUM)

| # | Acao | Esforco | Impacto |
|---|------|---------|---------|
| R11 | Adicionar CHECK constraints nos campos status de todas as tabelas | Baixo | Elimina M3 |
| R12 | Migrar PKs de TEXT para UUID nativo (quebrara backward-compatibility) | Alto | Elimina M4 |
| R13 | Adicionar indice em `entregas(data_entrega)` | Baixo | Elimina M5 |
| R14 | Criar politica de retencao para `data_snapshots` (ex: manter apenas ultimos 30 dias) | Medio | Elimina M6 |
| R15 | Implementar particoes temporais em `audit_log` ou TTL de 90 dias | Medio | Elimina M7 |
| R16 | Padronizar `status_entrega` para apenas `status` em `entregas` | Baixo | Elimina inconsistencia M3 |

### Prioridade 4 -- Divida Tecnica (LOW)

| # | Acao | Esforco | Impacto |
|---|------|---------|---------|
| R17 | Migrar `entregas.foto` e `entregas.assinatura` para Supabase Storage | Medio | Elimina L1 |
| R18 | Deprecar e remover `sync_data` e `nexedu_sync` apos migracao completa | Alto | Elimina L3 |
| R19 | Substituir `clientes.contratos_vinculados TEXT[]` por tabela de juncao | Medio | Elimina L2 |
| R20 | Adicionar COMMENTs nas tabelas novas | Baixo | Elimina L4 |

---

## 4. Plano de Migracao

### Fase 1: Seguranca (Sprint imediato)

```sql
-- Migration 006_enable_rls.sql

-- 1. Habilitar RLS em todas as tabelas
ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE entregas ENABLE ROW LEVEL SECURITY;
ALTER TABLE nf_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Policies (usar current_setting para manter compatibilidade)
-- Exemplo para cada tabela:
CREATE POLICY empresa_isolation ON clientes
  FOR ALL
  USING (empresa_id = current_setting('app.current_empresa_id', true))
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true));

-- Repetir para: contratos, pedidos, notas_fiscais, contas_receber,
-- contas_pagar, entregas, nf_counter, data_snapshots, audit_log

-- 3. Corrigir funcao set_updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### Fase 2: Integridade (Proximo sprint)

```sql
-- Migration 007_constraints.sql

-- Indices de vencimento
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON contas_receber(vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON contas_pagar(vencimento);
CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_entrega);

-- UNIQUE para NF por empresa
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfs_unique_numero
  ON notas_fiscais(empresa_id, numero, serie);

-- Alterar tipo de data_apuracao
ALTER TABLE contratos ALTER COLUMN data_apuracao TYPE DATE
  USING CASE WHEN data_apuracao ~ '^\d{4}-\d{2}-\d{2}$'
             THEN data_apuracao::DATE ELSE NULL END;

-- Funcao atomica para proximo numero de NF
CREATE OR REPLACE FUNCTION next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER AS $$
DECLARE
  v_next INTEGER;
BEGIN
  UPDATE nf_counter
  SET counter = counter + 1, updated_at = now()
  WHERE empresa_id = p_empresa_id
  RETURNING counter INTO v_next;

  IF v_next IS NULL THEN
    INSERT INTO nf_counter (empresa_id, counter)
    VALUES (p_empresa_id, 1)
    ON CONFLICT (empresa_id) DO UPDATE SET counter = nf_counter.counter + 1
    RETURNING counter INTO v_next;
  END IF;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;
```

### Fase 3: CHECK constraints (Sprint seguinte)

```sql
-- Migration 008_check_constraints.sql

ALTER TABLE contratos ADD CONSTRAINT chk_contratos_status
  CHECK (status IN ('ativo', 'encerrado', 'suspenso', 'cancelado'));

ALTER TABLE pedidos ADD CONSTRAINT chk_pedidos_status
  CHECK (status IN ('em_aberto', 'em_preparo', 'entregue', 'cancelado', 'faturado'));

ALTER TABLE notas_fiscais ADD CONSTRAINT chk_nfs_status
  CHECK (status IN ('pendente', 'autorizada', 'cancelada', 'rejeitada', 'denegada'));

ALTER TABLE contas_receber ADD CONSTRAINT chk_cr_status
  CHECK (status IN ('pendente', 'emitida', 'recebida', 'atrasada', 'cancelada'));

ALTER TABLE contas_pagar ADD CONSTRAINT chk_cp_status
  CHECK (status IN ('pendente', 'paga', 'atrasada', 'cancelada', 'emitida'));

ALTER TABLE entregas ADD CONSTRAINT chk_entregas_status
  CHECK (status_entrega IN ('pendente', 'entregue', 'devolvido', 'parcial'));
```

### Fase 4: Depreciacao do Legacy (Planejamento longo prazo)

1. Garantir que `gdp-api.js` funciona 100% sem fallback para `sync_data`
2. Adicionar feature flag para desabilitar `cloudSave()` no `app-sync.js`
3. Migrar serverless functions (sync-pedidos, sync-entregas) para usar tabelas diretas
4. Apos 30 dias sem erros, remover tabelas `sync_data` e `nexedu_sync`
5. Remover codigo de fallback do frontend

---

## 5. Metricas de Qualidade Pos-Correcao (Alvo)

| Metrica | Atual | Alvo |
|---------|-------|------|
| Tabelas com RLS | 2/13 (15%) | 13/13 (100%) |
| CHECK constraints | 2 | 8+ |
| Indices em colunas de filtro frequente | 28 | 33+ |
| Sistemas de storage ativos | 3 | 1 |
| NOT NULL em colunas financeiras | 0/4 | 4/4 |
| UNIQUE constraints criticas | 2 | 4 |

---

*Documento gerado automaticamente por @data-engineer (Dara) - Phase 2 Brownfield Discovery*
