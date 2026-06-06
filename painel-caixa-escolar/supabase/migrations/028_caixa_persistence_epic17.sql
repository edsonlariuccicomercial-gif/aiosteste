-- EPIC-17 Fase 1 — Persistência do caixa multiusuário
-- Story 17.6: soft-delete de lançamentos do caixa (substitui tombstone por-navegador)
-- Story 17.5: saldo inicial sincronizado (substitui localStorage por-navegador)
-- Idempotente. RLS permissiva (anon) seguindo o padrão das tabelas GDP.

-- ===== Story 17.6: soft-delete em conciliacoes =====
-- Exclusão de lançamento = UPDATE deleted_at; leitura filtra deleted_at IS NULL.
-- Sincroniza para todos os usuários (antes era gdp.conciliacao.deleted.v1 por-navegador).
ALTER TABLE conciliacoes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

COMMENT ON COLUMN conciliacoes.deleted_at IS 'Soft-delete (Story 17.6): exclusão sincronizada. NULL = ativo; preenchido = excluído. Substitui o tombstone local gdp.conciliacao.deleted.v1.';

-- Índice parcial: acelera o filtro "deleted_at IS NULL" (leitura padrão do caixa)
CREATE INDEX IF NOT EXISTS idx_conciliacoes_ativas
  ON conciliacoes (empresa_id)
  WHERE deleted_at IS NULL;

-- ===== Story 17.5: saldo inicial sincronizado =====
-- Tabela de configuração do caixa por empresa (1 linha por empresa_id).
-- Hoje guarda o saldo inicial; extensível para outras configs do caixa.
CREATE TABLE IF NOT EXISTS caixa_config (
  empresa_id          TEXT PRIMARY KEY DEFAULT 'LARIUCCI',
  saldo_inicial       NUMERIC(12,2) NOT NULL DEFAULT 0,
  saldo_inicial_data  DATE,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE caixa_config IS 'Configuração sincronizada do caixa por empresa (Story 17.5). saldo_inicial é a fonte única do saldo de abertura — antes ficava só em localStorage nexedu.config.contas-bancarias (divergia por navegador).';
COMMENT ON COLUMN caixa_config.saldo_inicial IS 'Saldo de abertura do caixa, único e sincronizado para todos os usuários da empresa.';
COMMENT ON COLUMN caixa_config.saldo_inicial_data IS 'Data de referência do saldo inicial (marco zero).';

-- Trigger updated_at (reusa a função existente update_updated_at)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_caixa_config_updated_at') THEN
    CREATE TRIGGER trg_caixa_config_updated_at BEFORE UPDATE ON caixa_config FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- RLS permissiva por anon — mesmo padrão de extratos/conciliacoes (migration 018/022)
ALTER TABLE caixa_config ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'caixa_config' AND policyname = 'caixa_config_anon_read') THEN
    CREATE POLICY caixa_config_anon_read ON caixa_config FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'caixa_config' AND policyname = 'caixa_config_anon_write') THEN
    CREATE POLICY caixa_config_anon_write ON caixa_config FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- Seed do saldo inicial atual (marco zero do reset — EPIC-17 Fase 2): R$ 10.949,40 ref. 02/06/2026.
-- Idempotente: só insere se ainda não existir a linha LARIUCCI. NÃO sobrescreve valor já definido.
INSERT INTO caixa_config (empresa_id, saldo_inicial, saldo_inicial_data)
VALUES ('LARIUCCI', 10949.40, '2026-06-02')
ON CONFLICT (empresa_id) DO NOTHING;
