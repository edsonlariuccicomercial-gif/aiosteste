-- Migration 023: Fix verify_escola_login — bcrypt not working in SECURITY DEFINER
-- Problem: extensions.crypt() not found in function context
-- Solution: Set search_path to include extensions schema

DROP FUNCTION IF EXISTS verify_escola_login(TEXT, TEXT);

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
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, extensions;

GRANT EXECUTE ON FUNCTION verify_escola_login(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION verify_escola_login(TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION verify_escola_login IS 'Verify escola login with bcrypt. SET search_path includes extensions for crypt(). Story 5.2 fix.';
