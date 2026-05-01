-- Migration 016: Add missing columns to clientes table
-- Fixes: login/senha and other fields not persisting on Supabase sync
-- Applied: 2026-05-01

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS login text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS senha text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS municipio text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS responsavel text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cargo text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS contribuinte_icms text DEFAULT '9';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS categoria_catalogo text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS arp_vinculada text;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_total numeric DEFAULT 0;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS saldo_disponivel numeric DEFAULT 0;
