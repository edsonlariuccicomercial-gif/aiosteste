-- Migration 021: Hash school passwords — Story 5.2 (TD-C2)
-- Converts plaintext passwords in clientes table to bcrypt hashes.
-- Uses pgcrypto extension (available by default in Supabase).

-- Ensure pgcrypto is available
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Hash all existing plaintext passwords
UPDATE clientes
SET senha = crypt(senha, gen_salt('bf', 8))
WHERE senha IS NOT NULL
  AND senha != ''
  AND senha NOT LIKE '$2a$%'  -- skip already hashed
  AND senha NOT LIKE '$2b$%'; -- skip already hashed

-- Create RPC function for portal login verification
CREATE OR REPLACE FUNCTION verify_escola_login(
  p_login TEXT,
  p_senha TEXT
) RETURNS TABLE(
  id TEXT,
  empresa_id TEXT,
  nome TEXT,
  cnpj TEXT,
  sre TEXT,
  municipio TEXT,
  login TEXT,
  responsavel TEXT,
  cargo TEXT,
  telefone TEXT,
  email TEXT,
  categoria_catalogo TEXT,
  arp_vinculada TEXT,
  saldo_disponivel NUMERIC,
  saldo_total NUMERIC,
  contratos_vinculados TEXT[],
  ie TEXT,
  uf TEXT,
  cep TEXT,
  endereco JSONB,
  contribuinte_icms TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id, c.empresa_id, c.nome, c.cnpj, c.sre, c.municipio,
    c.login, c.responsavel, c.cargo, c.telefone, c.email,
    c.categoria_catalogo, c.arp_vinculada,
    c.saldo_disponivel, c.saldo_total,
    c.contratos_vinculados, c.ie, c.uf, c.cep,
    c.endereco, c.contribuinte_icms
  FROM clientes c
  WHERE LOWER(c.login) = LOWER(p_login)
    AND c.senha IS NOT NULL
    AND c.senha = crypt(p_senha, c.senha);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to anon (portal uses anon key)
GRANT EXECUTE ON FUNCTION verify_escola_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_escola_login(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION verify_escola_login IS 'Verify escola login credentials against bcrypt hash. Returns escola data if match. Story 5.2.';
