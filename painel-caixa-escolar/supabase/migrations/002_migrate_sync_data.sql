-- ============================================================
-- Story 5.1 — Migracão Supabase-First
-- DML: Migrar dados de sync_data (key-value) para tabelas normalizadas
-- Idempotente: usa ON CONFLICT DO NOTHING em todos os INSERTs
-- ============================================================

BEGIN;

-- ============================================================
-- Helper: variável para o user_id fonte
-- ============================================================
-- Usamos um CTE constante nos blocos que precisam do user_id.
-- O sync_data usa user_id = 'LARIUCCI' como fonte primária.

-- ============================================================
-- 1. EMPRESA — criar a partir de nexedu.empresa
-- ============================================================
-- Gera o ID da empresa e insere. O ID é reutilizado em todas
-- as tabelas seguintes via sub-select.

INSERT INTO empresas (id, nome, nome_fantasia, razao_social, cnpj)
SELECT
  COALESCE(d.data->>'syncUserId', 'LARIUCCI') AS id,
  COALESCE(d.data->>'nome', d.data->>'nomeFantasia', 'Empresa') AS nome,
  d.data->>'nomeFantasia' AS nome_fantasia,
  d.data->>'razaoSocial' AS razao_social,
  d.data->>'cnpj' AS cnpj
FROM sync_data d
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'nexedu.empresa'
ON CONFLICT (id) DO NOTHING;

-- Fallback: se nexedu.empresa não existir, criar empresa padrão
INSERT INTO empresas (id, nome, cnpj)
SELECT 'LARIUCCI', 'Empresa LARIUCCI', '00000000000000'
WHERE NOT EXISTS (SELECT 1 FROM empresas WHERE id = 'LARIUCCI')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 2. CLIENTES — de gdp.usuarios.v1
-- ============================================================
-- Formato: array direto (sem wrapper { items: [...] })

INSERT INTO clientes (id, empresa_id, nome, cnpj, ie, uf, cep, sre, email, contratos_vinculados, dados_extras)
SELECT
  u->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  COALESCE(u->>'nome', 'Sem nome') AS nome,
  u->>'cnpj' AS cnpj,
  u->>'ie' AS ie,
  COALESCE(u->>'uf', 'MG') AS uf,
  u->>'cep' AS cep,
  u->>'sre' AS sre,
  u->>'email' AS email,
  -- contratos_vinculados: JSONB array → TEXT[]
  COALESCE(
    (SELECT array_agg(cv.value::text)
     FROM jsonb_array_elements_text(COALESCE(u->'contratos_vinculados', '[]'::jsonb)) cv),
    '{}'
  ) AS contratos_vinculados,
  -- Preservar campos extras que não têm coluna dedicada
  jsonb_build_object(
    'telefone', u->>'telefone',
    'endereco', u->'endereco'
  ) AS dados_extras
FROM sync_data d,
     jsonb_array_elements(d.data) u
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.usuarios.v1'
  AND u->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 3. CONTRATOS — de gdp.contratos.v1
-- ============================================================
-- Formato: { items: [...] }

INSERT INTO contratos (id, empresa_id, escola, processo, edital, objeto, status, fornecedor,
                       vigencia, observacoes, itens, cliente_snapshot, dados_extras)
SELECT
  c->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  COALESCE(c->>'escola', 'Sem escola') AS escola,
  c->>'processo' AS processo,
  c->>'edital' AS edital,
  c->>'objeto' AS objeto,
  COALESCE(c->>'status', 'ativo') AS status,
  c->>'fornecedor' AS fornecedor,
  COALESCE(c->'vigencia', '{}'::jsonb) AS vigencia,
  c->>'observacoes' AS observacoes,
  COALESCE(c->'itens', '[]'::jsonb) AS itens,
  COALESCE(c->'clienteSnapshot', '{}'::jsonb) AS cliente_snapshot,
  -- Campos extras sem coluna dedicada
  jsonb_build_object(
    'dataApuracao', c->>'dataApuracao'
  ) AS dados_extras
FROM sync_data d,
     jsonb_array_elements(d.data->'items') c
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.contratos.v1'
  AND c->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 4. PEDIDOS — de gdp.pedidos.v1
-- ============================================================
-- Formato: { items: [...] }
-- Mapeamento: contratoId → contrato_id

INSERT INTO pedidos (id, empresa_id, contrato_id, escola, data, status, valor, obs,
                     itens, fiscal, cliente, pagamento, marcador, audit)
SELECT
  p->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  p->>'contratoId' AS contrato_id,
  COALESCE(p->>'escola', 'Sem escola') AS escola,
  CASE WHEN p->>'data' IS NOT NULL AND p->>'data' != ''
       THEN (p->>'data')::date
       ELSE NULL END AS data,
  COALESCE(p->>'status', 'em_aberto') AS status,
  CASE WHEN p->>'valor' IS NOT NULL AND p->>'valor' != ''
       THEN (p->>'valor')::numeric
       ELSE NULL END AS valor,
  p->>'obs' AS obs,
  COALESCE(p->'itens', '[]'::jsonb) AS itens,
  COALESCE(p->'fiscal', '{}'::jsonb) AS fiscal,
  COALESCE(p->'cliente', '{}'::jsonb) AS cliente,
  COALESCE(p->'pagamento', '{}'::jsonb) AS pagamento,
  p->>'marcador' AS marcador,
  COALESCE(p->'audit', '{}'::jsonb) AS audit
FROM sync_data d,
     jsonb_array_elements(d.data->'items') p
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.pedidos.v1'
  AND p->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. NOTAS FISCAIS — de gdp.notas-fiscais.v1
-- ============================================================
-- Formato: { _v: 1, items: [...] }
-- Mapeamentos: pedidoId → pedido_id, contratoId → contrato_id,
--              tipoNota → tipo_nota, emitidaEm → emitida_em
-- Extrair sefaz.chaveAcesso → chave_acesso, sefaz.protocolo → protocolo

INSERT INTO notas_fiscais (id, empresa_id, pedido_id, contrato_id, numero, serie,
                           valor, status, tipo_nota, origem, emitida_em, vencimento,
                           cliente, itens, sefaz, cobranca, documentos, parametros,
                           integracoes, chave_acesso, protocolo, audit)
SELECT
  nf->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  nf->>'pedidoId' AS pedido_id,
  nf->>'contratoId' AS contrato_id,
  COALESCE(nf->>'numero', '0') AS numero,
  COALESCE(nf->>'serie', '1') AS serie,
  CASE WHEN nf->>'valor' IS NOT NULL AND nf->>'valor' != ''
       THEN (nf->>'valor')::numeric
       ELSE NULL END AS valor,
  COALESCE(nf->>'status', 'pendente') AS status,
  COALESCE(nf->>'tipoNota', 'nfe_real') AS tipo_nota,
  COALESCE(nf->>'origem', 'pedido') AS origem,
  CASE WHEN nf->>'emitidaEm' IS NOT NULL AND nf->>'emitidaEm' != ''
       THEN (nf->>'emitidaEm')::timestamptz
       ELSE NULL END AS emitida_em,
  CASE WHEN nf->>'vencimento' IS NOT NULL AND nf->>'vencimento' != ''
       THEN (nf->>'vencimento')::date
       ELSE NULL END AS vencimento,
  COALESCE(nf->'cliente', '{}'::jsonb) AS cliente,
  COALESCE(nf->'itens', '[]'::jsonb) AS itens,
  COALESCE(nf->'sefaz', '{}'::jsonb) AS sefaz,
  COALESCE(nf->'cobranca', '{}'::jsonb) AS cobranca,
  COALESCE(nf->'documentos', '{}'::jsonb) AS documentos,
  COALESCE(nf->'parametros', '{}'::jsonb) AS parametros,
  COALESCE(nf->'integracoes', '{}'::jsonb) AS integracoes,
  -- Extrair do sub-objeto sefaz
  nf->'sefaz'->>'chaveAcesso' AS chave_acesso,
  nf->'sefaz'->>'protocolo' AS protocolo,
  COALESCE(nf->'audit', '{}'::jsonb) AS audit
FROM sync_data d,
     jsonb_array_elements(d.data->'items') nf
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.notas-fiscais.v1'
  AND nf->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. CONTAS A RECEBER — de gdp.contas-receber.v1
-- ============================================================
-- Formato: { items: [...] }
-- Mapeamentos: pedidoId → pedido_id, origemId → origem_id

INSERT INTO contas_receber (id, empresa_id, pedido_id, origem_id, descricao, valor,
                            status, forma, categoria, vencimento, cliente, cobranca,
                            automacao, audit)
SELECT
  cr->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  cr->>'pedidoId' AS pedido_id,
  cr->>'origemId' AS origem_id,
  cr->>'descricao' AS descricao,
  CASE WHEN cr->>'valor' IS NOT NULL AND cr->>'valor' != ''
       THEN (cr->>'valor')::numeric
       ELSE NULL END AS valor,
  COALESCE(cr->>'status', 'pendente') AS status,
  cr->>'forma' AS forma,
  cr->>'categoria' AS categoria,
  CASE WHEN cr->>'vencimento' IS NOT NULL AND cr->>'vencimento' != ''
       THEN (cr->>'vencimento')::date
       ELSE NULL END AS vencimento,
  COALESCE(cr->'cliente', '{}'::jsonb) AS cliente,
  COALESCE(cr->'cobranca', '{}'::jsonb) AS cobranca,
  COALESCE(cr->'automacao', '{}'::jsonb) AS automacao,
  COALESCE(cr->'audit', '{}'::jsonb) AS audit
FROM sync_data d,
     jsonb_array_elements(d.data->'items') cr
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.contas-receber.v1'
  AND cr->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 7. CONTAS A PAGAR — de gdp.contas-pagar.v1
-- ============================================================
-- Formato: { items: [...] } (atualmente vazio, mas preparado)

INSERT INTO contas_pagar (id, empresa_id, descricao, valor, status, forma, categoria,
                          vencimento, fornecedor, audit)
SELECT
  cp->>'id' AS id,
  'LARIUCCI' AS empresa_id,
  cp->>'descricao' AS descricao,
  CASE WHEN cp->>'valor' IS NOT NULL AND cp->>'valor' != ''
       THEN (cp->>'valor')::numeric
       ELSE NULL END AS valor,
  COALESCE(cp->>'status', 'pendente') AS status,
  cp->>'forma' AS forma,
  cp->>'categoria' AS categoria,
  CASE WHEN cp->>'vencimento' IS NOT NULL AND cp->>'vencimento' != ''
       THEN (cp->>'vencimento')::date
       ELSE NULL END AS vencimento,
  COALESCE(cp->'fornecedor', '{}'::jsonb) AS fornecedor,
  COALESCE(cp->'audit', '{}'::jsonb) AS audit
FROM sync_data d,
     jsonb_array_elements(d.data->'items') cp
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.contas-pagar.v1'
  AND cp->>'id' IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. ENTREGAS — de gdp.entregas.provas.v1
-- ============================================================
-- Formato: array direto (sem wrapper { items: [...] })
-- Não tem campo 'id' no JSON — gerar um ID composto de pedidoId + escola

INSERT INTO entregas (id, empresa_id, pedido_id, escola, data_entrega, status_entrega,
                      recebedor, obs, foto, assinatura)
SELECT
  -- Gerar ID determinístico: pedidoId-escola (para idempotência)
  COALESCE(
    e->>'id',
    md5(COALESCE(e->>'pedidoId', '') || '-' || COALESCE(e->>'escola', '') || '-' || COALESCE(e->>'dataEntrega', ''))
  ) AS id,
  'LARIUCCI' AS empresa_id,
  e->>'pedidoId' AS pedido_id,
  e->>'escola' AS escola,
  CASE WHEN e->>'dataEntrega' IS NOT NULL AND e->>'dataEntrega' != ''
       THEN (e->>'dataEntrega')::date
       ELSE NULL END AS data_entrega,
  COALESCE(e->>'statusEntrega', 'pendente') AS status_entrega,
  e->>'recebedor' AS recebedor,
  e->>'obs' AS obs,
  e->>'foto' AS foto,
  e->>'assinatura' AS assinatura
FROM sync_data d,
     jsonb_array_elements(d.data) e
WHERE d.user_id = 'LARIUCCI'
  AND d.key = 'gdp.entregas.provas.v1'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 9. NF COUNTER — inicializar com o maior número de NF existente
-- ============================================================

INSERT INTO nf_counter (empresa_id, counter)
SELECT
  'LARIUCCI',
  COALESCE(
    (SELECT MAX(numero::integer) FROM notas_fiscais
     WHERE empresa_id = 'LARIUCCI' AND numero ~ '^\d+$'),
    0
  )
ON CONFLICT (empresa_id) DO NOTHING;

-- ============================================================
-- 10. VERIFICAÇÃO — contagem de registros migrados
-- ============================================================

SELECT 'empresas' AS tabela, count(*) AS registros FROM empresas WHERE id = 'LARIUCCI'
UNION ALL
SELECT 'clientes', count(*) FROM clientes WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'contratos', count(*) FROM contratos WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'pedidos', count(*) FROM pedidos WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'notas_fiscais', count(*) FROM notas_fiscais WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'contas_receber', count(*) FROM contas_receber WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'contas_pagar', count(*) FROM contas_pagar WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'entregas', count(*) FROM entregas WHERE empresa_id = 'LARIUCCI'
UNION ALL
SELECT 'nf_counter', counter FROM nf_counter WHERE empresa_id = 'LARIUCCI';

COMMIT;
