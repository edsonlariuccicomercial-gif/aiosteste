function env(key, fallback) { return (process.env[key] || fallback || "").trim(); }
const DEFAULT_AMBIENTE = env("NFE_SEFAZ_AMBIENTE", "homologacao");
const crypto = require("crypto");
const https = require("https");
const { SignedXml } = require("xml-crypto");
const HOMOLOGACAO_DEST_NOME = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";
const UF_CODE = {
  AC: "12", AL: "27", AP: "16", AM: "13", BA: "29", CE: "23", DF: "53", ES: "32",
  GO: "52", MA: "21", MT: "51", MS: "50", MG: "31", PA: "15", PB: "25", PR: "41",
  PE: "26", PI: "22", RJ: "33", RN: "24", RS: "43", RO: "11", RR: "14", SC: "42",
  SP: "35", SE: "28", TO: "17"
};
const MUNICIPIO_CODE = {
  "BELO HORIZONTE|MG": "3106200",
  "CONQUISTA|MG": "3118304"
};
const SEFAZ_AUTORIZACAO = {
  MG: {
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4",
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeAutorizacao4"
  }
};
const SEFAZ_INUTILIZACAO = {
  MG: {
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4",
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeInutilizacao4"
  }
};
const SEFAZ_EVENTO = {
  MG: {
    homologacao: "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4",
    producao: "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeRecepcaoEvento4"
  }
};

function getSefazConfig() {
  // Tentar ler PEM de arquivos locais se env vars estiverem vazias
  let certPem = process.env.NFE_CERT_PEM || "";
  let keyPem = process.env.NFE_KEY_PEM || "";
  try {
    const fs = require("fs");
    const path = require("path");
    const baseDir = path.join(__dirname, "..");
    if (!certPem || !certPem.includes("BEGIN")) {
      const certFile = path.join(baseDir, "cert.pem");
      if (fs.existsSync(certFile)) certPem = fs.readFileSync(certFile, "utf8");
    }
    if (!keyPem || !keyPem.includes("BEGIN")) {
      const keyFile = path.join(baseDir, "key.pem");
      if (fs.existsSync(keyFile)) keyPem = fs.readFileSync(keyFile, "utf8");
    }
  } catch(_) {}

  return {
    ambiente: DEFAULT_AMBIENTE,
    uf: env("NFE_SEFAZ_UF", "MG").toUpperCase(),
    cnpjEmitente: env("NFE_EMITENTE_CNPJ"),
    razaoSocial: env("NFE_EMITENTE_RAZAO", "EDSON DE SOUSA GONCALVES"),
    nomeFantasia: env("NFE_EMITENTE_FANTASIA", "LARIUCCI"),
    ie: env("NFE_EMITENTE_IE"),
    crt: env("NFE_EMITENTE_CRT", "1"),
    emitenteEndereco: {
      logradouro: env("NFE_EMITENTE_LOGRADOURO", "AV DAS CANDIUVAS"),
      numero: env("NFE_EMITENTE_NUMERO", "85"),
      complemento: env("NFE_EMITENTE_COMPLEMENTO"),
      bairro: env("NFE_EMITENTE_BAIRRO", "RIBALTA"),
      cidade: env("NFE_EMITENTE_CIDADE", "CONQUISTA"),
      uf: env("NFE_EMITENTE_UF", "MG").toUpperCase(),
      cep: env("NFE_EMITENTE_CEP", "38195000"),
      telefone: env("NFE_EMITENTE_FONE", "16981914537"),
      email: env("NFE_EMITENTE_EMAIL", "edsonlariucci.comercial@gmail.com"),
      cMunFG: env("NFE_EMITENTE_CMUN", "3118304")
    },
    certificadoBase64: env("NFE_CERT_BASE64"),
    certificadoSenha: env("NFE_CERT_PASSWORD"),
    certificadoPem: certPem.trim(),
    chavePrivadaPem: keyPem.trim(),
    seriePadrao: env("NFE_SERIE_PADRAO", "1")
  };
}

function validateSefazConfig(config) {
  const missing = [];
  if (!config.cnpjEmitente) missing.push("NFE_EMITENTE_CNPJ");
  if (!config.razaoSocial) missing.push("NFE_EMITENTE_RAZAO");
  if (!config.ie) missing.push("NFE_EMITENTE_IE");
  if (!config.certificadoBase64) missing.push("NFE_CERT_BASE64");
  if (!config.certificadoSenha) missing.push("NFE_CERT_PASSWORD");
  return { valid: missing.length === 0, missing };
}

function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMunicipioKey(cidade, uf) {
  return `${onlyAscii(String(cidade || "")).trim().toUpperCase()}|${String(uf || "MG").trim().toUpperCase()}`;
}

function getMunicipioCode(cidade, uf, fallback = "3106200") {
  return MUNICIPIO_CODE[normalizeMunicipioKey(cidade, uf)] || fallback;
}

// Tabela dinâmica: adicionar municípios conforme necessário
function ensureMunicipio(cidade, uf, codigo) {
  const key = normalizeMunicipioKey(cidade, uf);
  if (!MUNICIPIO_CODE[key]) MUNICIPIO_CODE[key] = codigo;
}

// Municípios MG comuns nas caixas escolares
ensureMunicipio("FRUTAL", "MG", "3127107");
ensureMunicipio("UBERABA", "MG", "3170107");
ensureMunicipio("UBERLANDIA", "MG", "3170206");
ensureMunicipio("ARAGUARI", "MG", "3103504");
ensureMunicipio("ITURAMA", "MG", "3133709");
ensureMunicipio("CAMPINA VERDE", "MG", "3111408");
ensureMunicipio("ITUIUTABA", "MG", "3133808");
ensureMunicipio("SACRAMENTO", "MG", "3156908");
ensureMunicipio("PASSOS", "MG", "3147808");
ensureMunicipio("SAO SEBASTIAO DO PARAISO", "MG", "3164704");
ensureMunicipio("PATOS DE MINAS", "MG", "3148004");
ensureMunicipio("PATROCINIO", "MG", "3148103");
ensureMunicipio("MONTE CARMELO", "MG", "3143302");
ensureMunicipio("ARAXA", "MG", "3104007");

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

// Sequencial de NF — baseado no NFE_NUMERO_INICIAL
// No Vercel (serverless), o número é passado pelo frontend via overrides.numero
// Se não fornecido, usa NFE_NUMERO_INICIAL como fallback
function getNextNfNumber() {
  return String(parseInt(process.env.NFE_NUMERO_INICIAL || "1", 10));
}

function buildAccessKey(payload) {
  const uf = UF_CODE[payload.emitente.uf] || "31";
  const now = new Date();
  const aamm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const cnpj = sanitizeDigits(payload.emitente.cnpj).padStart(14, "0").slice(-14);
  const modelo = "55";
  const serie = String(Number(payload.identificacao.serie || "1") || 1);
  const serieChave = serie.padStart(3, "0").slice(-3);
  const numeroBase = String(payload.identificacao.numero || `${Math.floor(Math.random() * 9) + 1}${randomNumeric(8)}`);
  const numeroChave = numeroBase.padStart(9, "0").slice(-9);
  const numero = String(Number(numeroChave) || 1);
  const tpEmis = "1";
  const cNF = randomNumeric(8);
  const base = `${uf}${aamm}${cnpj}${modelo}${serieChave}${numeroChave}${tpEmis}${cNF}`;
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

function getCertificateBuffer(base64Value) {
  const normalized = String(base64Value || "").replace(/\s+/g, "");
  return normalized ? Buffer.from(normalized, "base64") : Buffer.alloc(0);
}

function postSoapXml(url, options) {
  return new Promise((resolve, reject) => {
    const body = String(options.body || "");
    const headers = {
      "Content-Length": Buffer.byteLength(body),
      ...options.headers
    };

    const req = https.request(url, {
      method: "POST",
      headers,
      pfx: options.pfx,
      passphrase: options.passphrase,
      cert: options.cert,
      key: options.key,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        raw += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: raw
        });
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
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
  const match = String(certPem || "").match(/-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/);
  if (!match) return "";
  return match[1].replace(/\s+/g, "");
}

function stripXmlDeclaration(xml) {
  return String(xml || "").replace(/^\s*<\?xml[^>]*\?>\s*/i, "").trim();
}

function compactXml(xml) {
  const withoutDeclaration = stripXmlDeclaration(xml);
  return withoutDeclaration.replace(/>\s+</g, "><").trim();
}

function optionalXml(tag, value, transform = (input) => input) {
  const normalized = transform(value);
  return normalized ? `<${tag}>${normalized}</${tag}>` : "";
}

function buildIcmsXml(payload, item) {
  const crt = String(payload.emitente?.crt || "3");
  if (crt === "1" || crt === "4") {
    return `<ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>`;
  }

  return `<ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>${brNumber(item.valorTotal, 2)}</vBC><pICMS>0.00</pICMS><vICMS>0.00</vICMS></ICMS00></ICMS>`;
}

function getDestIcmsIndicator(destinatario, payload) {
  const ie = String(destinatario?.ie || "").trim().toUpperCase();
  const invalids = ["", "N", "ISENTO", "ISENTA", "NAO", "S/N", "SN", "NENHUMA", "9"];
  if (invalids.includes(ie)) return "9";
  if (/^\d{2,14}$/.test(ie)) return "1";
  return "9";
}

function formatNfeDateTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(date)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}-03:00`;
}

function buildNfePayloadFromPedido(pedido, overrides = {}) {
  const cfg = getSefazConfig();
  const cliente = pedido?.cliente || {};
  const ambiente = overrides.ambiente || cfg.ambiente;
  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  return {
    ambiente,
    emitente: {
      cnpj: sanitizeDigits(cfg.cnpjEmitente),
      razaoSocial: cfg.razaoSocial,
      nomeFantasia: cfg.nomeFantasia,
      ie: cfg.ie,
      crt: cfg.crt,
      uf: cfg.uf,
      endereco: {
        logradouro: cfg.emitenteEndereco.logradouro,
        numero: cfg.emitenteEndereco.numero,
        complemento: cfg.emitenteEndereco.complemento,
        bairro: cfg.emitenteEndereco.bairro,
        cidade: cfg.emitenteEndereco.cidade,
        uf: cfg.emitenteEndereco.uf,
        cep: sanitizeDigits(cfg.emitenteEndereco.cep),
        telefone: sanitizeDigits(cfg.emitenteEndereco.telefone),
        email: cfg.emitenteEndereco.email
      }
    },
    destinatario: {
      nome: ambiente === "homologacao" ? HOMOLOGACAO_DEST_NOME : (cliente.nome || pedido?.escola || ""),
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
      numero: overrides.numero || getNextNfNumber()
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
  const icmsBase = String(payload.emitente?.crt || "3") === "3" ? totalProdutos : 0;
  const destIcmsIndicator = getDestIcmsIndicator(payload.destinatario, payload);
  const emitCidade = payload.emitente?.endereco?.cidade || "Belo Horizonte";
  const emitUf = payload.emitente?.endereco?.uf || payload.emitente?.uf || "MG";
  const emitMunicipioCode = getMunicipioCode(emitCidade, emitUf, "3106200");
  const itensXml = payload.itens.map((item, idx) => `
    <det nItem="${idx + 1}">
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
        ${buildIcmsXml(payload, item)}
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
      <dhEmi>${formatNfeDateTime()}</dhEmi>
      <tpNF>1</tpNF>
      <idDest>1</idDest>
      <cMunFG>${emitMunicipioCode}</cMunFG>
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
      <xNome>${xmlEscape(onlyAscii(String(payload.emitente.razaoSocial || "").toUpperCase()))}</xNome>
      ${optionalXml("xFant", payload.emitente.nomeFantasia || payload.emitente.razaoSocial, (value) => xmlEscape(onlyAscii(String(value || "").toUpperCase())))}
      <enderEmit>
        <xLgr>${xmlEscape(onlyAscii(payload.emitente.endereco?.logradouro || "RUA NAO CONFIGURADA"))}</xLgr>
        <nro>${xmlEscape(payload.emitente.endereco?.numero || "S/N")}</nro>
        ${optionalXml("xCpl", payload.emitente.endereco?.complemento, (value) => xmlEscape(onlyAscii(value)))}
        <xBairro>${xmlEscape(onlyAscii(payload.emitente.endereco?.bairro || "CENTRO"))}</xBairro>
        <cMun>${emitMunicipioCode}</cMun>
        <xMun>${xmlEscape(onlyAscii(emitCidade))}</xMun>
        <UF>${xmlEscape(emitUf)}</UF>
        <CEP>${xmlEscape(payload.emitente.endereco?.cep || "30000000")}</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
        ${optionalXml("fone", payload.emitente.endereco?.telefone, xmlEscape)}
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
        ${optionalXml("xCpl", payload.destinatario.endereco.complemento, (value) => xmlEscape(onlyAscii(value)))}
        <xBairro>${xmlEscape(onlyAscii(payload.destinatario.endereco.bairro))}</xBairro>
        <cMun>${getMunicipioCode(payload.destinatario.endereco.cidade, payload.destinatario.endereco.uf)}</cMun>
        <xMun>${xmlEscape(onlyAscii(payload.destinatario.endereco.cidade || "BELO HORIZONTE"))}</xMun>
        <UF>${xmlEscape(payload.destinatario.endereco.uf || "MG")}</UF>
        <CEP>${xmlEscape(payload.destinatario.endereco.cep || "30000000")}</CEP>
        <cPais>1058</cPais>
        <xPais>BRASIL</xPais>
      </enderDest>
      <indIEDest>${destIcmsIndicator}</indIEDest>
      ${destIcmsIndicator === "1" ? optionalXml("IE", payload.destinatario.ie, xmlEscape) : ""}
      ${optionalXml("email", payload.destinatario.email, xmlEscape)}
    </dest>
    ${itensXml}
    <total>
      <ICMSTot>
        <vBC>${brNumber(icmsBase, 2)}</vBC>
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
    <pag><detPag><tPag>15</tPag><vPag>${brNumber(payload.totais.valorNota, 2)}</vPag></detPag></pag>
    ${optionalXml("infAdic", payload.identificacao.pedidoId, (value) => `<infCpl>${xmlEscape(`Pedido GDP ${value}`)}</infCpl>`)}
  </infNFe>
</NFe>`;

  return {
    xml: `<?xml version="1.0" encoding="UTF-8"?>${compactXml(xml)}`,
    accessKey: access.chave,
    numero: access.numero,
    serie: access.serie
  };
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

  if (!config.certificadoPem || !config.chavePrivadaPem) {
    return {
      ok: false,
      mode: "pem_missing",
      pem,
      message: "PEM nao configurado. XMLDSig preview indisponivel."
    };
  }

  try {
    const signer = new SignedXml({
      privateKey: config.chavePrivadaPem,
      publicCert: config.certificadoPem,
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      idAttribute: "Id",
      getKeyInfoContent: () => `<X509Data><X509Certificate>${pemBody(config.certificadoPem)}</X509Certificate></X509Data>`
    });
    signer.addReference({
      xpath: "//*[local-name(.)='infNFe']",
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
      ],
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
    });
    signer.computeSignature(xml, {
      location: {
        reference: "//*[local-name(.)='infNFe']",
        action: "after"
      }
    });
    const signedXml = signer.getSignedXml();
    const signatureXml = signer.getSignatureXml();
    const digestMatch = signatureXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    const signatureValueMatch = signatureXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    const signedInfoMatch = signatureXml.match(/<SignedInfo[\s\S]*?<\/SignedInfo>/);
    return {
      ok: true,
      mode: "xmldsig_preview",
      digestSha1Base64: digestMatch ? digestMatch[1] : "",
      signedInfoXml: signedInfoMatch ? signedInfoMatch[0] : "",
      signatureValue: signatureValueMatch ? signatureValueMatch[1] : "",
      signatureXml,
      signedXml,
      pem,
      message: "XMLDSig gerada com xml-crypto (RSA-SHA1/SHA-1)."
    };
  } catch (err) {
    return {
      ok: false,
      mode: "xmldsig_preview_error",
      pem,
      message: err.message
    };
  }
}

function buildEventoDsigPreview(xml, config) {
  const pem = summarizePemInput(config.certificadoPem, config.chavePrivadaPem);
  if (!String(xml || "").includes("<infEvento")) {
    return {
      ok: false,
      mode: "infevento_missing",
      message: "Nao foi possivel localizar o bloco infEvento para assinar."
    };
  }

  if (!config.certificadoPem || !config.chavePrivadaPem) {
    return {
      ok: false,
      mode: "pem_missing",
      pem,
      message: "PEM nao configurado. XMLDSig do evento indisponivel."
    };
  }

  try {
    const signer = new SignedXml({
      privateKey: config.chavePrivadaPem,
      publicCert: config.certificadoPem,
      signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
      canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
      idAttribute: "Id",
      getKeyInfoContent: () => `<X509Data><X509Certificate>${pemBody(config.certificadoPem)}</X509Certificate></X509Data>`
    });
    signer.addReference({
      xpath: "//*[local-name(.)='infEvento']",
      transforms: [
        "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
        "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
      ],
      digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1"
    });
    signer.computeSignature(xml, {
      location: {
        reference: "//*[local-name(.)='infEvento']",
        action: "after"
      }
    });
    const signedXml = signer.getSignedXml();
    const signatureXml = signer.getSignatureXml();
    const digestMatch = signatureXml.match(/<DigestValue>([^<]+)<\/DigestValue>/);
    const signatureValueMatch = signatureXml.match(/<SignatureValue>([^<]+)<\/SignatureValue>/);
    return {
      ok: true,
      mode: "evento_xmldsig_preview",
      digestSha1Base64: digestMatch ? digestMatch[1] : "",
      signatureValue: signatureValueMatch ? signatureValueMatch[1] : "",
      signatureXml,
      signedXml,
      pem,
      message: "XMLDSig do evento gerada com xml-crypto (RSA-SHA1/SHA-1)."
    };
  } catch (err) {
    return {
      ok: false,
      mode: "evento_xmldsig_preview_error",
      pem,
      message: err.message
    };
  }
}

function buildLoteXml(xmlAssinadoOuPreview, loteId = randomNumeric(15)) {
  const nfeXml = compactXml(xmlAssinadoOuPreview);
  return {
    loteId,
    xml: `<?xml version="1.0" encoding="UTF-8"?>
<enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>${loteId}</idLote><indSinc>1</indSinc>${nfeXml}</enviNFe>`
  };
}

function getSefazAutorizacaoUrl(uf, ambiente) {
  const byUf = SEFAZ_AUTORIZACAO[String(uf || "MG").toUpperCase()];
  if (!byUf) return "";
  return byUf[ambiente === "producao" ? "producao" : "homologacao"] || "";
}

function getSefazEventoUrl(uf, ambiente) {
  const byUf = SEFAZ_EVENTO[String(uf || "MG").toUpperCase()];
  if (!byUf) return "";
  return byUf[ambiente === "producao" ? "producao" : "homologacao"] || "";
}

function buildAutorizacaoSoapEnvelope(loteXml) {
  const loteCompact = stripXmlDeclaration(loteXml).replace(/\r?\n/g, "").trim();
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">${loteCompact}</nfeDadosMsg>
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
      "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote\"",
      SOAPAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4/nfeAutorizacaoLote"
    },
    soapEnvelope
  };
}

function buildCancelamentoPayload(nota = {}, motivo = "") {
  const cfg = getSefazConfig();
  const now = new Date();
  const dhEvento = formatNfeDateTime(now);
  return {
    ambiente: cfg.ambiente,
    uf: cfg.uf,
    cnpjEmitente: sanitizeDigits(cfg.cnpjEmitente),
    chaveAcesso: sanitizeDigits(nota?.sefaz?.chaveAcesso || ""),
    protocolo: String(nota?.sefaz?.protocolo || "").trim(),
    sequencia: "1",
    tipoEvento: "110111",
    descricaoEvento: "Cancelamento",
    justificativa: onlyAscii(String(motivo || "")).slice(0, 255),
    dhEvento
  };
}

function buildCancelamentoXml(payload) {
  const idLote = randomNumeric(15);
  const id = `ID${payload.tipoEvento}${payload.chaveAcesso}${payload.sequencia.padStart(2, "0")}`;
  const eventoXml = `<?xml version="1.0" encoding="UTF-8"?>
<envEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
  <idLote>${idLote}</idLote>
  <evento versao="1.00">
    <infEvento Id="${id}">
      <cOrgao>${UF_CODE[payload.uf] || "31"}</cOrgao>
      <tpAmb>${payload.ambiente === "producao" ? "1" : "2"}</tpAmb>
      <CNPJ>${xmlEscape(payload.cnpjEmitente)}</CNPJ>
      <chNFe>${xmlEscape(payload.chaveAcesso)}</chNFe>
      <dhEvento>${xmlEscape(payload.dhEvento)}</dhEvento>
      <tpEvento>${payload.tipoEvento}</tpEvento>
      <nSeqEvento>${payload.sequencia}</nSeqEvento>
      <verEvento>1.00</verEvento>
      <detEvento versao="1.00">
        <descEvento>${payload.descricaoEvento}</descEvento>
        <nProt>${xmlEscape(payload.protocolo)}</nProt>
        <xJust>${xmlEscape(payload.justificativa)}</xJust>
      </detEvento>
    </infEvento>
  </evento>
</envEvento>`;
  return { idLote, xml: compactXml(eventoXml), id };
}

function buildCancelamentoRequestPreview(payload, xmlPreview) {
  const url = getSefazEventoUrl(payload.uf || "MG", payload.ambiente);
  const body = stripXmlDeclaration(xmlPreview.xml).replace(/\r?\n/g, "").trim();
  return {
    url,
    soapAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento",
    headers: {
      "Content-Type": "application/soap+xml; charset=utf-8; action=\"http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento\"",
      SOAPAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4/nfeRecepcaoEvento"
    },
    soapEnvelope: `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">${body}</nfeDadosMsg>
  </soap12:Body>
</soap12:Envelope>`
  };
}

function parseSefazAutorizacaoResponse(xmlText) {
  const xml = String(xmlText || "");
  const findTag = (tag) => {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
    return match ? match[1].trim() : "";
  };
  const findTags = (tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g"))].map((match) => match[1].trim());
  const cStats = findTags("cStat");
  const motivos = findTags("xMotivo");
  const protocolos = findTags("nProt");
  const chaves = findTags("chNFe");
  const recibos = findTags("nRec");
  const recebimentos = findTags("dhRecbto");
  const loteCStat = cStats[0] || "";
  const loteXMotivo = motivos[0] || "";
  const protCStat = cStats.length > 1 ? cStats[cStats.length - 1] : loteCStat;
  const protXMotivo = motivos.length > 1 ? motivos[motivos.length - 1] : loteXMotivo;
  const nProt = protocolos[protocolos.length - 1] || "";
  const chNFe = chaves[chaves.length - 1] || "";
  const nRec = recibos[recibos.length - 1] || "";
  const dhRecbto = recebimentos[recebimentos.length - 1] || "";
  return {
    cStat: protCStat || loteCStat,
    xMotivo: protXMotivo || loteXMotivo,
    loteCStat,
    loteXMotivo,
    protCStat,
    protXMotivo,
    cUF: findTag("cUF"),
    dhRecbto,
    nRec,
    prot: nProt,
    chNFe,
    autorizado: protCStat === "100",
    processado: loteCStat === "104",
    rawXml: xml
  };
}

function parseSefazEventoResponse(xmlText) {
  const xml = String(xmlText || "");
  const findTags = (tag) => [...xml.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g"))].map((match) => match[1].trim());
  const cStats = findTags("cStat");
  const motivos = findTags("xMotivo");
  const protocolos = findTags("nProt");
  const chaves = findTags("chNFe");
  const registros = findTags("dhRegEvento");
  const loteCStat = cStats[0] || "";
  const loteXMotivo = motivos[0] || "";
  const eventoCStat = cStats.length > 1 ? cStats[cStats.length - 1] : loteCStat;
  const eventoXMotivo = motivos.length > 1 ? motivos[motivos.length - 1] : loteXMotivo;
  const nProt = protocolos[protocolos.length - 1] || "";
  const chNFe = chaves[chaves.length - 1] || "";
  const dhRegEvento = registros[registros.length - 1] || "";
  const eventoRegistrado = ["135", "136", "155"].includes(eventoCStat);
  return {
    cStat: eventoCStat || loteCStat,
    xMotivo: eventoXMotivo || loteXMotivo,
    loteCStat,
    loteXMotivo,
    eventoCStat,
    eventoXMotivo,
    prot: nProt,
    chNFe,
    dhRegEvento,
    eventoRegistrado,
    rawXml: xml
  };
}

async function transmitirAutorizacaoPreview(payload, options = {}) {
  const cfg = getSefazConfig();
  const certificateBuffer = getCertificateBuffer(cfg.certificadoBase64);
  const xmlPreview = buildNfeXml(payload);
  const xmlDsigPreview = buildXmlDsigPreview(xmlPreview.xml, cfg);
  const lotePreview = buildLoteXml(xmlDsigPreview.signedXml || xmlPreview.xml);
  const autorizacaoPreview = buildAutorizacaoRequestPreview(payload, lotePreview);
  const allowTransmit = env("NFE_ENABLE_TRANSMIT") === "true" || options.force === true;

  if (!allowTransmit) {
    return {
      ok: false,
      mode: "transmit_disabled",
      message: "Transmissao real desabilitada. Defina NFE_ENABLE_TRANSMIT=true para habilitar.",
      autorizacaoPreview
    };
  }
  if (!autorizacaoPreview.url) {
    return {
      ok: false,
      mode: "endpoint_missing",
      message: "Endpoint de autorizacao nao mapeado para a UF/ambiente.",
      autorizacaoPreview
    };
  }

  try {
    const resp = await postSoapXml(autorizacaoPreview.url, {
      headers: autorizacaoPreview.headers,
      body: autorizacaoPreview.soapEnvelope,
      pfx: certificateBuffer.length ? certificateBuffer : undefined,
      passphrase: cfg.certificadoSenha || undefined,
      cert: cfg.certificadoPem || undefined,
      key: cfg.chavePrivadaPem || undefined
    });
    const parsed = parseSefazAutorizacaoResponse(resp.body);
    return {
      ok: resp.statusCode >= 200 && resp.statusCode < 300,
      mode: "sefaz_http_response",
      httpStatus: resp.statusCode,
      parsed,
      autorizacaoPreview
    };
  } catch (err) {
    return {
      ok: false,
      mode: "sefaz_fetch_error",
      message: err?.message || "Falha ao conectar com a SEFAZ.",
      errorName: err?.name || "",
      cause: err?.cause ? {
        message: err.cause.message || "",
        code: err.cause.code || "",
        name: err.cause.name || ""
      } : null,
      stack: String(err?.stack || "").split("\n").slice(0, 4),
      autorizacaoPreview
    };
  }
}

async function emitirNfeDireta(payload) {
  const cfg = getSefazConfig();
  const { missing } = validateSefazConfig(cfg);
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

  const transmitResult = await transmitirAutorizacaoPreview(payload, { force: true });
  return {
    ...transmitResult,
    ambiente: cfg.ambiente,
    preview: payload,
    certificate,
    xmlPreview,
    signaturePreview,
    xmlDsigPreview,
    lotePreview,
    autorizacaoPreview
  };
}

async function transmitirCancelamentoEvento(nota = {}, motivo = "", options = {}) {
  const cfg = getSefazConfig();
  const certificateBuffer = getCertificateBuffer(cfg.certificadoBase64);
  const payload = buildCancelamentoPayload(nota, motivo);
  const xmlPreview = buildCancelamentoXml(payload);
  const xmlDsigPreview = buildEventoDsigPreview(xmlPreview.xml, cfg);
  const signedEventoPreview = {
    ...xmlPreview,
    xml: xmlDsigPreview.signedXml || xmlPreview.xml
  };
  const requestPreview = buildCancelamentoRequestPreview(payload, signedEventoPreview);
  const allowTransmit = env("NFE_ENABLE_TRANSMIT") === "true" || options.force === true;

  if (!allowTransmit) {
    return {
      ok: false,
      mode: "transmit_disabled",
      message: "Transmissao real desabilitada. Defina NFE_ENABLE_TRANSMIT=true para habilitar.",
      payload,
      xmlPreview: signedEventoPreview,
      xmlDsigPreview,
      requestPreview
    };
  }
  if (!requestPreview.url) {
    return {
      ok: false,
      mode: "endpoint_missing",
      message: "Endpoint de evento nao mapeado para a UF/ambiente.",
      payload,
      xmlPreview: signedEventoPreview,
      xmlDsigPreview,
      requestPreview
    };
  }

  try {
    const resp = await postSoapXml(requestPreview.url, {
      headers: requestPreview.headers,
      body: requestPreview.soapEnvelope,
      pfx: certificateBuffer.length ? certificateBuffer : undefined,
      passphrase: cfg.certificadoSenha || undefined,
      cert: cfg.certificadoPem || undefined,
      key: cfg.chavePrivadaPem || undefined
    });
    const parsed = parseSefazEventoResponse(resp.body);
    return {
      ok: resp.statusCode >= 200 && resp.statusCode < 300 && parsed.eventoRegistrado,
      mode: "sefaz_evento_response",
      httpStatus: resp.statusCode,
      parsed,
      payload,
      xmlPreview: signedEventoPreview,
      xmlDsigPreview,
      requestPreview
    };
  } catch (err) {
    return {
      ok: false,
      mode: "sefaz_evento_fetch_error",
      message: err?.message || "Falha ao conectar com a SEFAZ para cancelamento.",
      errorName: err?.name || "",
      cause: err?.cause ? {
        message: err.cause.message || "",
        code: err.cause.code || "",
        name: err.cause.name || ""
      } : null,
      payload,
      xmlPreview: signedEventoPreview,
      xmlDsigPreview,
      requestPreview
    };
  }
}

async function inutilizarFaixa(anoRef, serie, nfInicio, nfFim, justificativa, options = {}) {
  const cfg = getSefazConfig();
  const cnpj = sanitizeDigits(cfg.cnpjEmitente);
  const ano = String(anoRef).slice(-2);
  const serieStr = String(serie).padStart(3, "0");
  const nfIni = String(nfInicio).padStart(9, "0");
  const nfFn = String(nfFim).padStart(9, "0");
  const idTag = `ID${cfg.uf === "MG" ? "31" : "31"}${ano}${cnpj}55${serieStr}${nfIni}${nfFn}`;
  const tpAmb = cfg.ambiente === "producao" ? "1" : "2";
  const just = onlyAscii(String(justificativa || "Numeracao inutilizada por falha em sistema")).slice(0, 255);

  const xmlInf = `<infInut Id="${idTag}"><tpAmb>${tpAmb}</tpAmb><xServ>INUTILIZAR</xServ><cUF>31</cUF><ano>${ano}</ano><CNPJ>${cnpj}</CNPJ><mod>55</mod><serie>${parseInt(serie)}</serie><nNFIni>${parseInt(nfInicio)}</nNFIni><nNFFin>${parseInt(nfFim)}</nNFFin><xJust>${xmlEscape(just)}</xJust></infInut>`;
  const xmlInut = `<?xml version="1.0" encoding="UTF-8"?><inutNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">${xmlInf}</inutNFe>`;

  // Assinar
  let signedXml = xmlInut;
  try {
    const certPem = cfg.certificadoPem;
    const keyPem = cfg.chavePrivadaPem;
    if (certPem && keyPem) {
      const signer = new SignedXml({ privateKey: keyPem, publicCert: certPem, canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315", signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1" });
      signer.addReference({ xpath: "//*[local-name(.)='infInut']", digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1", transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"] });
      signer.computeSignature(xmlInut, { location: { reference: "//*[local-name(.)='inutNFe']", action: "append" } });
      signedXml = signer.getSignedXml();
    }
  } catch (e) { console.warn("[inutilizar] Assinatura falhou:", e.message); }

  const soapEnvelope = `<?xml version="1.0" encoding="utf-8"?><soap12:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap12="http://www.w3.org/2003/05/soap-envelope"><soap12:Body><nfeDadosMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4">${signedXml}</nfeDadosMsg></soap12:Body></soap12:Envelope>`;

  const url = (SEFAZ_INUTILIZACAO[cfg.uf] || {})[cfg.ambiente];
  if (!url) return { ok: false, message: "Endpoint inutilizacao nao encontrado para " + cfg.uf + "/" + cfg.ambiente };

  const allowTransmit = env("NFE_ENABLE_TRANSMIT") === "true" || options.force === true;
  if (!allowTransmit) return { ok: false, mode: "transmit_disabled", message: "Transmissao desabilitada." };

  const certificateBuffer = getCertificateBuffer(cfg.certificadoBase64);
  try {
    const resp = await postSoapXml(url, {
      headers: { "Content-Type": "application/soap+xml;charset=UTF-8", "SOAPAction": "http://www.portalfiscal.inf.br/nfe/wsdl/NFeInutilizacao4/nfeInutilizacaoNF" },
      body: soapEnvelope,
      pfx: certificateBuffer.length ? certificateBuffer : undefined,
      passphrase: cfg.certificadoSenha || undefined,
      cert: cfg.certificadoPem || undefined,
      key: cfg.chavePrivadaPem || undefined
    });
    const cStat = (resp.body.match(/<cStat>(\d+)<\/cStat>/) || [])[1] || "";
    const xMotivo = (resp.body.match(/<xMotivo>([^<]*)<\/xMotivo>/) || [])[1] || "";
    const nProt = (resp.body.match(/<nProt>(\d+)<\/nProt>/) || [])[1] || "";
    return { ok: cStat === "102", cStat, xMotivo, protocolo: nProt, faixa: `${nfInicio}-${nfFim}`, rawXml: resp.body };
  } catch (err) {
    return { ok: false, message: err.message, error: err.name };
  }
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
  buildEventoDsigPreview,
  buildLoteXml,
  getSefazAutorizacaoUrl,
  buildAutorizacaoSoapEnvelope,
  buildAutorizacaoRequestPreview,
  buildCancelamentoPayload,
  buildCancelamentoXml,
  buildCancelamentoRequestPreview,
  getSefazEventoUrl,
  parseSefazAutorizacaoResponse,
  parseSefazEventoResponse,
  transmitirAutorizacaoPreview,
  emitirNfeDireta,
  transmitirCancelamentoEvento,
  inutilizarFaixa
};
