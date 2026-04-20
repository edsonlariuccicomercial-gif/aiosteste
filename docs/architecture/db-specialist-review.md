# Revisao de Especialista em Banco de Dados

**Projeto:** Painel Caixa Escolar (GDP - Gestao de Pedidos)
**Data:** 2026-04-20
**Revisor:** @data-engineer (Dara)
**Fase:** Brownfield Discovery - Phase 5 (Specialist Review)
**Documento revisado:** `docs/architecture/technical-debt-DRAFT.md` (Phase 4 - @architect)

---

## 1. Parecer do Especialista

### Visao Geral

Apos analise detalhada das 5 migracoes SQL, do codigo de acesso em `gdp-api.js`, e do draft de divida tecnica produzido pela @architect, **confirmo que a avaliacao esta substancialmente correta** no que diz respeito aos itens de banco de dados. O schema demonstra competencia conceitual (multi-tenancy via `empresa_id`, audit trail, snapshots), porem a execucao apresenta lacunas graves de seguranca e integridade que colocam o sistema em risco operacional real.

### Pontos Fortes do Schema Atual

1. **Modelo multi-tenant coerente** - Todas as tabelas usam `empresa_id` como discriminador
2. **Audit trail implementado** - `audit_trigger()` captura INSERT/UPDATE/DELETE com dados antes/depois
3. **Snapshot automatizado** - Funcoes `snapshot_table()` e `snapshot_all()` para backup point-in-time
4. **Migracao idempotente** - Uso correto de `ON CONFLICT DO NOTHING` na migration 002
5. **RLS nas tabelas analiticas** - `resultados_orcamento` e `preco_historico` com policies corretas

### Deficiencias Confirmadas

1. **RLS ausente em 11 de 13 tabelas** - O draft menciona 8, mas na realidade sao 11 (incluindo `nf_counter`, `data_snapshots` e `audit_log`)
2. **Race condition no `nf_counter`** - Confirmado: o codigo JS faz GET + save separados via REST API sem transacao
3. **Funcao `set_updated_at()` nao definida** - Migration 004 referencia funcao inexistente (001 define `update_updated_at()`)
4. **Zero NOT NULL em colunas financeiras** - `pedidos.valor`, `notas_fiscais.valor`, `contas_receber.valor`, `contas_pagar.valor` todos nullable
5. **Tipo TEXT para PKs** - Overhead de armazenamento e aceita qualquer string

---

## 2. Validacao de Severidades

| TD-ID | Item | Severidade no Draft | Minha Avaliacao | Justificativa |
|-------|------|--------------------:|:---------------:|---------------|
| TD-002 | RLS ausente em tabelas operacionais | CRITICAL | **CRITICAL** - CONCORDO | Chave anon exposta + RLS ausente = acesso irrestrito. Verificado: nenhuma policy existe em 11/13 tabelas. |
| TD-017 | Race condition no `nf_counter` | HIGH | **CRITICAL** - DISCORDO (subir) | NF-e duplicada causa rejeicao SEFAZ com impacto fiscal direto (multa + impossibilidade de faturar). O codigo em `gdp-api.js` faz `nfCounterApi.save()` sem atomicidade alguma. Em cenario de 2 abas abertas ou 2 usuarios simultaneos, duplicacao e certa. |
| TD-018 | NOT NULL ausente em colunas financeiras | HIGH | **HIGH** - CONCORDO | Registros sem valor geram relatorios incorretos mas nao causam falha catastrofica imediata. |
| TD-019 | Indices ausentes em vencimento | HIGH | **MEDIUM** - DISCORDO (descer) | Com o volume atual (< 5000 registros), full table scan leva < 10ms. Impacto real so aparece com > 50K registros. Porem, e quick win e deve ser feito preventivamente. |
| TD-020 | JSONB sem validacao | MEDIUM | **MEDIUM** - CONCORDO | Risco de inconsistencia silenciosa, mas mitigation possivel via aplicacao. |
| TD-021 | Duplicacao de dados do cliente | MEDIUM | **HIGH** - DISCORDO (subir) | Vi no codigo que `pedidos.cliente`, `notas_fiscais.cliente`, `contratos.cliente_snapshot` e `contas_receber.cliente` armazenam copia. Atualizacao de CNPJ/endereco da escola NAO propaga. Isso pode causar NF-e com dados incorretos do destinatario = rejeicao SEFAZ. |
| TD-022 | `data_apuracao` como TEXT | MEDIUM | **HIGH** - DISCORDO (subir) | Verificado na migration 001 linha 55: `data_apuracao TEXT`. Isso impossibilita qualquer query de contratos por periodo de vigencia. Para um sistema de licitacao publica, datas de apuracao sao criticas para compliance. |
| TD-023 | `set_updated_at()` nao definida | MEDIUM | **HIGH** - DISCORDO (subir) | Verificado: migration 004 linha 44 usa `EXECUTE FUNCTION set_updated_at()` mas migration 001 define `update_updated_at()`. Se a funcao nao existir no banco, o trigger falha e `updated_at` de `resultados_orcamento` NUNCA e atualizado. Isso compromete cache invalidation e sync. |
| TD-024 | PKs TEXT em vez de UUID | MEDIUM | **MEDIUM** - CONCORDO | Overhead real mas migracao e extremamente arriscada (quebra todas as FKs). Manter como divida tecnica de longo prazo. |
| TD-025 | Sem retencao em snapshots/audit | MEDIUM | **HIGH** - DISCORDO (subir) | `snapshot_table()` salva JSON completo de TODA a tabela por empresa. Se executado diariamente com 500 contratos, sao ~500KB/dia = ~15MB/mes so de uma tabela. No Supabase Free (500MB DB), atinge limite em ~6 meses. E bomba-relogio. |
| TD-026 | 3 sistemas de storage | LOW | **MEDIUM** - DISCORDO (subir) | Verificado: `sync_data`, `nexedu_sync` e tabelas normalizadas coexistem. O `gdp-api.js` faz fallback para localStorage quando Supabase falha (linhas 209-210). Isso cria divergencia de dados entre sessoes/dispositivos. |
| TD-027 | FK ausente `contas_receber.origem_id` | LOW | **MEDIUM** - DISCORDO (subir) | Sem FK, exclusao de NF nao impede a conta a receber de referenciar registro fantasma. Quando o sistema tenta gerar boleto de uma NF inexistente, falha silenciosamente. |
| TD-028 | Indice NF nao UNIQUE | LOW | **HIGH** - DISCORDO (subir) | `idx_nfs_numero` em `notas_fiscais(numero)` nao e UNIQUE por empresa/serie. Verificado na migration 001 linha 120. Duas NFs com mesmo numero/serie/empresa podem existir no banco. SEFAZ rejeita na hora e o usuario perde a NF. |

### Resumo das Discordancias

| Direcao | Quantidade | IDs |
|---------|:----------:|-----|
| Subir severidade | 6 | TD-017, TD-021, TD-022, TD-023, TD-025, TD-026, TD-027, TD-028 |
| Descer severidade | 1 | TD-019 |
| Concordar | 5 | TD-002, TD-018, TD-020, TD-024 |

---

## 3. Riscos Adicionais Nao Mapeados

### RA-01. Trigger de audit em cascata pode causar timeout (MEDIUM)

**Descricao:** O `audit_trigger()` esta aplicado em 7 tabelas como `AFTER INSERT OR UPDATE OR DELETE`. Em operacoes de batch (ex: migracao de 500 pedidos), cada INSERT gera 1 registro em `audit_log`. Uma transacao de 500 inserts gera 500 audit records adicionais, potencialmente causando timeout no Supabase (30s limit).

**Evidencia:** Migration 003 linhas 87-95 aplica trigger em 7 tabelas.

**Impacto:** Timeout em operacoes bulk; possivel perda de dados se transacao e abortada.

---

### RA-02. `snapshot_table()` usa SQL dinamico sem parametrizacao segura (MEDIUM)

**Descricao:** A funcao `snapshot_table()` na migration 003 usa `format('%I', p_tabela)` para o nome da tabela (seguro via `%I`), porem o parametro `p_empresa` e passado como `USING $1` (seguro). **O risco e que se alguem chamar `snapshot_table` com um nome de tabela arbitrario**, pode ler qualquer tabela do schema (information_schema, pg_*, etc).

**Evidencia:** Migration 003 linhas 18-36.

**Impacto:** Exfiltracao de dados de tabelas do sistema se chamado com input malicioso.

---

### RA-03. `empresas.config_fiscal` armazena certificado digital em JSONB (HIGH)

**Descricao:** O campo `config_fiscal` em `empresas` armazena o certificado digital PFX em base64 + senha. Sem RLS nesta tabela, qualquer acesso via anon key expoe o certificado completo, permitindo emissao de NF-e fraudulenta em nome da empresa.

**Evidencia:** SCHEMA.md secao 4.2 documenta a estrutura com `certificado: "base64..."` e `senha: "****"`.

**Impacto:** Fraude fiscal via certificado digital roubado. Risco juridico extremo.

---

### RA-04. `clientes.contratos_vinculados TEXT[]` sem integridade referencial (LOW)

**Descricao:** Array de IDs de contrato armazenado como TEXT[] sem FK. Contratos excluidos (soft delete via `deleted_at`) continuam referenciados no array. Nao ha trigger para limpar.

**Evidencia:** Migration 001 linha 35: `contratos_vinculados TEXT[] DEFAULT '{}'`.

**Impacto:** UI mostra contratos inexistentes/excluidos como vinculados ao cliente.

---

### RA-05. Ausencia de indice em `notas_fiscais.vencimento` (MEDIUM)

**Descricao:** O dashboard financeiro consulta NFs por vencimento para calcular fluxo de caixa, mas nao existe indice em `notas_fiscais.vencimento`. Draft menciona indices ausentes apenas em `contas_receber` e `contas_pagar`.

**Evidencia:** Migration 001 linhas 119-123 listam os indices de `notas_fiscais` - nenhum em `vencimento`.

**Impacto:** Full table scan em queries de vencimento de NF.

---

### RA-06. Funcao `snapshot_all()` nao inclui `nf_counter` nem `resultados_orcamento` (LOW)

**Descricao:** `snapshot_all()` apenas faz backup de 7 tabelas (contratos, pedidos, notas_fiscais, clientes, contas_receber, contas_pagar, entregas). Tabelas `nf_counter`, `resultados_orcamento` e `preco_historico` nao sao incluidas.

**Evidencia:** Migration 003 linhas 39-49.

**Impacto:** Perda do contador de NF ou historico de precos em caso de corrupcao.

---

## 4. Priorizacao Recomendada

Do ponto de vista de **dados** (integridade, seguranca e performance), recomendo a seguinte ordem de correcao:

### Fase 0 - Emergencial (DEVE ser feito ANTES de qualquer feature nova)

| Prioridade | Item | Justificativa | Esforco |
|:----------:|------|---------------|:-------:|
| 1 | RLS em todas as tabelas (TD-002) | Exposicao total de dados — risco legal e competitivo | 4h |
| 2 | Funcao atomica `next_nf_number()` (TD-017) | Race condition causa rejeicao SEFAZ e multa fiscal | 1h |
| 3 | UNIQUE index em NF por empresa/serie (TD-028) | Previne duplicidade de NF no banco | 5min |
| 4 | Corrigir `set_updated_at()` (TD-023) | Trigger quebrado silenciosamente | 5min |
| 5 | NOT NULL em colunas financeiras (TD-018) | Impede registros sem valor | 30min |

### Fase 1 - Integridade de Dados (Proximo sprint)

| Prioridade | Item | Justificativa | Esforco |
|:----------:|------|---------------|:-------:|
| 6 | Alterar `data_apuracao` para DATE (TD-022) | Habilita queries temporais em contratos | 30min |
| 7 | Indices em vencimento (TD-019) | Quick win preventivo | 5min |
| 8 | Indice em `notas_fiscais.vencimento` (RA-05) | Mesmo motivo acima | 5min |
| 9 | FK em `contas_receber.origem_id` (TD-027) | Integridade referencial no fluxo financeiro | 30min |
| 10 | CHECK constraints em status (TD-020 parcial) | Previne dados invalidos | 1h |

### Fase 2 - Sustentabilidade (Sprint seguinte)

| Prioridade | Item | Justificativa | Esforco |
|:----------:|------|---------------|:-------:|
| 11 | Politica de retencao `data_snapshots` (TD-025) | Evita estouro de quota Supabase | 4h |
| 12 | Politica de retencao `audit_log` (TD-025) | Mesmo motivo | 4h |
| 13 | Deprecar `sync_data` e `nexedu_sync` (TD-026) | Eliminar divergencia de dados | 16h |
| 14 | Indice em `entregas.data_entrega` | Performance de relatorios | 5min |

### Fase 3 - Longo Prazo (Backlog)

| Prioridade | Item | Justificativa | Esforco |
|:----------:|------|---------------|:-------:|
| 15 | Migracao TEXT PK -> UUID (TD-024) | Alto risco, alto esforco, ganho marginal agora | 40h+ |
| 16 | Normalizacao dos snapshots de cliente (TD-021) | Requer redesign do fluxo de NF-e | 24h |
| 17 | Tabela de juncao para `contratos_vinculados` (RA-04) | Baixo impacto operacional | 8h |

---

## 5. Impacto em Performance

### Situacao Atual

| Query | Tabela | Registros Estimados | Tempo Estimado (sem indice) | Tempo Estimado (com indice) |
|-------|--------|:-------------------:|:---------------------------:|:---------------------------:|
| Contas vencidas hoje | `contas_receber` | ~500 | ~15ms (seq scan) | <1ms (index scan) |
| Contas a pagar vencidas | `contas_pagar` | ~200 | ~8ms (seq scan) | <1ms (index scan) |
| NFs por vencimento | `notas_fiscais` | ~1000 | ~30ms (seq scan) | <1ms (index scan) |
| Entregas por data | `entregas` | ~800 | ~25ms (seq scan) | <1ms (index scan) |
| Pedidos por contrato | `pedidos` | ~2000 | Ja tem indice | <1ms |

### Gargalos Criticos

1. **`data_snapshots` JSONB ilimitado** - Cada snapshot pode ter 1-5MB. Tabela pode atingir 500MB sozinha em 6 meses.
2. **`audit_log` sem particao** - 7 tabelas x ~20 operacoes/dia = ~140 registros/dia = ~50K/ano. Com JSONB dos dados antes/depois, cada registro usa ~2KB = ~100MB/ano.
3. **`notas_fiscais.xml_autorizado`** - XMLs de NF-e autorizadas (~15KB cada). Com 1000 NFs = ~15MB so em XML.

### Melhorias Esperadas Apos Correcoes

| Correcao | Metrica Afetada | Melhoria Esperada |
|----------|-----------------|-------------------|
| Indices em vencimento | Dashboard financeiro | 10-50x mais rapido em consultas de vencimento |
| UNIQUE index NF | Emissao de NF-e | Previne duplicidade antes de enviar a SEFAZ (economia de 5-10min por incidente) |
| Retencao de snapshots | Tamanho do banco | Reducao de 60-80% do espaco usado por `data_snapshots` |
| Retencao de audit_log | Tamanho do banco | Reducao de 70% apos 90 dias |
| Funcao atomica `next_nf_number()` | Confiabilidade de NF-e | Elimina 100% do risco de duplicidade por concorrencia |

---

## 6. Scripts de Correcao

### Script 1 - RLS em Todas as Tabelas (TD-002) [CRITICAL]

```sql
-- Migration 006_enable_rls_all.sql
-- Habilita RLS em todas as tabelas e cria policies de isolamento por empresa

-- 1. Habilitar RLS
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

-- 2. Policy para tabela empresas (acessa apenas a propria empresa)
CREATE POLICY empresas_isolation ON empresas
  FOR ALL
  USING (id = current_setting('app.current_empresa_id', true))
  WITH CHECK (id = current_setting('app.current_empresa_id', true));

-- 3. Policy generica para tabelas com empresa_id
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'clientes', 'contratos', 'pedidos', 'notas_fiscais',
    'contas_receber', 'contas_pagar', 'entregas',
    'data_snapshots', 'audit_log'
  ]) LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL USING (empresa_id = current_setting(''app.current_empresa_id'', true)) WITH CHECK (empresa_id = current_setting(''app.current_empresa_id'', true))',
      t || '_isolation', t
    );
  END LOOP;
END;
$$;

-- 4. Policy para nf_counter (PK = empresa_id)
CREATE POLICY nf_counter_isolation ON nf_counter
  FOR ALL
  USING (empresa_id = current_setting('app.current_empresa_id', true))
  WITH CHECK (empresa_id = current_setting('app.current_empresa_id', true));

-- 5. Policy de service_role (backend pode acessar tudo)
-- IMPORTANTE: Apenas o service_role key (nunca exposta no frontend) bypassa RLS
-- Supabase ja faz isso automaticamente para service_role, mas documentamos aqui.
```

---

### Script 2 - Funcao Atomica `next_nf_number()` (TD-017) [CRITICAL]

```sql
-- Migration 007_atomic_nf_counter.sql
-- Elimina race condition no contador de NF

CREATE OR REPLACE FUNCTION next_nf_number(p_empresa_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  -- SELECT FOR UPDATE garante lock exclusivo na linha
  -- Apenas uma transacao por vez pode incrementar o contador
  SELECT counter + 1 INTO v_next
  FROM nf_counter
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_next IS NULL THEN
    -- Empresa sem contador: criar com valor 1
    INSERT INTO nf_counter (empresa_id, counter, updated_at)
    VALUES (p_empresa_id, 1, now())
    ON CONFLICT (empresa_id) DO UPDATE
      SET counter = nf_counter.counter + 1,
          updated_at = now()
    RETURNING counter INTO v_next;
  ELSE
    -- Atualizar o contador atomicamente
    UPDATE nf_counter
    SET counter = v_next, updated_at = now()
    WHERE empresa_id = p_empresa_id;
  END IF;

  RETURN v_next;
END;
$$;

-- Uso no frontend via RPC:
-- const { data } = await supabase.rpc('next_nf_number', { p_empresa_id: empresaId });
-- Resultado: data = proximo numero (INTEGER)

COMMENT ON FUNCTION next_nf_number IS 'Retorna proximo numero de NF atomicamente (thread-safe). Use via supabase.rpc()';
```

---

### Script 3 - UNIQUE Index + Correcao de Trigger (TD-028 + TD-023) [HIGH]

```sql
-- Migration 008_unique_nf_fix_trigger.sql

-- 1. Indice UNIQUE para NF por empresa/serie
-- Previne que duas NFs com mesmo numero existam para a mesma empresa/serie
CREATE UNIQUE INDEX IF NOT EXISTS idx_nfs_unique_empresa_numero_serie
  ON notas_fiscais(empresa_id, numero, serie);

-- 2. Criar funcao set_updated_at() que migration 004 referencia
-- (migration 001 define update_updated_at(), mas 004 usa set_updated_at())
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. Verificar se trigger existe e esta funcional
-- (recriar para garantir que esta apontando para funcao correta)
DROP TRIGGER IF EXISTS trg_resultados_updated_at ON resultados_orcamento;
CREATE TRIGGER trg_resultados_updated_at
  BEFORE UPDATE ON resultados_orcamento
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

---

### Script 4 - NOT NULL em Colunas Financeiras + Indices (TD-018 + TD-019 + RA-05) [HIGH]

```sql
-- Migration 009_financial_integrity.sql

-- 1. Atualizar registros existentes com valor NULL para 0
UPDATE pedidos SET valor = 0 WHERE valor IS NULL;
UPDATE notas_fiscais SET valor = 0 WHERE valor IS NULL;
UPDATE contas_receber SET valor = 0 WHERE valor IS NULL;
UPDATE contas_pagar SET valor = 0 WHERE valor IS NULL;

-- 2. Adicionar NOT NULL constraint
ALTER TABLE pedidos ALTER COLUMN valor SET NOT NULL;
ALTER TABLE pedidos ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE notas_fiscais ALTER COLUMN valor SET NOT NULL;
ALTER TABLE notas_fiscais ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE contas_receber ALTER COLUMN valor SET NOT NULL;
ALTER TABLE contas_receber ALTER COLUMN valor SET DEFAULT 0;

ALTER TABLE contas_pagar ALTER COLUMN valor SET NOT NULL;
ALTER TABLE contas_pagar ALTER COLUMN valor SET DEFAULT 0;

-- 3. Indices para queries de vencimento (quick wins)
CREATE INDEX IF NOT EXISTS idx_cr_vencimento ON contas_receber(vencimento);
CREATE INDEX IF NOT EXISTS idx_cp_vencimento ON contas_pagar(vencimento);
CREATE INDEX IF NOT EXISTS idx_nfs_vencimento ON notas_fiscais(vencimento);
CREATE INDEX IF NOT EXISTS idx_entregas_data ON entregas(data_entrega);

-- 4. Indice composto para dashboard financeiro (contas vencidas por empresa)
CREATE INDEX IF NOT EXISTS idx_cr_empresa_vencimento
  ON contas_receber(empresa_id, vencimento)
  WHERE status IN ('pendente', 'emitida', 'atrasada');

CREATE INDEX IF NOT EXISTS idx_cp_empresa_vencimento
  ON contas_pagar(empresa_id, vencimento)
  WHERE status IN ('pendente', 'atrasada');
```

---

### Script 5 - Alterar `data_apuracao` para DATE + CHECK Constraints (TD-022 + parcial TD-020) [HIGH]

```sql
-- Migration 010_type_safety.sql

-- 1. Converter data_apuracao de TEXT para DATE
-- Tratamento seguro: valores invalidos viram NULL
ALTER TABLE contratos
  ALTER COLUMN data_apuracao TYPE DATE
  USING CASE
    WHEN data_apuracao ~ '^\d{4}-\d{2}-\d{2}$' THEN data_apuracao::DATE
    WHEN data_apuracao ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(data_apuracao, 'DD/MM/YYYY')
    ELSE NULL
  END;

-- 2. CHECK constraints para campos de status
ALTER TABLE contratos ADD CONSTRAINT chk_contratos_status
  CHECK (status IN ('ativo', 'encerrado', 'suspenso', 'cancelado'));

ALTER TABLE pedidos ADD CONSTRAINT chk_pedidos_status
  CHECK (status IN ('em_aberto', 'em_preparo', 'entregue', 'cancelado', 'faturado'));

ALTER TABLE notas_fiscais ADD CONSTRAINT chk_nfs_status
  CHECK (status IN ('pendente', 'autorizada', 'cancelada', 'rejeitada', 'denegada', 'inutilizada'));

ALTER TABLE contas_receber ADD CONSTRAINT chk_cr_status
  CHECK (status IN ('pendente', 'emitida', 'recebida', 'atrasada', 'cancelada'));

ALTER TABLE contas_pagar ADD CONSTRAINT chk_cp_status
  CHECK (status IN ('pendente', 'paga', 'atrasada', 'cancelada', 'emitida'));

ALTER TABLE entregas ADD CONSTRAINT chk_entregas_status
  CHECK (status_entrega IN ('pendente', 'entregue', 'devolvido', 'parcial'));

-- 3. CHECK para tipo_nota em notas_fiscais
ALTER TABLE notas_fiscais ADD CONSTRAINT chk_nfs_tipo_nota
  CHECK (tipo_nota IN ('nfe_real', 'simulacao', 'contingencia', 'devolucao'));

-- 4. FK formal para contas_receber.origem_id (opcional, pode referenciar NF ou pedido)
-- Nota: Como origem_id pode referenciar notas_fiscais OU pedidos, nao adicionamos FK rigida
-- Em vez disso, adicionamos uma coluna de tipo para saber a origem
ALTER TABLE contas_receber ADD COLUMN IF NOT EXISTS origem_tipo TEXT DEFAULT 'nota_fiscal';
```

---

## 7. Estimativa de Esforco

| # | Correcao | Esforco (Implementacao) | Esforco (Teste) | Esforco Total | Dependencias |
|---|----------|:-----------------------:|:---------------:|:-------------:|:------------:|
| 1 | RLS em todas as tabelas | 3h | 2h | **5h** | Nenhuma (mas requer testar TODOS os fluxos do frontend) |
| 2 | Funcao atomica `next_nf_number()` | 1h | 1h | **2h** | Requer alterar `gdp-api.js` para usar `supabase.rpc()` |
| 3 | UNIQUE index NF + fix trigger | 15min | 30min | **45min** | Verificar se existem NFs duplicadas antes de criar indice |
| 4 | NOT NULL + indices financeiros | 30min | 1h | **1.5h** | Verificar se existem registros com valor NULL |
| 5 | `data_apuracao` DATE + CHECK constraints | 1h | 2h | **3h** | Verificar valores existentes que nao convertem |
| 6 | Politica de retencao (snapshots + audit) | 4h | 2h | **6h** | Definir periodo de retencao com stakeholder |
| 7 | Deprecar sync_data/nexedu_sync | 12h | 8h | **20h** | Requer migracao completa e feature flag no frontend |
| 8 | Migracao TEXT -> UUID | 32h | 16h | **48h** | Depende de TODOS os outros itens estarem prontos |

### Resumo por Fase

| Fase | Itens | Esforco Total | Prazo Sugerido |
|------|:-----:|:-------------:|:--------------:|
| Fase 0 (Emergencial) | 1-4 | **~9h** | 2 dias uteis |
| Fase 1 (Integridade) | 5 | **~3h** | 1 dia util |
| Fase 2 (Sustentabilidade) | 6-7 | **~26h** | 1 sprint (2 semanas) |
| Fase 3 (Longo prazo) | 8 | **~48h** | 2-3 sprints |

**Total Fase 0+1 (Bloqueantes):** ~12 horas = **1.5 dias de trabalho focado**

---

## 8. Parecer Final

### Veredicto: **GO CONDICIONAL**

O sistema **pode continuar operando** e **novas features podem ser desenvolvidas**, DESDE QUE:

#### Condicoes Obrigatorias (MUST antes de qualquer feature nova):

1. **RLS habilitado em todas as tabelas** (Script 1) - Sem isso, qualquer pessoa com acesso ao DevTools do browser pode ler/escrever dados de TODAS as empresas. E questao de dias ate que alguem descubra.

2. **Funcao atomica `next_nf_number()`** (Script 2) - NF-e duplicada causa rejeicao na SEFAZ com potencial multa. Com 2 usuarios ou 2 abas, e questao de quando (nao se) isso vai acontecer.

3. **UNIQUE index em NF por empresa/serie** (Script 3) - Complemento obrigatorio do item 2. Belt and suspenders.

#### Condicoes Altamente Recomendadas (SHOULD no mesmo sprint):

4. NOT NULL em colunas financeiras (Script 4)
5. Indices de vencimento (Script 4)
6. Fix do trigger `set_updated_at()` (Script 3)

#### Justificativa do GO Condicional:

- O banco esta funcional e servindo o negocio
- Os dados existentes estao consistentes (migracao 002 foi bem feita)
- O risco CRITICAL (RLS + race condition) e remediavel em 1-2 dias
- Features novas que NAO tocam NF-e ou seguranca podem prosseguir em paralelo com as correcoes
- O volume de dados atual (< 5000 registros) da margem para correcoes sem downtime

#### O que e **NO-GO** absoluto:

- Qualquer feature que exponha novas tabelas via anon key sem RLS
- Qualquer feature de multi-usuario/multi-aba sem corrigir o race condition do `nf_counter`
- Onboarding de novo cliente/empresa sem RLS ativo
- Qualquer auditoria de compliance (LGPD, fiscal) com o estado atual

---

### Proximo Passo

Executar os Scripts 1, 2 e 3 como **Migration 006, 007 e 008** e revalidar o frontend (`gdp-api.js`) para usar `supabase.rpc('next_nf_number')` em vez do pattern atual de GET + save.

---

*Documento gerado por @data-engineer (Dara) - Brownfield Discovery Phase 5*
*Pendente: @ux-design-expert (Phase 6), @qa (Phase 7)*
