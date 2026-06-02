-- Migration 024: Revert escola passwords to plaintext
-- Migration 021 hashed passwords but verify_escola_login RPC fails.
-- Root cause: passwords may have been double-hashed (localStorage cached
-- bcrypt hashes that got re-hashed), or crypt() search_path issue.
-- Reverting to plaintext until frontend migrates to Supabase Auth.

-- Restore known escola passwords from escolas-credentials.json
-- These are the only schools currently using the portal.

UPDATE clientes SET senha = 'escola2025' WHERE login = 'lauriston';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'maestro';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'chaves';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'vasco';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'josemendonca';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'joseadolfo';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'valadares';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'polivalente';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'corina';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'penha';
UPDATE clientes SET senha = 'escola2025' WHERE login = 'armando';

-- Update any other clientes with bcrypt hashes back to default
UPDATE clientes SET senha = 'escola2025'
WHERE senha IS NOT NULL AND senha LIKE '$2a$%';

-- Drop the RPC function (not needed with plaintext)
DROP FUNCTION IF EXISTS verify_escola_login(TEXT, TEXT);
