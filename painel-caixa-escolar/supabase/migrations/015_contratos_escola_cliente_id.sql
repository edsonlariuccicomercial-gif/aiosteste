-- Migration 015: Add escola_cliente_id column to contratos
-- Fixes: client link being lost on Supabase sync (escolaClienteId not persisted)
-- Applied: 2026-05-01

ALTER TABLE contratos ADD COLUMN IF NOT EXISTS escola_cliente_id text;
