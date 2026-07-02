// danfe-render.js — GERADOR ÚNICO de DANFE (padronização 2026-07-02)
// ============================================================================
// UMA fonte de verdade para a DANFE usada nos 3 lugares: Sistema (Visualizar),
// E-mail (payload) e Portal escolar. Base = gerarDanfeHtmlParaPdf (a mais completa:
// 15 colunas, logo, barcode Code128, marca 'CANCELADA'). MÓDULO AUTOCONTIDO:
// traz seus PRÓPRIOS helpers (esc/data) porque o PORTAL (gdp-portal.html) também o
// consome e NÃO tem as funções do dashboard.
//
// Exports (window):
//   renderDanfeHTML(nf, empresa, opts) -> string(HTML completo)
//   resolveEmitente(nf) -> objeto emitente COMPLETO (mata a causa raiz do remetente vazio)
//   _danfeEsc(s) (exposto p/ teste)
//
// opts: { includeBarcode:bool, autoPrint:bool, logoBase64:string }
// ============================================================================
(function () {
  'use strict';

  // ── Helpers próprios (não dependem do dashboard) ──────────────────────────
  function _esc(s) {
    return String(s == null ? '' : (typeof s === 'object' ? JSON.stringify(s) : s))
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function _fmtDataHora(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      if (isNaN(d.getTime())) return String(iso);
      var dd = String(d.getDate()).padStart(2, '0');
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var yy = d.getFullYear();
      var hh = String(d.getHours()).padStart(2, '0');
      var mi = String(d.getMinutes()).padStart(2, '0');
      return dd + '/' + mm + '/' + yy + ' ' + hh + ':' + mi;
    } catch (_) { return String(iso); }
  }

  // ── resolveEmitente (T2) — precedência DETERMINÍSTICA ─────────────────────
  // 1) nf.sefaz.preview.emitente SE COMPLETO (razão + cnpj + ie) — o dado da emissão.
  // 2) nexedu.empresa (localStorage) — FALLBACK PERMANENTE (semeado com IE no boot, T3).
  // 3) objeto com labels vazios — nunca quebra o layout.
  // Isso resolve o "remetente vazio" no Sistema/Portal e nas notas da AUTOCURA (sem preview).
  function resolveEmitente(nf) {
    nf = nf || {};
    var prev = (nf.sefaz && nf.sefaz.preview && nf.sefaz.preview.emitente) || null;
    var previewCompleto = !!(prev && prev.razaoSocial && prev.cnpj && prev.ie);
    if (previewCompleto) {
      return _normalizarEmitente(prev);
    }
    // Fallback permanente: nexedu.empresa
    try {
      if (typeof localStorage !== 'undefined') {
        var emp = JSON.parse(localStorage.getItem('nexedu.empresa') || '{}');
        if (emp && (emp.razaoSocial || emp.nome)) {
          // Se havia preview PARCIAL, ele tem precedência campo-a-campo sobre o fallback.
          return _normalizarEmitente({
            razaoSocial: (prev && prev.razaoSocial) || emp.razaoSocial || emp.nome || '',
            cnpj: (prev && prev.cnpj) || emp.cnpj || '',
            ie: (prev && prev.ie) || emp.ie || '',
            im: (prev && prev.im) || emp.im || emp.inscricaoMunicipal || '',
            telefone: (prev && prev.telefone) || emp.telefone || emp.fone || '',
            email: (prev && prev.email) || emp.email || '',
            endereco: _mergeEnd((prev && prev.endereco) || {}, emp)
          });
        }
      }
    } catch (_) {}
    // Último caso: usa o que houver no preview parcial, senão vazio.
    return _normalizarEmitente(prev || {});
  }

  function _mergeEnd(prevEnd, emp) {
    prevEnd = prevEnd || {}; emp = emp || {};
    return {
      logradouro: prevEnd.logradouro || emp.logradouro || emp.endereco || '',
      numero: prevEnd.numero || emp.numero || '',
      bairro: prevEnd.bairro || emp.bairro || '',
      complemento: prevEnd.complemento || emp.complemento || '',
      cidade: prevEnd.cidade || prevEnd.municipio || emp.cidade || emp.municipio || '',
      uf: prevEnd.uf || emp.uf || '',
      cep: prevEnd.cep || emp.cep || '',
      telefone: prevEnd.telefone || emp.telefone || emp.fone || ''
    };
  }

  function _normalizarEmitente(e) {
    e = e || {};
    var end = e.endereco || {};
    return {
      razaoSocial: e.razaoSocial || e.nome || '',
      cnpj: e.cnpj || '',
      ie: e.ie || '',
      im: e.im || e.inscricaoMunicipal || '',
      telefone: e.telefone || end.telefone || '',
      email: e.email || '',
      endereco: {
        logradouro: end.logradouro || '',
        numero: end.numero || '',
        bairro: end.bairro || '',
        complemento: end.complemento || '',
        cidade: end.cidade || end.municipio || '',
        uf: end.uf || '',
        cep: end.cep || '',
        telefone: end.telefone || e.telefone || ''
      }
    };
  }

  // ── Barcode Code128 (canvas) — script injetado quando includeBarcode ──────
  function _barcodeScript(chave, autoPrint) {
    if (!chave || chave.length < 10) return autoPrint ? '<script>window.print()</script>' : '';
    return '<script>(function(){var chave="' + chave + '";var canvas=document.createElement("canvas");canvas.height=40;canvas.width=Math.max(chave.length*11,400);var ctx=canvas.getContext("2d");var START_B=104,STOP=106;var P=["11011001100","11001101100","11001100110","10010011000","10010001100","10001001100","10011001000","10011000100","10001100100","11001001000","11001000100","11000100100","10110011100","10011011100","10011001110","10111001100","10011101100","10011100110","11001110010","11001011100","11001001110","11011100100","11001110100","11100101100","11100100110","11101100100","11100110100","11100110010","11011011000","11011000110","11000110110","10100011000","10001011000","10001000110","10110001000","10001101000","10001100010","11010001000","11000101000","11000100010","10110111000","10110001110","10001101110","10111011000","10111000110","10001110110","11101110110","11010001110","11000101110","11011101000","11011100010","11011101110","11101011000","11101000110","11100010110","11101101000","11101100010","11100011010","11101111010","11001000010","11110001010","10100110000","10100001100","10010110000","10010000110","10000101100","10000100110","10110010000","10110000100","10011010000","10011000010","10000110100","10000110010","11000010010","11001010000","11110111010","11000010100","10001111010","10100111100","10010111100","10010011110","10111100100","10011110100","10011110010","11110100100","11110010100","11110010010","11011110110","11110110110","21121141211"];var e=[];e.push(P[START_B]);var cs=START_B;for(var i=0;i<chave.length;i++){var v=chave.charCodeAt(i)-32;e.push(P[v]);cs+=v*(i+1)}e.push(P[cs%103]);e.push(P[STOP]);var b=e.join("");var bw=Math.max(1,Math.floor(canvas.width/b.length));canvas.width=b.length*bw+20;ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#000";for(var j=0;j<b.length;j++){if(b[j]==="1")ctx.fillRect(10+j*bw,2,bw,canvas.height-4)}var t=document.getElementById("danfe-barcode");if(t)t.appendChild(canvas);' + (autoPrint ? 'window.print();' : '') + '})()</script>';
  }

  // ── renderDanfeHTML (T1) — gerador único ──────────────────────────────────
  function renderDanfeHTML(nf, empresa, options) {
    if (!nf) return '';
    var opts = options || {};
    var esc = _esc;
    // Emitente: usa o empresa passado (resolvido) ou resolve internamente (defesa).
    var emit = _normalizarEmitente(empresa || resolveEmitente(nf));
    var emEnd = emit.endereco || {};
    var prev = (nf.sefaz && nf.sefaz.preview) || {};
    var dest = prev.destinatario || nf.cliente || {};
    var dEnd = dest.endereco || {};
    var chave = (nf.sefaz && nf.sefaz.chaveAcesso) || nf.chaveAcesso || '';
    var chaveFormatada = chave.replace(/(.{4})/g, '$1 ').trim();
    var prot = (nf.sefaz && nf.sefaz.protocolo) || nf.protocolo || '';
    var protDt = (nf.sefaz && nf.sefaz.transmissao && nf.sefaz.transmissao.parsed && nf.sefaz.transmissao.parsed.dhRecbto)
      || (nf.audit && nf.audit.authorizedAt) || '';
    var protFormatado = prot ? prot + (protDt ? '  -  ' + _fmtDataHora(protDt) : '') : '-';
    var cancelStamp = (nf.cancelamento && nf.cancelamento.retornoEvento && nf.cancelamento.retornoEvento.dhRegEvento)
      || (nf.cancelamento && nf.cancelamento.atualizadoEm) || '';
    var isCancelada = nf.status === 'cancelada';
    var totalProd = (nf.itens || []).reduce(function (s, i) { return s + (Number(i.qtd || 0) * Number(i.precoUnitario || 0)); }, 0);
    var totalNota = nf.valor || totalProd;
    var dtEmissao = _fmtDataHora(nf.emitidaEm);
    var dtParts = dtEmissao.split(' ');
    var f2 = function (v) { return Number(v || 0).toFixed(2).replace('.', ','); };
    var f4 = function (v) { return Number(v || 0).toFixed(4).replace('.', ','); };
    // Número: padStart(6) uniforme nos 3 lugares (resolve 001.625 vs 000.001.625).
    var numNf = String(nf.numero || '0').padStart(6, '0');
    var numFmt = numNf.replace(/^(\d{3})(\d{3})$/, '$1.$2');
    var destNome = dest.nome || dest.razaoSocial || (nf.cliente && nf.cliente.nome) || '-';
    var destEndStr = [dEnd.logradouro, dEnd.numero].filter(Boolean).join(', ');
    var destCidade = dEnd.cidade || dEnd.municipio || '';
    var destEmail = dest.email || (nf.cliente && nf.cliente.email) || '';
    // Logo: opts.logoBase64 tem precedência; senão lê a config local (fallback).
    var logoImg = opts.logoBase64 || '';
    if (!logoImg) {
      try {
        if (typeof localStorage !== 'undefined') {
          var cfg = JSON.parse(localStorage.getItem('nexedu.config.notas-fiscais') || '{}');
          if (cfg.logomarcaBase64) logoImg = cfg.logomarcaBase64;
        }
      } catch (_) {}
    }
    var emEndLine1 = [emEnd.logradouro, emEnd.numero].filter(Boolean).join(', ');
    var emEndLine2 = [emEnd.bairro, emEnd.complemento].filter(Boolean).join(', ');
    var emEndLine3 = [emEnd.cidade, emEnd.uf].filter(Boolean).join(' - ') + (emEnd.cep ? ' - ' + emEnd.cep : '');
    var reciboTxt = 'RECEBEMOS DE ' + (emit.razaoSocial || '-') + ' OS PRODUTOS CONSTANTES DA NOTA FISCAL INDICADA AO LADO';
    var infCplParts = [];
    if (nf.pedidoId) infCplParts.push('Inf. Contribuinte: Pedido GDP ' + nf.pedidoId);
    if (destEmail) infCplParts.push('Email do Destinatário: ' + destEmail);
    if (nf.documentos && nf.documentos.observacao) infCplParts.push(String(nf.documentos.observacao).replace(/\|/g, '\n'));
    infCplParts.push('Valor Aproximado dos Tributos : R$ 0,00');
    var infCplTxt = infCplParts.join('\n');
    var nowPrint = new Date();
    var impressoEm = 'Impresso em ' + nowPrint.toLocaleDateString('pt-BR') + ' as ' + nowPrint.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var rows = (nf.itens || []).map(function (item, idx) {
      var vt = Number(item.qtd || 0) * Number(item.precoUnitario || 0);
      return '<tr><td class="c">' + esc(item.sku || item.codigoBarras || String(idx + 1).padStart(3, '0')) + '</td><td class="desc">' + esc(item.descricao || '') + '</td><td class="c mono">' + esc(item.ncm || '') + '</td><td class="c">' + esc(item.cst || '0/102') + '</td><td class="c">' + esc(item.cfop || '5102') + '</td><td class="c">' + esc(item.unidade || 'UN') + '</td><td class="r">' + f4(item.qtd) + '</td><td class="r">' + f4(item.precoUnitario) + '</td><td class="r">' + f2(vt) + '</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td><td class="r">0,00</td></tr>';
    }).join('');
    var barcodeScript = (opts.includeBarcode) ? _barcodeScript(chave, !!opts.autoPrint) : (opts.autoPrint ? '<script>window.print()</script>' : '');

    return '<!doctype html><html><head><meta charset="utf-8"><title>DANFE NF ' + esc(nf.numero || '') + '</title>' +
'<style>' +
'*{margin:0;padding:0;box-sizing:border-box}' +
'body{font-family:Arial,Helvetica,sans-serif;font-size:7.5pt;color:#000;background:#fff;padding:6mm;max-width:210mm;margin:0 auto}' +
'.bx{border:1px solid #000}' +
'.row{display:flex;border-bottom:1px solid #000;page-break-inside:avoid}' +
'.row:last-child{border-bottom:none}' +
'.cell{border-right:1px solid #000;padding:3px 5px;flex:1;min-height:24px;overflow:hidden}' +
'.cell:last-child{border-right:none}' +
'.cell label{font-size:6pt;color:#000;text-transform:uppercase;display:block;line-height:1.3;margin-bottom:1px}' +
'.cell .v{font-size:9pt;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
'.cell .v-lg{font-size:10pt;font-weight:900}' +
'.cell .v-sm{font-size:8pt;font-weight:700;white-space:nowrap}' +
'.stit{font-weight:700;font-size:6.5pt;padding:2px 5px;text-transform:uppercase;border-bottom:1px solid #000;background:#eee}' +
'table.it{width:100%;border-collapse:collapse}' +
'table.it th{border:1px solid #000;padding:2px 4px;font-size:6pt;text-transform:uppercase;font-weight:700;background:#eee}' +
'table.it td{border:1px solid #999;padding:2px 4px;font-size:7.5pt;line-height:1.4}' +
'table.it td:first-child{border-left:1px solid #aaa}' +
'table.it td.desc{max-width:280px;white-space:normal;word-wrap:break-word;overflow-wrap:break-word}' +
'.c{text-align:center}.r{text-align:right}.mono{font-family:monospace;font-size:6pt}' +
'.cancel-stamp{position:absolute;top:40%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:64pt;color:rgba(220,38,38,.18);font-weight:900;pointer-events:none;z-index:10;letter-spacing:6px}' +
'.wrap{position:relative}' +
'.rec{border:1px solid #000;display:flex;margin-bottom:3px}' +
'.rec-body{flex:3;border-right:1px solid #000;display:flex;flex-direction:column}' +
'.rec-body .rec-txt{padding:2px 4px;font-size:6pt;line-height:1.3;flex:1}' +
'.rec-body .rec-flds{display:flex;border-top:1px solid #000}' +
'.rec-body .rec-flds .rf{flex:1;padding:1px 3px;border-right:1px solid #000}' +
'.rec-body .rec-flds .rf:last-child{border-right:none}' +
'.rec-body .rec-flds .rf label{font-size:5pt;text-transform:uppercase}' +
'.rec-nf{width:130px;text-align:center;padding:4px}' +
'.rec-nf .nfe{font-size:12pt;font-weight:900}' +
'.rec-nf .num{font-size:11pt;font-weight:900}' +
'.rec-nf .ser{font-size:7pt}' +
'.hdr{display:flex;border-bottom:1px solid #000}' +
'.hdr-logo{width:140px;display:flex;align-items:center;justify-content:center;padding:2px;min-height:85px}' +
'.hdr-emit{flex:3;padding:4px 6px 4px 14px;border-right:1px solid #000;display:flex;flex-direction:column;justify-content:center}' +
'.hdr-emit .nome{font-size:11pt;font-weight:700;white-space:nowrap}' +
'.hdr-emit .end{font-size:7pt;line-height:1.4;white-space:nowrap}' +
'.hdr-danfe{width:120px;text-align:center;padding:2px 4px;border-right:1px solid #000}' +
'.hdr-danfe h1{font-size:16pt;font-weight:900;letter-spacing:1px;margin:0}' +
'.hdr-danfe .sub{font-size:6pt;line-height:1.2}' +
'.hdr-danfe .tp-row{font-size:7pt;margin-top:2px}' +
'.hdr-danfe .tp-box{display:inline-block;border:1px solid #000;padding:0 6px;font-size:10pt;font-weight:900;margin:1px 0}' +
'.hdr-danfe .nf-num{font-size:10pt;font-weight:900;margin-top:2px}' +
'.hdr-danfe .nf-ser{font-size:7pt}' +
'.hdr-danfe .nf-fol{font-size:6pt;font-style:italic}' +
'.hdr-chave{flex:2;padding:2px 4px;overflow:hidden;text-align:center}' +
'.hdr-chave .bc{text-align:center;min-height:32px}' +
'.hdr-chave .lbl{font-size:5pt;text-align:center;text-transform:uppercase;margin-top:1px}' +
'.hdr-chave .val{font-size:6.5pt;font-weight:700;text-align:center;letter-spacing:.4px;word-break:break-all}' +
'.hdr-chave .cons{font-size:5.5pt;text-align:center;margin-top:2px}' +
'@media print{body{padding:0;margin:0}@page{size:A4;margin:6mm}}' +
'</style></head><body>' +
'<div class="rec"><div class="rec-body"><div class="rec-txt">' + esc(reciboTxt) + '</div><div class="rec-flds"><div class="rf"><label>DATA DE RECEBIMENTO</label><div style="min-height:12px"></div></div><div class="rf" style="flex:2"><label>IDENTIFICAÇÃO E ASSINATURA DO RECEBEDOR</label><div style="min-height:12px"></div></div></div></div><div class="rec-nf"><div class="nfe">NF-e</div><div class="num">N°. ' + esc(numFmt) + '</div><div class="ser">Série ' + String(nf.serie || '1').padStart(3, '0') + '</div></div></div>' +
'<div style="border-bottom:1px dashed #000;margin-bottom:3px"></div>' +
'<div class="wrap">' +
(isCancelada ? '<div class="cancel-stamp">CANCELADA</div>' : '') +
'<div class="bx">' +
'<div class="hdr"><div class="hdr-logo">' + (logoImg ? '<img src="' + logoImg + '" style="max-height:82px;max-width:136px;object-fit:contain" />' : '') + '</div><div class="hdr-emit"><div class="nome">' + esc(emit.razaoSocial || '-') + '</div><div class="end">' + esc(emEndLine1) + (emEnd.complemento ? ', ' + esc(emEnd.complemento) : '') + '</div><div class="end">' + esc(emEndLine2) + '</div><div class="end">' + esc(emEndLine3) + ' Fone ' + esc(emEnd.telefone || emit.telefone || '') + '</div><div class="end">' + esc(emit.email || '') + '</div></div><div class="hdr-danfe"><h1>DANFE</h1><div class="sub">Documento Auxiliar da Nota<br>Fiscal Eletrônica</div><div class="tp-row">0 - ENTRADA</div><div class="tp-row">1 - SAÍDA <div class="tp-box">1</div></div><div class="nf-num">N°. ' + esc(numFmt) + '</div><div class="nf-ser">Série ' + String(nf.serie || '1').padStart(3, '0') + '</div><div class="nf-fol">Folha 1/1</div></div><div class="hdr-chave"><div class="bc" id="danfe-barcode"></div><div class="lbl">CHAVE DE ACESSO</div><div class="val">' + esc(chaveFormatada || '-') + '</div><div class="cons">Consulta de autenticidade no portal nacional da NF-e<br><strong>www.nfe.fazenda.gov.br/portal</strong> ou no site da Sefaz Autorizadora</div></div></div>' +
'<div class="row"><div class="cell" style="flex:1"><label>NATUREZA DA OPERAÇÃO</label><div class="v-lg">VENDA DE MERCADORIA</div></div><div class="cell" style="flex:1"><label>PROTOCOLO DE AUTORIZAÇÃO DE USO</label><div class="v">' + esc(protFormatado) + '</div></div></div>' +
'<div class="row"><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">' + esc(emit.ie || '') + '</div></div><div class="cell"><label>INSCRIÇÃO MUNICIPAL</label><div class="v-sm">' + esc(emit.im || '') + '</div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL DO SUBST. TRIBUT.</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v">' + esc(emit.cnpj || '') + '</div></div></div>' +
'<div class="stit">DESTINATÁRIO / REMETENTE</div>' +
'<div class="row"><div class="cell" style="flex:3"><label>NOME / RAZÃO SOCIAL</label><div class="v">' + esc(destNome) + '</div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm">' + esc(dest.cnpj || '') + '</div></div><div class="cell"><label>DATA DA EMISSÃO</label><div class="v-sm">' + (dtParts[0] || '-') + '</div></div></div>' +
'<div class="row"><div class="cell" style="flex:3"><label>ENDEREÇO</label><div class="v">' + esc(destEndStr) + '</div></div><div class="cell"><label>BAIRRO / DISTRITO</label><div class="v-sm">' + esc(dEnd.bairro || '') + '</div></div><div class="cell"><label>CEP</label><div class="v-sm">' + esc(dEnd.cep || '') + '</div></div><div class="cell"><label>DATA DA SAÍDA/ENTRADA</label><div class="v-sm">' + (dtParts[0] || '-') + '</div></div></div>' +
'<div class="row"><div class="cell" style="flex:2"><label>MUNICÍPIO</label><div class="v">' + esc(destCidade) + '</div></div><div class="cell" style="width:30px;flex:none;min-width:30px"><label>UF</label><div class="v-sm">' + esc(dEnd.uf || '') + '</div></div><div class="cell"><label>FONE / FAX</label><div class="v-sm">' + esc(dest.telefone || '') + '</div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm">' + esc(dest.ie || '') + '</div></div><div class="cell"><label>HORA DA SAÍDA/ENTRADA</label><div class="v-sm">' + (dtParts[1] || '') + '</div></div></div>' +
'<div class="stit">FATURA / DUPLICATA</div>' +
'<div class="row"><div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div><div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div><div class="cell"><label>VALOR</label><div class="v-sm"></div></div><div class="cell"><label>NÚMERO</label><div class="v-sm"></div></div><div class="cell"><label>VENCIMENTO</label><div class="v-sm"></div></div><div class="cell"><label>VALOR</label><div class="v-sm"></div></div></div>' +
'<div class="stit">CÁLCULO DO IMPOSTO</div>' +
'<div class="row"><div class="cell"><label>BASE DE CALC. DO ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO ICMS</label><div class="v-sm">0,00</div></div><div class="cell"><label>BASE DE CALC. ICMS S.T</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO ICMS SUBST</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. IMP. IMPORTAÇÃO</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. ICMS UF REMET.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. FCP UF DEST.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL PRODUTOS</label><div class="v">' + f2(totalProd) + '</div></div></div>' +
'<div class="row"><div class="cell"><label>VALOR DO FRETE</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR DO SEGURO</label><div class="v-sm">0,00</div></div><div class="cell"><label>DESCONTO</label><div class="v-sm">0,00</div></div><div class="cell"><label>OUTRAS DESPESAS</label><div class="v-sm">0,00</div></div><div class="cell"><label>VALOR TOTAL IPI</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. ICMS UF DEST.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOT. TRIB.</label><div class="v-sm">0,00</div></div><div class="cell"><label>V. TOTAL DA NOTA</label><div class="v">' + f2(totalNota) + '</div></div></div>' +
'<div class="stit">TRANSPORTADOR / VOLUMES TRANSPORTADOS</div>' +
'<div class="row"><div class="cell" style="flex:2"><label>NOME / RAZÃO SOCIAL</label><div class="v-sm"></div></div><div class="cell"><label>FRETE</label><div class="v-sm">9-Sem Transporte</div></div><div class="cell"><label>CÓDIGO ANTT</label><div class="v-sm"></div></div><div class="cell"><label>PLACA DO VEÍCULO</label><div class="v-sm"></div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div><div class="cell"><label>CNPJ / CPF</label><div class="v-sm"></div></div></div>' +
'<div class="row"><div class="cell" style="flex:2"><label>ENDEREÇO</label><div class="v-sm"></div></div><div class="cell"><label>MUNICÍPIO</label><div class="v-sm"></div></div><div class="cell" style="width:24px;flex:none"><label>UF</label><div class="v-sm"></div></div><div class="cell"><label>INSCRIÇÃO ESTADUAL</label><div class="v-sm"></div></div></div>' +
'<div class="row"><div class="cell"><label>QUANTIDADE</label><div class="v-sm"></div></div><div class="cell"><label>ESPÉCIE</label><div class="v-sm"></div></div><div class="cell"><label>MARCA</label><div class="v-sm"></div></div><div class="cell"><label>NUMERAÇÃO</label><div class="v-sm"></div></div><div class="cell"><label>PESO BRUTO</label><div class="v-sm"></div></div><div class="cell"><label>PESO LÍQUIDO</label><div class="v-sm"></div></div></div>' +
'<div class="stit">DADOS DOS PRODUTOS / SERVIÇOS</div>' +
'<table class="it"><thead><tr><th>CÓDIGO PRODUTO</th><th style="min-width:120px">DESCRIÇÃO DO PRODUTO / SERVIÇO</th><th>NCM/SH</th><th>O/CSON</th><th>CFOP</th><th>UN</th><th>QUANT.</th><th>VALOR UNIT.</th><th>VALOR TOTAL</th><th>DESC.</th><th>B.CALC ICMS</th><th>VALOR ICMS</th><th>VALOR IPI</th><th>ALIQ ICMS</th><th>ALIQ IPI</th></tr></thead><tbody>' + rows + '</tbody></table>' +
'<div class="stit">DADOS ADICIONAIS</div>' +
'<div class="row" style="min-height:90px;border-bottom:none"><div class="cell" style="flex:2"><label>INFORMAÇÕES COMPLEMENTARES</label><div style="font-size:6.5pt;padding-top:2px;line-height:1.5">' + (isCancelada ? '<strong style="color:red">NF-e CANCELADA</strong> em ' + esc(_fmtDataHora(cancelStamp)) + ' — ' + esc((nf.cancelamento && nf.cancelamento.retornoEvento && nf.cancelamento.retornoEvento.xMotivo) || '') + '<br>' : '') + '<span style="white-space:pre-line">' + esc(infCplTxt) + '</span></div></div><div class="cell"><label>RESERVADO AO FISCO</label></div></div>' +
'</div></div>' +
'<div style="font-size:6pt;margin-top:3px;color:#333">' + esc(impressoEm) + '</div>' +
barcodeScript +
'</body></html>';
  }

  // ── Export ────────────────────────────────────────────────────────────────
  if (typeof window !== 'undefined') {
    window.renderDanfeHTML = renderDanfeHTML;
    window.resolveEmitente = resolveEmitente;
    window._danfeEsc = _esc;
    window.DanfeRender = { renderDanfeHTML: renderDanfeHTML, resolveEmitente: resolveEmitente };
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderDanfeHTML: renderDanfeHTML, resolveEmitente: resolveEmitente, _esc: _esc };
  }
})();
