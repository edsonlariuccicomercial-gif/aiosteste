-- Migration 013: Price history aggregation views and functions
-- Story 8.9-8.11 (G4): Série histórica dedicada por cidade/SRE/escola
-- Enables strategic pricing intelligence: trend analysis and competitive positioning

-- ============================================================
-- 1. Additional indices for aggregation queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_preco_hist_escola ON preco_historico(escola);
CREATE INDEX IF NOT EXISTS idx_preco_hist_municipio ON preco_historico((metadata->>'municipio'));
CREATE INDEX IF NOT EXISTS idx_preco_hist_sku_created ON preco_historico(sku, created_at DESC);

-- ============================================================
-- 2. RPC: Price trend by SKU (for a specific empresa)
-- Returns average price per month for a given SKU
-- ============================================================
CREATE OR REPLACE FUNCTION preco_historico_tendencia(
  p_empresa_id TEXT,
  p_sku TEXT,
  p_meses INTEGER DEFAULT 12
)
RETURNS TABLE(
  mes TEXT,
  preco_medio NUMERIC,
  custo_medio NUMERIC,
  margem_media NUMERIC,
  qtd_registros INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    to_char(created_at, 'YYYY-MM') as mes,
    ROUND(AVG(valor), 2) as preco_medio,
    ROUND(AVG(custo_base), 2) as custo_medio,
    ROUND(AVG(margem_pct), 2) as margem_media,
    COUNT(*)::INTEGER as qtd_registros
  FROM preco_historico
  WHERE empresa_id = p_empresa_id
    AND sku = p_sku
    AND created_at >= now() - (p_meses || ' months')::INTERVAL
  GROUP BY to_char(created_at, 'YYYY-MM')
  ORDER BY mes DESC;
$$;

-- ============================================================
-- 3. RPC: Aggregation by municipality/SRE
-- Returns average prices grouped by location
-- ============================================================
CREATE OR REPLACE FUNCTION preco_historico_por_regiao(
  p_empresa_id TEXT,
  p_sku TEXT DEFAULT NULL
)
RETURNS TABLE(
  sre TEXT,
  escola TEXT,
  preco_medio NUMERIC,
  preco_minimo NUMERIC,
  preco_maximo NUMERIC,
  margem_media NUMERIC,
  total_registros INTEGER,
  ultimo_registro TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE(ph.sre, 'N/A') as sre,
    ph.escola,
    ROUND(AVG(ph.valor), 2) as preco_medio,
    ROUND(MIN(ph.valor), 2) as preco_minimo,
    ROUND(MAX(ph.valor), 2) as preco_maximo,
    ROUND(AVG(ph.margem_pct), 2) as margem_media,
    COUNT(*)::INTEGER as total_registros,
    MAX(ph.created_at) as ultimo_registro
  FROM preco_historico ph
  WHERE ph.empresa_id = p_empresa_id
    AND (p_sku IS NULL OR ph.sku = p_sku)
    AND ph.created_at >= now() - INTERVAL '24 months'
  GROUP BY COALESCE(ph.sre, 'N/A'), ph.escola
  ORDER BY total_registros DESC;
$$;

-- ============================================================
-- 4. RPC: Competitive analysis (ganho vs perdido por SKU)
-- ============================================================
CREATE OR REPLACE FUNCTION preco_historico_competitividade(
  p_empresa_id TEXT,
  p_sku TEXT DEFAULT NULL
)
RETURNS TABLE(
  sku TEXT,
  total_propostas INTEGER,
  total_ganhos INTEGER,
  total_perdidos INTEGER,
  taxa_conversao NUMERIC,
  preco_medio_ganho NUMERIC,
  preco_medio_perdido NUMERIC,
  delta_medio_perda NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    ph.sku,
    COUNT(*)::INTEGER as total_propostas,
    COUNT(*) FILTER (WHERE ph.tipo = 'ganho')::INTEGER as total_ganhos,
    COUNT(*) FILTER (WHERE ph.tipo = 'perdido')::INTEGER as total_perdidos,
    ROUND(
      COUNT(*) FILTER (WHERE ph.tipo = 'ganho')::NUMERIC /
      NULLIF(COUNT(*) FILTER (WHERE ph.tipo IN ('ganho', 'perdido')), 0) * 100,
      1
    ) as taxa_conversao,
    ROUND(AVG(ph.valor) FILTER (WHERE ph.tipo = 'ganho'), 2) as preco_medio_ganho,
    ROUND(AVG(ph.valor) FILTER (WHERE ph.tipo = 'perdido'), 2) as preco_medio_perdido,
    ROUND(AVG(
      CASE WHEN ph.tipo = 'perdido' AND ph.metadata ? 'preco_vencedor'
        THEN (ph.valor - (ph.metadata->>'preco_vencedor')::NUMERIC)
        ELSE NULL
      END
    ), 2) as delta_medio_perda
  FROM preco_historico ph
  WHERE ph.empresa_id = p_empresa_id
    AND (p_sku IS NULL OR ph.sku = p_sku)
  GROUP BY ph.sku
  HAVING COUNT(*) >= 2
  ORDER BY total_propostas DESC;
$$;

-- ============================================================
-- 5. Grant to authenticated users
-- ============================================================
GRANT EXECUTE ON FUNCTION preco_historico_tendencia(TEXT, TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION preco_historico_tendencia(TEXT, TEXT, INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION preco_historico_por_regiao(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION preco_historico_por_regiao(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION preco_historico_competitividade(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION preco_historico_competitividade(TEXT, TEXT) TO anon;
