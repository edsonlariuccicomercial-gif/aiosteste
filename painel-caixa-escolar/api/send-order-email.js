import { jsPDF } from 'jspdf';

// Story 4.77: DANFE completa vetorial — layout fiel ao Visualizar DANFE
function generateDanfePdf(nfe, body) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 7, IW = W - 2 * M; // page width, margin, inner width
  let y = M;
  const f2 = (v) => Number(v || 0).toFixed(2).replace('.', ',');
  const f4 = (v) => Number(v || 0).toFixed(4).replace('.', ',');
  const brl = (v) => 'R$ ' + f2(v);
  const safe = (v, max) => String(v || '').substring(0, max || 999);
  const emit = nfe.emitente || {};
  const dest = nfe.destinatario || {};
  const emEnd = emit.endereco || {};
  const dEnd = dest.endereco || {};
  const numNf = String(nfe.numero || '0').padStart(6, '0');
  const numFmt = numNf.replace(/^(\d{3})(\d{3})$/, '$1.$2');
  const chave = (nfe.chaveAcesso || '').replace(/(.{4})/g, '$1 ').trim();
  const prot = nfe.protocolo || '';
  const serie = String(nfe.serie || '1').padStart(3, '0');
  const itens = nfe.itensNf || body.items || [];
  const totalProd = itens.reduce((s, i) => s + (Number(i.qtd || i.qty || 0) * Number(i.vUnit || i.unitPrice || 0)), 0);
  const totalNota = Number(nfe.valor || body.total || totalProd);
  const destNome = dest.nome || dest.razaoSocial || body.schoolName || '-';
  const emEndLine1 = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(', ');
  const emEndLine2 = [emEnd.bairro, emEnd.complemento].filter(Boolean).join(', ');
  const emEndLine3 = [emEnd.cidade, emEnd.uf].filter(Boolean).join(' - ') + (emEnd.cep ? ' - ' + emEnd.cep : '');
  const destEndStr = [dEnd.logradouro, dEnd.numero, dEnd.bairro].filter(Boolean).join(', ');
  const destCidade = dEnd.cidade || dEnd.municipio || '';

  // Helper: labeled cell
  function cell(x, yy, w, h, label, value, opts) {
    const o = opts || {};
    doc.setDrawColor(0); doc.rect(x, yy, w, h);
    doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
    doc.text(label, x + 1.5, yy + 3);
    doc.setFontSize(o.fontSize || 8); doc.setFont('helvetica', o.bold !== false ? 'bold' : 'normal');
    doc.text(safe(value, 80), x + 1.5, yy + h - 2, { maxWidth: w - 3 });
  }

  // Helper: section title bar
  function sectionTitle(yy, text) {
    doc.setFillColor(230, 230, 230); doc.rect(M, yy, IW, 5, 'F');
    doc.setDrawColor(0); doc.rect(M, yy, IW, 5);
    doc.setFontSize(6); doc.setFont('helvetica', 'bold');
    doc.text(text, M + 2, yy + 3.5);
    return yy + 5;
  }

  // ===== RECIBO =====
  doc.setDrawColor(0); doc.rect(M, y, IW - 35, 14);
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text('RECEBEMOS DE ' + safe(emit.razaoSocial || emit.nome, 60) + ' OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO', M + 1.5, y + 4, { maxWidth: IW - 40 });
  doc.setFontSize(5); doc.text('DATA DE RECEBIMENTO', M + 1.5, y + 9);
  doc.line(M + 40, y + 7, M + 40, y + 14);
  doc.text('IDENTIFICACAO E ASSINATURA DO RECEBEDOR', M + 42, y + 9);
  // NF-e box right
  const rxBox = M + IW - 34;
  doc.rect(rxBox, y, 34, 14);
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('NF-e', rxBox + 17, y + 5, { align: 'center' });
  doc.setFontSize(9);
  doc.text('N. ' + numFmt, rxBox + 17, y + 9, { align: 'center' });
  doc.setFontSize(6); doc.setFont('helvetica', 'normal');
  doc.text('Serie ' + serie, rxBox + 17, y + 12.5, { align: 'center' });
  y += 16;

  // ===== HEADER: EMITENTE | DANFE | CHAVE =====
  const hdrH = 28;
  const emitW = 75, danfeW = 30, chaveW = IW - emitW - danfeW;
  // Emitente
  doc.rect(M, y, emitW, hdrH);
  doc.setFontSize(9); doc.setFont('helvetica', 'bold');
  doc.text(safe(emit.razaoSocial || emit.nome, 45), M + 6, y + 6);
  doc.setFontSize(6.5); doc.setFont('helvetica', 'normal');
  doc.text(safe(emEndLine1, 50), M + 6, y + 10);
  doc.text(safe(emEndLine2, 50), M + 6, y + 13.5);
  doc.text(safe(emEndLine3, 50), M + 6, y + 17);
  if (emEnd.telefone || emit.telefone) doc.text('Fone: ' + safe(emEnd.telefone || emit.telefone, 20), M + 6, y + 20.5);
  if (emit.email) doc.text(safe(emit.email, 40), M + 6, y + 24);

  // DANFE central
  const dx = M + emitW;
  doc.rect(dx, y, danfeW, hdrH);
  doc.setFontSize(14); doc.setFont('helvetica', 'bold');
  doc.text('DANFE', dx + danfeW / 2, y + 7, { align: 'center' });
  doc.setFontSize(5); doc.setFont('helvetica', 'normal');
  doc.text('Documento Auxiliar da', dx + danfeW / 2, y + 10.5, { align: 'center' });
  doc.text('Nota Fiscal Eletronica', dx + danfeW / 2, y + 13, { align: 'center' });
  doc.setFontSize(5.5);
  doc.text('0-ENTRADA  1-SAIDA', dx + danfeW / 2, y + 16.5, { align: 'center' });
  doc.setFontSize(10); doc.setFont('helvetica', 'bold');
  doc.text('1', dx + danfeW / 2, y + 20, { align: 'center' });
  doc.setFontSize(8);
  doc.text('N. ' + numFmt, dx + danfeW / 2, y + 24, { align: 'center' });
  doc.setFontSize(6); doc.setFont('helvetica', 'normal');
  doc.text('Serie ' + serie + '  Folha 1/1', dx + danfeW / 2, y + 27, { align: 'center' });

  // Chave de acesso
  const cx = dx + danfeW;
  doc.rect(cx, y, chaveW, hdrH);
  doc.setFontSize(5); doc.setFont('helvetica', 'bold');
  doc.text('CHAVE DE ACESSO', cx + chaveW / 2, y + 4, { align: 'center' });
  doc.setFontSize(6.5); doc.setFont('helvetica', 'bold');
  doc.text(chave || '-', cx + 2, y + 9, { maxWidth: chaveW - 4 });
  doc.setFontSize(5); doc.setFont('helvetica', 'normal');
  doc.text('Consulta de autenticidade no portal nacional da NF-e', cx + chaveW / 2, y + 19, { align: 'center' });
  doc.text('www.nfe.fazenda.gov.br/portal', cx + chaveW / 2, y + 22, { align: 'center' });
  doc.text('ou no site da Sefaz Autorizadora', cx + chaveW / 2, y + 25, { align: 'center' });
  y += hdrH;

  // ===== NATUREZA + PROTOCOLO =====
  const halfIW = IW / 2;
  cell(M, y, halfIW, 9, 'NATUREZA DA OPERACAO', 'VENDA DE MERCADORIA', { fontSize: 9 });
  cell(M + halfIW, y, halfIW, 9, 'PROTOCOLO DE AUTORIZACAO DE USO', prot || '-');
  y += 9;

  // ===== IE + CNPJ EMITENTE =====
  const q = IW / 4;
  cell(M, y, q, 8, 'INSCRICAO ESTADUAL', emit.ie || '');
  cell(M + q, y, q, 8, 'INSCRICAO MUNICIPAL', '');
  cell(M + 2 * q, y, q, 8, 'INSC. EST. SUBST. TRIB.', '');
  cell(M + 3 * q, y, q, 8, 'CNPJ', emit.cnpj || '');
  y += 8;

  // ===== DESTINATARIO =====
  y = sectionTitle(y, 'DESTINATARIO / REMETENTE');
  const t = IW * 0.55;
  cell(M, y, t, 8, 'NOME / RAZAO SOCIAL', destNome, { fontSize: 8 });
  cell(M + t, y, IW * 0.25, 8, 'CNPJ/CPF', dest.cnpj || body.cnpj || '');
  cell(M + t + IW * 0.25, y, IW * 0.2, 8, 'DATA EMISSAO', body.date || '');
  y += 8;
  cell(M, y, t, 8, 'ENDERECO', destEndStr);
  cell(M + t, y, IW * 0.2, 8, 'BAIRRO', dEnd.bairro || '');
  cell(M + t + IW * 0.2, y, IW * 0.13, 8, 'CEP', dEnd.cep || '');
  cell(M + t + IW * 0.33, y, IW - t - IW * 0.33, 8, 'DATA SAIDA', body.date || '');
  y += 8;
  cell(M, y, t * 0.7, 8, 'MUNICIPIO', destCidade);
  cell(M + t * 0.7, y, 12, 8, 'UF', dEnd.uf || '');
  cell(M + t * 0.7 + 12, y, IW * 0.25, 8, 'FONE', dest.telefone || '');
  cell(M + t * 0.7 + 12 + IW * 0.25, y, IW - t * 0.7 - 12 - IW * 0.25, 8, 'INSC. ESTADUAL', dest.ie || '');
  y += 8;

  // ===== CALCULO DO IMPOSTO =====
  y = sectionTitle(y, 'CALCULO DO IMPOSTO');
  const nCols = 6;
  const cw = IW / nCols;
  const taxLabels1 = ['BASE CALC. ICMS', 'VALOR ICMS', 'BASE ICMS S.T.', 'VALOR ICMS SUBST.', 'V. TOTAL PRODUTOS', 'V. TOTAL DA NOTA'];
  const taxVals1 = ['0,00', '0,00', '0,00', '0,00', f2(totalProd), f2(totalNota)];
  for (let i = 0; i < nCols; i++) { cell(M + i * cw, y, cw, 8, taxLabels1[i], taxVals1[i], { fontSize: i >= 4 ? 9 : 7 }); }
  y += 8;
  const taxLabels2 = ['FRETE', 'SEGURO', 'DESCONTO', 'OUTRAS DESP.', 'VALOR IPI', 'V. APROX. TRIB.'];
  for (let i = 0; i < nCols; i++) { cell(M + i * cw, y, cw, 8, taxLabels2[i], '0,00', { fontSize: 7 }); }
  y += 8;

  // ===== TRANSPORTADOR =====
  y = sectionTitle(y, 'TRANSPORTADOR / VOLUMES TRANSPORTADOS');
  cell(M, y, IW * 0.5, 8, 'NOME / RAZAO SOCIAL', '');
  cell(M + IW * 0.5, y, IW * 0.25, 8, 'FRETE', '9-Sem Transporte');
  cell(M + IW * 0.75, y, IW * 0.25, 8, 'CNPJ / CPF', '');
  y += 8;

  // ===== PRODUTOS =====
  y = sectionTitle(y, 'DADOS DOS PRODUTOS / SERVICOS');
  // Table header
  const prodCols = [
    { label: 'CODIGO', w: 16 },
    { label: 'DESCRICAO DO PRODUTO / SERVICO', w: 56 },
    { label: 'NCM', w: 16 },
    { label: 'CST', w: 10 },
    { label: 'CFOP', w: 12 },
    { label: 'UN', w: 10 },
    { label: 'QUANT.', w: 16 },
    { label: 'VLR.UNIT.', w: 18 },
    { label: 'VLR.TOTAL', w: 18 },
    { label: 'BC ICMS', w: 12 },
    { label: 'VLR.ICMS', w: 12 }
  ];
  // Adjust last column to fill remaining width
  const usedW = prodCols.reduce((s, c) => s + c.w, 0);
  if (usedW < IW) prodCols[prodCols.length - 1].w += (IW - usedW);

  doc.setFillColor(230, 230, 230);
  doc.rect(M, y, IW, 5, 'F'); doc.rect(M, y, IW, 5);
  doc.setFontSize(5); doc.setFont('helvetica', 'bold');
  let px = M;
  prodCols.forEach(c => {
    doc.text(c.label, px + 1, y + 3.5);
    doc.line(px, y, px, y + 5);
    px += c.w;
  });
  y += 5;

  // Table rows
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  itens.forEach((item, idx) => {
    if (y > 265) { doc.addPage(); y = M; }
    const desc = item.desc || item.description || item.name || '';
    const vTotal = Number(item.qtd || item.qty || 0) * Number(item.vUnit || item.unitPrice || 0);
    const rowH = 5;
    const vals = [
      String(idx + 1).padStart(3, '0'),
      safe(desc, 40),
      item.ncm || '',
      item.cst || '',
      item.cfop || '',
      item.un || item.unit || 'UN',
      f2(item.qtd || item.qty),
      f2(item.vUnit || item.unitPrice),
      f2(vTotal),
      '0,00',
      '0,00'
    ];
    px = M;
    prodCols.forEach((c, ci) => {
      doc.line(px, y, px, y + rowH);
      const align = ci >= 6 ? 'right' : 'left';
      const tx = align === 'right' ? px + c.w - 1.5 : px + 1;
      doc.text(vals[ci], tx, y + 3.5, { align, maxWidth: c.w - 2 });
      px += c.w;
    });
    doc.line(M, y + rowH, M + IW, y + rowH);
    y += rowH;
  });

  // ===== DADOS ADICIONAIS (idêntico ao Visualizar DANFE) =====
  y = sectionTitle(y, 'DADOS ADICIONAIS');
  const infLines = [];
  if (nfe.pedidoId) infLines.push('Inf. Contribuinte: Pedido GDP ' + nfe.pedidoId);
  const destEmailAddr = dest.email || '';
  if (destEmailAddr) infLines.push('Email do Destinatario: ' + destEmailAddr);
  if (nfe.observacoes) infLines.push(...String(nfe.observacoes).replace(/\|/g, '\n').split('\n').filter(Boolean));
  infLines.push('Valor Aproximado dos Tributos : R$ 0,00');
  const addH = Math.max(22, 8 + infLines.length * 3);
  doc.rect(M, y, IW * 0.65, addH);
  doc.setFontSize(5); doc.setFont('helvetica', 'normal');
  doc.text('INFORMACOES COMPLEMENTARES', M + 1.5, y + 3);
  doc.setFontSize(5.5);
  infLines.forEach((ln, i) => doc.text(safe(ln, 90), M + 1.5, y + 7 + i * 3, { maxWidth: IW * 0.6 }));
  doc.rect(M + IW * 0.65, y, IW * 0.35, addH);
  doc.text('RESERVADO AO FISCO', M + IW * 0.65 + 1.5, y + 3);
  y += addH;

  // ===== FOOTER =====
  y += 2;
  doc.setFontSize(5.5); doc.setFont('helvetica', 'normal');
  doc.text('Consulte em: www.nfe.fazenda.gov.br/portal', M, y + 2);
  doc.text('Documento gerado pelo sistema GDP - Lariucci & Ribeiro Pereira', M, y + 5);

  return Buffer.from(doc.output('arraybuffer')).toString('base64');
}

function corsHeaders(req, res) {
  const origin = req.headers?.origin || '';
  res.setHeader("Access-Control-Allow-Origin", origin || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(req, res);

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
        <!-- Story 4.75: DANFE HTML inline removido — vai apenas como PDF em anexo -->
        <p style="font-size:12px;color:#94a3b8;margin-top:20px;text-align:center;">Este email foi gerado automaticamente pelo sistema GDP.</p>
      </div>
    </div>
  `;

  const emailProvider = process.env.EMAIL_PROVIDER || 'gmail';

  if (emailProvider === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "RESEND_API_KEY nao configurado" });

    // Story 4.77: DANFE PDF sempre gerado server-side (jsPDF vetorial)
    const attachments = [];
    if (nfe) {
      try {
        const pdfBase64 = generateDanfePdf(nfe, body);
        if (pdfBase64 && pdfBase64.length > 1000) {
          attachments.push({
            filename: `DANFE_NF_${nfe.numero || 'sem-numero'}.pdf`,
            content: pdfBase64
          });
          console.log('[Email] DANFE PDF server-side (jsPDF vetorial):', Math.round(pdfBase64.length * 0.75 / 1024), 'KB');
        }
      } catch (pdfErr) {
        console.error('[Email] jsPDF falhou:', pdfErr.message);
      }
    }
    if (nfe?.xml) {
      attachments.push({
        filename: `NFe_${nfe.numero || 'sem-numero'}.xml`,
        content: Buffer.from(nfe.xml, 'utf-8').toString('base64')
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

  if (emailProvider === 'gmail') {
    const nodemailer = await import('nodemailer');
    const gmailUser = process.env.GMAIL_USER || 'edsonlariucci.comercial@gmail.com';
    const gmailPass = process.env.GMAIL_APP_PASSWORD || 'yktuyprgvfkiptgr';
    if (!gmailUser || !gmailPass) return res.status(500).json({ error: "GMAIL_USER ou GMAIL_APP_PASSWORD nao configurado" });

    const attachments = [];
    if (nfe) {
      try {
        const pdfBase64 = generateDanfePdf(nfe, body);
        if (pdfBase64 && pdfBase64.length > 1000) {
          attachments.push({ filename: `DANFE_NF_${nfe.numero || 'sem-numero'}.pdf`, content: Buffer.from(pdfBase64, 'base64') });
        }
      } catch (pdfErr) { console.error('[Email/Gmail] jsPDF falhou:', pdfErr.message); }
    }
    if (nfe?.xml) {
      attachments.push({ filename: `NFe_${nfe.numero || 'sem-numero'}.xml`, content: Buffer.from(nfe.xml, 'utf-8') });
    }

    const subject = `${nfe ? 'NF-e ' + (nfe.numero || '') + ' — ' : ''}${pagamento ? 'Cobranca' : 'Pedido'} ${protocol} — ${schoolName}`;

    const transporter = nodemailer.default.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass }
    });

    try {
      const info = await transporter.sendMail({
        from: `Distribuidora Lariucci <${gmailUser}>`,
        to: to,
        subject: subject,
        html: html,
        attachments: attachments.length > 0 ? attachments : undefined
      });
      return res.status(200).json({ success: true, provider: 'gmail', id: info.messageId });
    } catch (gmailErr) {
      console.error('[Email/Gmail] Falha:', gmailErr.message);
      return res.status(500).json({ error: `Gmail: ${gmailErr.message}` });
    }
  }

  console.log(`[Email] Would send to ${to}: Pedido ${protocol} — ${schoolName} — R$ ${(total||0).toFixed(2)}`);
  return res.status(200).json({ success: true, provider: 'log', message: 'Email registrado (modo log). Configure EMAIL_PROVIDER=gmail para envio real.' });
}
