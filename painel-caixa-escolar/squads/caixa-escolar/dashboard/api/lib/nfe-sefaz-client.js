const DEFAULT_AMBIENTE = process.env.NFE_SEFAZ_AMBIENTE || "homologacao";
const crypto = require("crypto");
const UF_CODE = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32",
  GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41",
  PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17"
};
const SEFAZ_AUTORIZACAO = {
  MG: {
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4"
  }
};

function getSefazConfig() {
  return {
    ambiente: DEFAULT_AMBIENTE,
    uf: process.env.NFE_SEFAZ_UF || "MG",
    cnpjEmitente: process.env.NFE_EMITENTE_CNPJ || "",
    razaoSocial: process.env.NFE_EMITENTE_RAZAO || "",
    nomeFantasia: process.env.NFE_EMITENTE_FANTASIA || "",
    ie: process.env.NFE_EMITENTE_IE || "",
    crt: process.env.NFE_EMITENTE_CRT || "3",
    certificadoBase64: process.env.NFE_CERT_BASE64 || "",
    certificadoSenha: process.env.NFE_CERT_PASSWORD || "",
    certificadoPem: process.env.NFE_CERT_PEM || "",
    chavePrivadaPem: process.env.NFE_KEY_PEM || "",
    seriePadrao: process.env.NFE_SERIE_PADRAO || "1"
  };
}

function validateSefazConfig(config) {
  const missing = [];
  if (!config.cnpjEmitente) missing.push("NFE_EMITENTE_CNPJ");
  if (!config.razaoSocial) missing.push("NFE_EMITENTE_RAZAO");
  if (!config.ie) missing.push("NFE_EMITENTE_IE");
  if (!config.certificadoBase64) missing.push("NFE_CERT_BASE64");
  if (!config.certificadoSenha) missing.push("NFE_CERT_PASSWORD");
  return missing;
}

function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function onlyAscii(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "");
}

function xmlEscape(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function brNumber(value, decimals = 2) {
  return Number(value || 0).toFixed(decimals);
}

function modulo11(chave43) {
  const multiplicadores = [2, 3, 4, 5, 6, 7, 8, 9];
  let soma = 0;
  let idx = 0;
  for (let i = chave43.length - 1; i >= 0; i -= 1) {
    soma += Number(chave43[i]) * multiplicadores[idx];
    idx = (idx + 1) % multiplicadores.length;
  }
  const resto = soma % 11;
  return resto === 0 || resto === 1 ? 0 : 11 - resto;
}

function randomNumeric(length) {
  let out = "";
  while (out.length < length) out += String(Math.floor(Math.random() * 10));
  return out.slice(0, length);
}

function buildAccessKey(payload) {
  const uf = UF_CODE[payload.emitente.uf] || "31";
  const now = new Date();
  const aamm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cnpj = sanitizeDigits(payload.emitente.cnpj).padStart(14, "0").slice(-14);
  const modelo = "55";
  const serie = String(payload.identificacao.serie || "1").padStart(3, "0").slice(-3);
  const numero = String(payload.identificacao.numero || randomNumeric(9)).padStart(9, "0").slice(-9);
  const tpEmis = "1";
  const cNF = randomNumeric(8);
  const base = `${uf}${aamm}${cnpj}${modelo}${serie}${numero}${tpEmis}${cNF}`;
  const dv = modulo11(base);
  return { chave: `${base}${dv}`, numero, serie, cNF, cDV: String(dv) };
}

function summarizeCertificateInput(base64Value) {
  if (!base64Value) {
    return { status: "nao_configurado", bytes: 0, message: "Certificado A1 ausente." };
  }
  try {
    const normalized = String(base64Value).replace(/\s+/g, "");
    const bytes = Buffer.from(normalized, "base64");
    if (!bytes.length) {
      return { status: "invalido", bytes: 0, message: "Base64 vazio ou invalido." };
    }
    return {
      status: "carregado",
      bytes: bytes.length,
      message: "Blob do certificado carregado para futuras etapas de assinatura."
    };
  } catch (err) {
    return { status: "invalido", bytes: 0, message: err.message };
  }
}

function summarizePemInput(certPem, keyPem) {
  const result = {
    certStatus: certPem ? "configurado" : "nao_configurado",
    keyStatus: keyPem ? "configurado" : "nao_configurado",
    subject: "",
    validFrom: "",
    validTo: "",
    message: ""
  };
  if (!certPem || !keyPem) {
    result.message = "PEM de certificado/chave ainda nao configurados.";
    return result;
  }
  try {
    const cert = new crypto.X509Certificate(certPem);
    result.subject = cert.subject;
    result.validFrom = cert.validFrom;
    result.validTo = cert.validTo;
    result.message = "PEM carregado para pre-assinatura local.";
  } catch (err) {
    result.certStatus = "invalido";
    result.message = err.message;
  }
  return result;
}

function pemBody(certPem) {
  return String(certPem || "")
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");
}

function buildNfePayloadFromPedido(pedido, overrides = {}) {
  const cfg = getSefazConfig();
  const cliente = pedido?.cliente || {};
  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  return {
    ambiente: cfg.ambiente,
    emitente: {
      cnpj: sanitizeDigits(cfg.cnpjEmitente),
      razaoSocial: cfg.razaoSocial,
      nomeFantasia: cfg.nomeFantasia,
      ie: cfg.ie,
      crt: cfg.crt,
      uf: cfg.uf
    },
    destinatario: {
      nome: cliente.nome || pedido?.escola || "",
      cnpj: sanitizeDigits(cliente.cnpj),
      ie: cliente.ie || "ISENTO",
      email: cliente.email || "",
      telefone: sanitizeDigits(cliente.telefone),
      endereco: {
        logradouro: cliente.logradouro || "",
        numero: cliente.numero || "S/N",
        complemento: cliente.complemento || "",
        bairro: cliente.bairro || "",
        cep: sanitizeDigits(cliente.cep),
        cidade: cliente.cidade || "",
        uf: cliente.uf || "MG"
      }
    },
    identificacao: {
      pedidoId: pedido?.id || "",
      contratoId: pedido?.contratoId || "",
      naturezaOperacao: overrides.naturezaOperacao || "VENDA DE MERCADORIA",
      serie: overrides.serie || cfg.seriePadrao,
      numero: overrides.numero || null
    },
    itens: itens.map((item, idx) => ({
      itemNum: item.itemNum || idx + 1,
      codigo: item.sku || item.codigoBarras || `ITEM-${idx + 1}`,
      descricao: item.descricao || `Item ${idx + 1}`,
      ncm: sanitizeDigits(item.ncm),
      cfop: item.cfop || overrides.cfop || "5102",
      unidade: item.unidade || "UN",
      quantidade: Number(item.qtd || 0),
      valorUnitario: Number(item.precoUnitario || 0),
      valorTotal: Number((Number(item.qtd || 0) * Number(item.precoUnitario || 0)).toFixed(2))
    })),
    totais: {
      valorProdutos: Number(pedido?.valor || 0),
      valorNota: Number(pedido?.valor || 0)
    }
  };
}

function buildNfeXml(payload) {
  const access = buildAccessKey(payload);
  const totalProdutos = payload.itens.reduce((sum, item) => sum + Number(item.valorTotal || 0), 0);
  const itensXml = payload.itens.map((item) => `
    <det nItem="${item.itemNum}">
      <prod>
        <cProd>${xmlEscape(item.codigo)}</cProd>
        <cEAN>SEM GTIN</cEAN>
        <xProd>${xmlEscape(onlyAscii(item.descricao))}</xProd>
        <NCM>${xmlEscape(item.ncm || "00000000")}</NCM>
        <CFOP>${xmlEscape(item.cfop || "5102")}</CFOP>
        <uCom>${xmlEscape(item.unidade || "UN")}</uCom>
        <qCom>${brNumber(item.quantidade, 4)}</qCom>
        <vUnCom>${brNumber(item.valorUnitario, 10)}</vUnCom>
        <vProd>${brNumber(item.valorTotal, 2)}</vProd>
        <cEANTrib>SEM GTIN</cEANTrib>
        <uTrib>${xmlEscape(item.unidade || "UN")}</uTrib>
        <qTrib>${brNumber(item.quantidade, 4)}</qTrib>
        <vUnTrib>${brNumber(item.valorUnitario, 10)}</vUnTrib>
        <indTot>1</indTot>
      </prod>
      <imposto>
        <vTotTrib>0.00</vTotTrib>
        <ICMS>
          <ICMSSN102>
            <orig>0</orig>
            <CSOSN>102</CSOSN>
          </ICMSSN102>
        </ICMS>
        <PIS><PISOutr><CST>99</CST><vBC>0.00</vBC><pPIS>0.00</pPIS><vPIS>0.00</vPIS></PISOutr></PIS>
        <COFINS><COFINSOutr><CST>99</CST><vBC>0.00</vBC><pCOFINS>0.00</pCOFINS><vCOFINS>0.00</vCOFINS></COFINSOutr></COFINS>
      </imposto>
    </det>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00" Id="NFe${access.chave}">
    <ide>
      <cUF>${UF_CODE[payload.emitente.uf] || "31"}</cUF>
      <cNF>${access.cNF}</cNF>
      <natOp>${xmlEscape(onlyAscii(payload.identificacao.naturezaOperacao || "VENDA"))}</natOp>
      <mod>55</mod>
      <serie>${access.serie}</serie>
      <nNF>${access.numero}</nNF>
      <dhEmi>${new Date().toISOString()}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>3106200</cMunFG>
      <tpImp>1</tpImp>
      <tpEmis>1</tpEmis>
      <cDV>${access.cDV}</cDV>
      <tpAmb>${payload.ambiente === "producao" ? "1" : "2"}</tpAmb>
      <finNFe>1</finNFe>
      <indFinal>1</indFinal>
      <indPres>1</indPres>
      <procEmi>0</procEmi>
      <verProc>GDP-0.1</verProc>
    </ide>
    <emit>
      <CNPJ>${xmlEscape(payload.emitente.cnpj)}</CNPJ>
      <xNome>${xmlEscape(onlyAscii(payload.emitente.razaoSocial))}</xNome>
      <xFant>${xmlEscape(onlyAscii(payload.emitente.nomeFantasia || payload.emitente.razaoSocial))}</xFant>
      <enderEmit>
        <xLgr>RUA NAO CONFIGURADA</xLgr>
        <nro>S/N</nro>
        <xBairro>CENTRO</xBairro>
        <cMun>3106200</cMun>
        <xMun>BELO HORIZONTE</xMun>
        <UF>${xmlEscape(payload.emitente.uf || "MG")}</UF>
        <CEP>30000000</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderEmit>
      <IE>${xmlEscape(payload.emitente.ie)}</IE>
      <CRT>${xmlEscape(payload.emitente.crt || "3")}</CRT>
    </emit>
    <dest>
      <CNPJ>${xmlEscape(payload.destinatario.cnpj)}</CNPJ>
      <xNome>${xmlEscape(onlyAscii(payload.destinatario.nome))}</xNome>
      <enderDest>
        <xLgr>${xmlEscape(onlyAscii(payload.destinatario.endereco.logradouro))}</xLgr>
        <nro>${xmlEscape(payload.destinatario.endereco.numero)}</nro>
        <xCpl>${xmlEscape(onlyAscii(payload.destinatario.endereco.complemento || ""))}</xCpl>
        <xBairro>${xmlEscape(onlyAscii(payload.destinatario.endereco.bairro))}</xBairro>
        <cMun>3106200</cMun>
        <xMun>${xmlEscape(onlyAscii(payload.destinatario.endereco.cidade || "BELO HORIZONTE"))}</xMun>
        <UF>${xmlEscape(payload.destinatario.endereco.uf || "MG")}</UF>
        <CEP>${xmlEscape(payload.destinatario.endereco.cep || "30000000")}</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderDest>
      <indIEDest>9</indIEDest>
      <IE>${xmlEscape(payload.destinatario.ie || "ISENTO")}</IE>
      <email>${xmlEscape(payload.destinatario.email || "")}</email>
    </dest>
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>0.00</vBC>
        <vICMS>0.00</vICMS>
        <vICMSDeson>0.00</vICMSDeson>
        <vFCP>0.00</vFCP>
        <vBCST>0.00</vBCST>
        <vST>0.00</vST>
        <vFCPST>0.00</vFCPST>
        <vFCPSTRet>0.00</vFCPSTRet>
        <vProd>${brNumber(totalProdutos, 2)}</vProd>
        <vFrete>0.00</vFrete>
        <vSeg>0.00</vSeg>
        <vDesc>0.00</vDesc>
        <vII>0.00</vII>
        <vIPI>0.00</vIPI>
        <vIPIDevol>0.00</vIPIDevol>
        <vPIS>0.00</vPIS>
        <vCOFINS>0.00</vCOFINS>
        <vOutro>0.00</vOutro>
        <vNF>${brNumber(payload.totais.valorNota, 2)}</vNF>
        <vTotTrib>0.00</vTotTrib>
      </ICMSTot>
    </total>
    <transp><modFrete>9</modFrete></transp>
    <pag><detPag><indPag>0</indPag><tPag>15</tPag><vPag>${brNumber(payload.totais.valorNota, 2)}</vPag></detPag></pag>
    <infAdic><infCpl>${xmlEscape(`Pedido GDP ${payload.identificacao.pedidoId}`)}</infCpl></infAdic>
  </infNFe>
</NFe>`;

  return { xml, accessKey: access.chave, numero: access.numero, serie: access.serie };
}

function buildSignaturePreview(xml, config) {
  const pem = summarizePemInput(config.certificadoPem, config.chavePrivadaPem);
  const digest = crypto.createHash("sha256").update(xml, "utf8").digest("base64");
  if (!config.certificadoPem || !config.chavePrivadaPem) {
    return {
      ok: false,
      mode: "pem_missing",
      digestSha256Base64: digest,
      pem,
      message: "PEM nao configurado. Pre-assinatura indisponivel."
    };
  }
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(xml, "utf8");
    signer.end();
    const signature = signer.sign(config.chavePrivadaPem, "base64");
    return {
      ok: true,
      mode: "preview_signature",
      digestSha256Base64: digest,
      signatureBase64: signature,
      pem,
      message: "Pre-assinatura gerada. Ainda nao e XMLDSig valida para SEFAZ."
    };
  } catch (err) {
    return {
      ok: false,
      mode: "preview_signature_error",
      digestSha256Base64: digest,
      pem,
      message: err.message
    };
  }
}

function extractInfNfeNode(xml) {
  const match = String(xml || "").match(/<infNFe\b[^>]*Id="([^"]+)"[^>]*>([\s\S]*?)<\/infNFe>/);
  if (!match) return null;
  return {
    id: match[1],
    xml: match[0]
  };
}

function buildSignedInfoXml(referenceId, digestValue) {
  return `<SignedInfo xmlns="http://www.w3.org/2000/09/xmldsig#"><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#${referenceId}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>${digestValue}</DigestValue></Reference></SignedInfo>`;
}

function buildXmlDsigPreview(xml, config) {
  const pem = summarizePemInput(config.certificadoPem, config.chavePrivadaPem);
  const inf = extractInfNfeNode(xml);
  if (!inf) {
    return {
      ok: false,
      mode: "infnfe_missing",
      message: "Nao foi possivel localizar o bloco infNFe para assinar."
    };
  }

  const digestValue = crypto.createHash("sha1").update(inf.xml, "utf8").digest("base64");
  const signedInfoXml = buildSignedInfoXml(inf.id, digestValue);
  if (!config.certificadoPem || !config.chavePrivadaPem) {
    return {
      ok: false,
      mode: "pem_missing",
      digestSha1Base64: digestValue,
      signedInfoXml,
      pem,
      message: "PEM nao configurado. XMLDSig preview indisponivel."
    };
  }

  try {
    const signer = crypto.createSign("RSA-SHA1");
    signer.update(signedInfoXml, "utf8");
    signer.end();
    const signatureValue = signer.sign(config.chavePrivadaPem, "base64");
    const signatureXml = `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">${signedInfoXml}<SignatureValue>${signatureValue}</SignatureValue><KeyInfo><X509Data><X509Certificate>${pemBody(config.certificadoPem)}</X509Certificate></X509Data></KeyInfo></Signature>`;
    const signedXml = String(xml).replace("</NFe>", `${signatureXml}</NFe>`);
    return {
      ok: true,
      mode: "xmldsig_preview",
      digestSha1Base64: digestValue,
      signedInfoXml,
      signatureValue,
      signatureXml,
      signedXml,
      pem,
      message: "XMLDSig preview gerada com RSA-SHA1/SHA-1. Validacao final depende de canonicalizacao e homologacao SEFAZ."
    };
  } catch (err) {
    return {
      ok: false,
      mode: "xmldsig_preview_error",
      digestSha1Base64: digestValue,
      signedInfoXml,
      pem,
      message: err.message
    };
  }
}

function buildLoteXml(xmlAssinadoOuPreview, loteId = randomNumeric(15)) {
  return {
    loteId,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <idLote>${loteId}</idLote>
  <indSinc>1</indSinc>
  ${xmlAssinadoOuPreview}
</enviNFe>`
  };
}

function getSefazAutorizacaoUrl(uf, ambiente) {
  const byUf = SEFAZ_AUTORIZACAO[String(uf || "MG").toUpperCase()];
  if (!byUf) return "";
  return byUf[ambiente === "producao" ? "producao" : "homologacao"] || "";
}

function buildAutorizacaoSoapEnvelope(loteXml) {
  const loteCompact = String(loteXml || "").replace(/\r?\n/g, "").trim();
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${xmlEscape(loteCompact)}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`;
}

function buildAutorizacaoRequestPreview(payload, lotePreview) {
  const url = getSefazAutorizacaoUrl(payload.emitente?.uf || "MG", payload.ambiente);
  const soapEnvelope = buildAutorizacaoSoapEnvelope(lotePreview.xml);
  return {
    url,
    soapAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8",
      SOAPAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"
    },
    soapEnvelope
  };
}

async function emitirNfeDireta(payload) {
  const cfg = getSefazConfig();
  const missing = validateSefazConfig(cfg);
  const certificate = summarizeCertificateInput(cfg.certificadoBase64);
  const xmlPreview = buildNfeXml(payload);
  const signaturePreview = buildSignaturePreview(xmlPreview.xml, cfg);
  const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, cfg);
  const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
  const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
  if (missing.length) {
    return {
      ok: false,
      mode: "config_missing",
      error: `Configuracao NF-e incompleta: ${missing.join(", ")}`,
      certificate,
      xmlPreview,
      signaturePreview,
      xmlDsigPreview,
      lotePreview,
      autorizacaoPreview
    };
  }

  return {
    ok: false,
    mode: "not_implemented",
    ambiente: cfg.ambiente,
    message: "Transmissao direta para a SEFAZ ainda nao implementada neste endpoint.",
    nextSteps: [
      "Transformar pre-assinatura em XMLDSig valida da NF-e",
      "Montar lote enviNFe definitivo",
      "Transmitir via webservice NF-e autorizacao",
      "Persistir recibo, protocolo e XML autorizado"
    ],
    preview: payload,
    certificate,
    xmlPreview,
    signaturePreview,
    xmlDsigPreview,
    lotePreview,
    autorizacaoPreview
  };
}

module.exports = {
  getSefazConfig,
  validateSefazConfig,
  buildNfePayloadFromPedido,
  buildNfeXml,
  summarizeCertificateInput,
  summarizePemInput,
  buildSignaturePreview,
  buildXmlDsigPreview,
  buildLoteXml,
  getSefazAutorizacaoUrl,
  buildAutorizacaoSoapEnvelope,
  buildAutorizacaoRequestPreview,
  emitirNfeDireta
};
