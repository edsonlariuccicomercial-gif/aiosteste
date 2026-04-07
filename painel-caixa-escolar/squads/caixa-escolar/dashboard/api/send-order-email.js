function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const body = req.body;
  if (!body) return res.status(400).json({ error: "JSON invalido" });

  const { to, schoolName, protocol, date, items, total, obs, olistId, responsible, cnpj, sre, pagamento, nfe } = body;

  if (!to || !protocol) {
    return res.status(400).json({ error: "Campos obrigatorios: to, protocol" });
  }

  const itemsHtml = (items || []).map((i, idx) =>
    `<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${idx+1}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;">${i.description || i.name}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">${i.qty}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">R$ ${(i.unitPrice || 0).toFixed(2).replace('.', ',')}</td><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">R$ ${((i.unitPrice || 0) * (i.qty || 0)).toFixed(2).replace('.', ',')}</td></tr>`
  ).join('');

  const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;">
      <div style="background:#1e293b;padding:20px 24px;">
        <h1 style="color:#f1f5f9;font-size:18px;margin:0;">GDP — Confirmacao de Pedido</h1>
        <p style="color:#94a3b8;font-size:13px;margin:4px 0 0;">Lariucci & Ribeiro Pereira</p>
      </div>
      <div style="padding:24px;">
        <p style="font-size:14px;color:#334155;">Pedido registrado com sucesso!</p>
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:0 0 4px;font-size:13px;color:#64748b;">Protocolo</p>
          <p style="margin:0;font-size:20px;font-weight:800;color:#3b82f6;font-family:monospace;">${protocol}</p>
        </div>
        <table style="width:100%;font-size:13px;color:#334155;margin-bottom:12px;">
          <tr><td style="padding:4px 0;color:#64748b;">Escola:</td><td style="padding:4px 0;font-weight:600;">${schoolName || ''}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">CNPJ:</td><td style="padding:4px 0;">${cnpj || ''}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">Responsavel:</td><td style="padding:4px 0;">${responsible || ''}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">SRE:</td><td style="padding:4px 0;">${sre || ''}</td></tr>
          <tr><td style="padding:4px 0;color:#64748b;">Data:</td><td style="padding:4px 0;">${date || ''}</td></tr>
          ${olistId ? `<tr><td style="padding:4px 0;color:#64748b;">Olist ID:</td><td style="padding:4px 0;color:#22c55e;font-weight:700;">${olistId}</td></tr>` : ''}
          ${obs ? `<tr><td style="padding:4px 0;color:#64748b;">Obs:</td><td style="padding:4px 0;">${obs}</td></tr>` : ''}
        </table>
        <table style="width:100%;border-collapse:collapse;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f1f5f9;">
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">#</th>
            <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:#64748b;">Produto</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:#64748b;">Qtd</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Unit.</th>
            <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:#64748b;">Subtotal</th>
          </tr></thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot><tr style="background:#f1f5f9;">
            <td colspan="4" style="padding:10px 12px;text-align:right;font-weight:700;">TOTAL</td>
            <td style="padding:10px 12px;text-align:right;font-weight:800;color:#22c55e;font-size:16px;">R$ ${(total || 0).toFixed(2).replace('.', ',')}</td>
          </tr></tfoot>
        </table>
        ${nfe ? `
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 12px;font-size:14px;color:#166534;">📄 Nota Fiscal Eletrônica — NF ${nfe.numero || ''}</h3>
          <table style="width:100%;font-size:13px;color:#334155;">
            <tr><td style="padding:4px 0;color:#64748b;width:40%;">Número:</td><td style="padding:4px 0;font-weight:700;">${nfe.numero || '-'}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Série:</td><td style="padding:4px 0;">${nfe.serie || '1'}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Protocolo:</td><td style="padding:4px 0;font-family:monospace;font-size:12px;">${nfe.protocolo || '-'}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Valor:</td><td style="padding:4px 0;font-weight:800;color:#22c55e;">R$ ${(nfe.valor || 0).toFixed(2).replace('.', ',')}</td></tr>
          </table>
          ${nfe.chaveAcesso ? `
          <div style="margin-top:12px;padding:10px;background:#fff;border-radius:6px;border:1px solid #d1fae5;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;">Chave de Acesso</p>
            <p style="margin:0;font-size:12px;font-weight:700;font-family:monospace;color:#1e293b;word-break:break-all;">${nfe.chaveAcesso.replace(/(.{4})/g, '$1 ').trim()}</p>
          </div>` : ''}
          <p style="margin:12px 0 0;font-size:11px;color:#64748b;">Consulte em: <a href="https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=" style="color:#3b82f6;">www.nfe.fazenda.gov.br</a></p>
        </div>` : ''}
        ${pagamento ? `
        <div style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:16px 0;">
          <h3 style="margin:0 0 12px;font-size:14px;color:#1e293b;">Dados de Pagamento</h3>
          <table style="width:100%;font-size:13px;color:#334155;">
            <tr><td style="padding:4px 0;color:#64748b;width:40%;">Forma:</td><td style="padding:4px 0;font-weight:600;text-transform:uppercase;">${pagamento.forma || 'boleto'}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Vencimento:</td><td style="padding:4px 0;font-weight:700;color:#dc2626;">${pagamento.vencimento || ''}</td></tr>
            <tr><td style="padding:4px 0;color:#64748b;">Valor:</td><td style="padding:4px 0;font-weight:800;color:#22c55e;">R$ ${(pagamento.valor || 0).toFixed(2).replace('.', ',')}</td></tr>
            ${pagamento.banco ? `<tr><td style="padding:4px 0;color:#64748b;">Banco:</td><td style="padding:4px 0;">${pagamento.banco} — Ag ${pagamento.agencia || ''} Cc ${pagamento.contaNum || ''}</td></tr>` : ''}
          </table>
          ${pagamento.forma === 'boleto' && pagamento.linhaDigitavel ? `
          <div style="margin-top:12px;padding:10px;background:#f1f5f9;border-radius:6px;border:1px dashed #94a3b8;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;">Linha Digitavel do Boleto</p>
            <p style="margin:0;font-size:14px;font-weight:700;font-family:monospace;color:#1e293b;word-break:break-all;">${pagamento.linhaDigitavel}</p>
          </div>` : ''}
          ${pagamento.forma === 'pix' && pagamento.pixCopiaECola ? `
          <div style="margin-top:12px;padding:10px;background:#f1f5f9;border-radius:6px;border:1px dashed #94a3b8;">
            <p style="margin:0 0 4px;font-size:11px;color:#64748b;text-transform:uppercase;">PIX Copia e Cola</p>
            <p style="margin:0;font-size:12px;font-family:monospace;color:#1e293b;word-break:break-all;">${pagamento.pixCopiaECola}</p>
          </div>` : ''}
        </div>` : ''}
        <p style="font-size:12px;color:#94a3b8;margin-top:20px;text-align:center;">Este email foi gerado automaticamente pelo sistema GDP.</p>
      </div>
    </div>
  `;

  const emailProvider = process.env.EMAIL_PROVIDER || 'log';

  if (emailProvider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY nao configurado" });

    // Build attachments
    const attachments = [];
    if (nfe?.danfePdf) {
      attachments.push({
        filename: `DANFE_${nfe.numero || 'sem-numero'}.pdf`,
        content: nfe.danfePdf
      });
    }
    if (nfe?.xml) {
      attachments.push({
        filename: `NFe_${nfe.numero || 'sem-numero'}.xml`,
        content: Buffer.from(nfe.xml, 'utf-8').toString('base64')
      });
    }
    if (!nfe?.danfePdf && nfe?.danfeHtml) {
      attachments.push({
        filename: `DANFE_${nfe.numero || 'sem-numero'}.html`,
        content: Buffer.from(nfe.danfeHtml, 'utf-8').toString('base64')
      });
    }

    const fromAddr = process.env.EMAIL_FROM || 'GDP Pedidos <onboarding@resend.dev>';
    const subject = `${nfe ? 'NF-e ' + (nfe.numero || '') + ' — ' : ''}${pagamento ? 'Cobranca' : 'Pedido'} ${protocol} — ${schoolName}`;

    const emailPayload = {
      from: fromAddr,
      to: [to],
      subject,
      html: html
    };
    if (attachments.length > 0) emailPayload.attachments = attachments;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(emailPayload)
    });
    const result = await resp.json();

    // Se falhou por dominio nao verificado (403), tentar com from generico do Resend
    if (!resp.ok && result.statusCode === 403 && result.name === 'validation_error') {
      console.log(`[Email] Dominio nao verificado para ${to}, tentando com onboarding@resend.dev`);
      const retryPayload = { ...emailPayload, from: 'GDP Pedidos <onboarding@resend.dev>' };
      const resp2 = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(retryPayload)
      });
      const result2 = await resp2.json();
      if (!resp2.ok) return res.status(500).json({ error: `Resend retry: ${JSON.stringify(result2)}` });
      return res.status(200).json({ success: true, provider: 'resend', id: result2.id, fallback: true });
    }

    if (!resp.ok) return res.status(500).json({ error: `Resend: ${JSON.stringify(result)}` });
    return res.status(200).json({ success: true, provider: 'resend', id: result.id });
  }

  console.log(`[Email] Would send to ${to}: Pedido ${protocol} — ${schoolName} — R$ ${(total||0).toFixed(2)}`);
  return res.status(200).json({ success: true, provider: 'log', message: 'Email registrado (modo log). Configure EMAIL_PROVIDER=resend para envio real.' });
}
