-- Migration 038: recuperar chave_acesso/protocolo/status de NFs danificadas pelo carimbão
-- ============================================================================
-- CONTEXTO: o carimbão (saveAll em massa, corrigido nas migrations 035-037 + frontend)
-- apagou a COLUNA chave_acesso/protocolo de NFs que JÁ estavam autorizadas pela SEFAZ.
-- Diagnóstico @analyst (2026-06-23): a chave/protocolo SOBREVIVERAM no campo JSON interno
-- sefaz.chaveAcesso / sefaz.protocolo em 18 NFs. A NF 1588 perdeu tudo (travou em preparo);
-- sua chave veio da DANFE física (validada: DV ok, número e CNPJ conferem).
--
-- DADOS FISCAIS — todas as chaves validadas (44 díg, DV correto, número bate, CNPJ=36802147000142).
--
-- IDEMPOTENTE: só toca registros com chave_acesso NULL/vazia e deleted_at IS NULL.
-- REVERSÍVEL: rollbacks/038_rollback.sql (volta os campos a NULL — não recomendado, é dado correto).
-- SNAPSHOT lógico: supabase/snapshots/snapshot-pre-038-nfs.json
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- GRUPO A (18 NFs): chave/protocolo recuperados do PRÓPRIO JSON interno.
-- Deriva de sefaz->>'chaveAcesso' — NÃO hardcoda (idempotente e auto-validável).
-- Guard: só chave de 44 dígitos numéricos; só registros não-deletados sem chave.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE notas_fiscais nf
SET
  chave_acesso = nf.sefaz->>'chaveAcesso',
  protocolo    = COALESCE(NULLIF(nf.protocolo, ''), nf.sefaz->>'protocolo'),
  status       = 'autorizada'
WHERE nf.empresa_id = 'LARIUCCI'
  AND nf.tipo_nota = 'nfe_real'
  AND nf.deleted_at IS NULL
  AND (nf.chave_acesso IS NULL OR nf.chave_acesso = '')
  AND nf.sefaz->>'chaveAcesso' ~ '^[0-9]{44}$';

-- ────────────────────────────────────────────────────────────────────────────
-- GRUPO B (NF 1588): chave/protocolo da DANFE física (não havia campo interno).
-- Chave validada: DV=4 ok, número=1588, CNPJ=36802147000142.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE notas_fiscais
SET
  chave_acesso = '31260636802147000142550010000015881336577344',
  protocolo    = '131267658356713',
  status       = 'autorizada',
  sefaz        = COALESCE(sefaz, '{}'::jsonb)
                 || jsonb_build_object(
                      'status', 'autorizada',
                      'chaveAcesso', '31260636802147000142550010000015881336577344',
                      'protocolo', '131267658356713'
                    )
WHERE empresa_id = 'LARIUCCI'
  AND numero = '1588'
  AND tipo_nota = 'nfe_real'
  AND deleted_at IS NULL
  AND (chave_acesso IS NULL OR chave_acesso = '');

-- ────────────────────────────────────────────────────────────────────────────
-- PEDIDOS VINCULADOS: promover para 'faturado' os pedidos das 19 NFs recuperadas,
-- SEM rebaixar quem já avançou (entregue/recebido/cancelado). Só promove status
-- "anteriores" ao faturamento. O vínculo fiscal é restaurado no JSONB fiscal.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE pedidos p
SET
  status = 'faturado',
  fiscal = COALESCE(p.fiscal, '{}'::jsonb)
           || jsonb_build_object('status', 'autorizada', 'notaFiscalId', nf.id)
FROM notas_fiscais nf
WHERE nf.empresa_id = 'LARIUCCI'
  AND nf.tipo_nota = 'nfe_real'
  AND nf.status = 'autorizada'
  AND nf.deleted_at IS NULL
  AND nf.chave_acesso IS NOT NULL
  AND nf.numero IN ('1429','1432','1438','1441','1466','1467','1468','1494',
                    '1512','1513','1515','1526','1534','1558','1568','1577',
                    '1585','1587','1588')
  AND p.id = nf.pedido_id
  AND p.empresa_id = 'LARIUCCI'
  AND p.status IN ('em_aberto','agendado','separando','preparando_envio','prep_envio','pronto_envio');

COMMIT;
