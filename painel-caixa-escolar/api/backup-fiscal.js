/**
 * backup-fiscal.js — Daily backup of fiscal data to Supabase Storage
 * Story 7.4 — TD-045 (CRITICAL): No backup/DR for legally required fiscal data
 *
 * Schedule: Daily at 03:00 UTC (via Vercel Cron or external trigger)
 * RPO: 24h | RTO: 4h (manual restore)
 *
 * Exports: notas_fiscais, nf_counter, contas_receber (fiscal), audit_log (fiscal ops)
 * Storage: Supabase Storage bucket "fiscal-backups"
 * Retention: 5 years (Art. 174 CTN)
 */

import { createClient } from '@supabase/supabase-js';
import { gzipSync } from 'zlib';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BACKUP_BUCKET = 'fiscal-backups';
const BACKUP_SECRET = process.env.BACKUP_CRON_SECRET || '';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Auth: protect endpoint with secret (for external cron triggers)
  const authHeader = req.headers['authorization'] || '';
  const querySecret = req.query?.secret || '';
  if (BACKUP_SECRET && authHeader !== `Bearer ${BACKUP_SECRET}` && querySecret !== BACKUP_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const results = { tables: {}, errors: [], timestamp: now.toISOString() };

  try {
    // 1. Fetch fiscal data
    const [nfsResult, counterResult, contasResult, auditResult] = await Promise.all([
      supabase.from('notas_fiscais').select('*'),
      supabase.from('nf_counter').select('*'),
      supabase.from('contas_receber').select('*'),
      supabase.from('audit_log').select('*').in('tabela', ['notas_fiscais', 'nf_counter', 'contas_receber'])
    ]);

    const datasets = {
      notas_fiscais: nfsResult.data || [],
      nf_counter: counterResult.data || [],
      contas_receber: contasResult.data || [],
      audit_log: auditResult.data || []
    };

    // Track counts
    for (const [table, rows] of Object.entries(datasets)) {
      results.tables[table] = rows.length;
      if (rows.length === 0) {
        const error = { notas_fiscais: nfsResult, nf_counter: counterResult, contas_receber: contasResult, audit_log: auditResult }[table];
        if (error?.error) results.errors.push({ table, error: error.error.message });
      }
    }

    // 2. Compress payload
    const payload = JSON.stringify({
      version: '1.0',
      exported_at: now.toISOString(),
      rpo_hours: 24,
      retention_years: 5,
      data: datasets
    });
    const compressed = gzipSync(Buffer.from(payload, 'utf-8'));
    results.size_bytes = compressed.length;
    results.size_kb = Math.round(compressed.length / 1024);

    // 3. Upload to Supabase Storage
    const filePath = `daily/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${dateStr}.json.gz`;
    const { error: uploadError } = await supabase.storage
      .from(BACKUP_BUCKET)
      .upload(filePath, compressed, {
        contentType: 'application/gzip',
        upsert: true
      });

    if (uploadError) {
      // Try to create bucket if it doesn't exist
      if (uploadError.message?.includes('not found') || uploadError.statusCode === '404') {
        await supabase.storage.createBucket(BACKUP_BUCKET, {
          public: false,
          fileSizeLimit: 52428800 // 50MB
        });
        // Retry upload
        const { error: retryError } = await supabase.storage
          .from(BACKUP_BUCKET)
          .upload(filePath, compressed, {
            contentType: 'application/gzip',
            upsert: true
          });
        if (retryError) {
          results.errors.push({ stage: 'upload_retry', error: retryError.message });
        }
      } else {
        results.errors.push({ stage: 'upload', error: uploadError.message });
      }
    }

    // 4. Export individual NF-e XMLs (authorized only)
    const authorizedNfs = (datasets.notas_fiscais || []).filter(nf => nf.xml_autorizado && nf.status === 'autorizada');
    let xmlsUploaded = 0;

    for (const nf of authorizedNfs) {
      const xmlPath = `xml/${nf.empresa_id}/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/NFe-${nf.numero}-${nf.serie || '1'}-${nf.chave_acesso || nf.id}.xml`;
      const { error: xmlErr } = await supabase.storage
        .from(BACKUP_BUCKET)
        .upload(xmlPath, nf.xml_autorizado, {
          contentType: 'application/xml',
          upsert: true
        });
      if (!xmlErr) xmlsUploaded++;
    }
    results.xmls_uploaded = xmlsUploaded;
    results.xmls_total = authorizedNfs.length;

    // 5. Log backup execution
    results.success = results.errors.length === 0;
    await supabase.from('audit_log').insert({
      empresa_id: 'SYSTEM',
      tabela: 'backup_fiscal',
      operacao: 'BACKUP',
      dados_novos: results
    }).catch(() => {}); // don't fail if audit insert fails

    return res.status(results.success ? 200 : 207).json(results);

  } catch (err) {
    results.errors.push({ stage: 'global', error: err.message });
    results.success = false;
    return res.status(500).json(results);
  }
}
