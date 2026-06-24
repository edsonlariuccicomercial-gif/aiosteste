-- EPIC-22 Story 22.2 — Persistência ONLINE da visibilidade de módulos por empresa
-- Resolve P4 (handoff @analyst 2026-06-22): a config de acesso a módulos vivia só em
-- localStorage (nexedu.modulos.acesso) → mudanças não refletiam em outros navegadores/máquinas.
-- Esta migration leva a config ao Supabase, 1 linha por empresa_id (single-tenant: 'LARIUCCI').
--
-- Padrão: espelha caixa_config (migration 028) — tabela de config singleton por empresa.
-- Idempotente. RLS permissiva (anon) seguindo o padrão das demais tabelas GDP.
-- Design: @architect (handoff-architect-to-dataeng-story222-design-20260624.yaml).

-- ===== Tabela de config de módulos por empresa =====
-- 3 módulos fixos conhecidos (modulos-acesso.js:12-16): radar, intel_precos, gdp.
-- Default SEGURO: todos true (visíveis) — nunca travar um cliente novo fora de tudo (AC3).
CREATE TABLE IF NOT EXISTS empresa_modulos (
  empresa_id   TEXT PRIMARY KEY DEFAULT 'LARIUCCI',
  radar        BOOLEAN NOT NULL DEFAULT true,
  intel_precos BOOLEAN NOT NULL DEFAULT true,
  gdp          BOOLEAN NOT NULL DEFAULT true,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE empresa_modulos IS 'Visibilidade de módulos por empresa (Story 22.2 / EPIC-22). Fonte única online da config que antes vivia só em localStorage nexedu.modulos.acesso (divergia por navegador). 1 linha por empresa_id.';
COMMENT ON COLUMN empresa_modulos.radar IS 'Módulo Radar visível? Default true (seguro).';
COMMENT ON COLUMN empresa_modulos.intel_precos IS 'Módulo IntelPreços visível? Default true (seguro). Mapeia o camelCase intelPrecos do front.';
COMMENT ON COLUMN empresa_modulos.gdp IS 'Módulo GDP visível? Default true (seguro).';

-- ===== Trigger updated_at (reusa a função existente update_updated_at — migration 001) =====
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_empresa_modulos_updated_at') THEN
    CREATE TRIGGER trg_empresa_modulos_updated_at BEFORE UPDATE ON empresa_modulos FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;

-- ===== RLS permissiva por anon — mesmo padrão de caixa_config (migration 028) =====
-- Backend usa service_role (bypassa RLS); anon é a chave pública do front (read-mostly).
ALTER TABLE empresa_modulos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'empresa_modulos' AND policyname = 'empresa_modulos_anon_read') THEN
    CREATE POLICY empresa_modulos_anon_read ON empresa_modulos FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'empresa_modulos' AND policyname = 'empresa_modulos_anon_write') THEN
    CREATE POLICY empresa_modulos_anon_write ON empresa_modulos FOR ALL TO anon USING (true) WITH CHECK (true);
  END IF;
END;
$$;

-- ===== Realtime: REPLICA IDENTITY FULL + add à publicação (padrão migration 026) =====
-- Sem isto, mudanças de config não propagam para sessões abertas de outras máquinas (FR-22.2.4).
ALTER TABLE IF EXISTS empresa_modulos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'empresa_modulos') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.empresa_modulos;
    EXCEPTION
      WHEN duplicate_object THEN NULL; -- já é membro da publicação
      WHEN undefined_object THEN NULL; -- publicação não existe neste ambiente
    END;
  END IF;
END;
$$;

-- ===== Seed: linha default da empresa (default seguro = tudo visível) =====
-- Idempotente: só insere se ainda não existir a linha LARIUCCI. NÃO sobrescreve config já definida.
INSERT INTO empresa_modulos (empresa_id, radar, intel_precos, gdp)
VALUES ('LARIUCCI', true, true, true)
ON CONFLICT (empresa_id) DO NOTHING;
