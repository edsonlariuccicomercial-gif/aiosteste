-- Rollback da Migration 038: reverter recuperação de chaves de NF
-- ============================================================================
-- ATENÇÃO: NÃO é recomendado reverter — os dados restaurados são CORRETOS
-- (chaves/protocolos reais de NFs autorizadas pela SEFAZ). Reverter recria o
-- estado danificado (NFs reais aparecendo como pendentes/amarelas).
--
-- Use APENAS se a migration tiver gravado dado errado. O snapshot do estado
-- anterior está em supabase/snapshots/snapshot-pre-038-nfs.json (referência).
--
-- Este rollback volta as 19 NFs recuperadas + 1588 ao estado pré-038 e
-- desfaz a promoção dos pedidos.
-- ============================================================================

BEGIN;

-- Reverter NF 1588 (caso especial — veio da DANFE)
UPDATE notas_fiscais
SET chave_acesso = NULL, protocolo = NULL, status = 'rascunho_nf_real'
WHERE empresa_id = 'LARIUCCI' AND numero = '1588' AND tipo_nota = 'nfe_real'
  AND chave_acesso = '31260636802147000142550010000015881336577344';

-- Reverter grupo A: voltar chave_acesso/protocolo a NULL onde foram copiados do JSON.
-- (status permanece 'autorizada' pois elas JÁ eram autorizada antes — só a coluna
--  chave estava vazia; reverter o status não faz sentido.)
UPDATE notas_fiscais nf
SET chave_acesso = NULL, protocolo = NULL
WHERE nf.empresa_id = 'LARIUCCI'
  AND nf.tipo_nota = 'nfe_real'
  AND nf.deleted_at IS NULL
  AND nf.numero IN ('1429','1432','1438','1441','1466','1467','1468','1494',
                    '1512','1513','1515','1526','1534','1558','1568','1577','1585','1587')
  AND nf.chave_acesso = nf.sefaz->>'chaveAcesso';

-- Nota: a promoção de pedidos para 'faturado' NÃO é revertida automaticamente
-- (não há registro do status anterior exato de cada pedido). Se necessário,
-- restaurar manualmente a partir do snapshot.

COMMIT;
