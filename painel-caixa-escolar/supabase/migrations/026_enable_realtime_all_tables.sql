-- Migration 026: Enable Realtime replication on ALL entity tables
-- Without this, Supabase Realtime WebSocket never receives CDC events,
-- which means cross-browser/cross-machine sync silently fails.
--
-- REPLICA IDENTITY FULL is needed so DELETE events include the full old_record
-- (otherwise only the primary key is sent, and the client can't filter by empresa_id).

-- Step 1: Set REPLICA IDENTITY FULL on all entity tables
ALTER TABLE IF EXISTS contratos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS pedidos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS notas_fiscais REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS clientes REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS contas_receber REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS contas_pagar REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS entregas REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS extratos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS conciliacoes REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS produtos REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS sync_data REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS resultados_orcamento REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS radar_equivalencias REPLICA IDENTITY FULL;

-- Step 2: Add all tables to the supabase_realtime publication
-- (Supabase creates this publication by default, but tables must be added explicitly)
DO $$
DECLARE
  _tables TEXT[] := ARRAY[
    'contratos', 'pedidos', 'notas_fiscais', 'clientes',
    'contas_receber', 'contas_pagar', 'entregas',
    'extratos', 'conciliacoes', 'produtos',
    'sync_data', 'resultados_orcamento', 'radar_equivalencias'
  ];
  _t TEXT;
BEGIN
  FOREACH _t IN ARRAY _tables LOOP
    -- Check if table exists before adding to publication
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = _t) THEN
      -- Try to add; ignore if already a member
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', _t);
        RAISE NOTICE 'Added % to supabase_realtime publication', _t;
      EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE '% already in supabase_realtime publication', _t;
      END;
    END IF;
  END LOOP;
END $$;
