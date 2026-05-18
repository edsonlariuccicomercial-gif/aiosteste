/**
 * consulta-sefaz.js
 *
 * Queries SEFAZ DistribuicaoDFe for NF documents.
 *
 * Required environment variables:
 *   NFE_CERT_PFX_PATH  - Absolute path to the .pfx certificate file
 *   NFE_CERT_PASSWORD   - Password for the .pfx certificate
 *   NFE_EMITENTE_CNPJ   - CNPJ of the emitente (14 digits)
 *
 * Optional:
 *   NFE_SEFAZ_UF_CODE   - UF code (default: "31" for MG)
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// --- Env var validation ---
const REQUIRED_ENV = ["NFE_CERT_PFX_PATH", "NFE_CERT_PASSWORD", "NFE_EMITENTE_CNPJ"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
  console.error("FATAL: Missing required environment variables:");
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error("\nSet them before running this script. Example:");
  console.error('  NFE_CERT_PFX_PATH="/path/to/cert.pfx" NFE_CERT_PASSWORD="xxx" NFE_EMITENTE_CNPJ="00000000000000" node consulta-sefaz.js');
  process.exit(1);
}

const PFX_PATH = process.env.NFE_CERT_PFX_PATH;
const PFX_PASS = process.env.NFE_CERT_PASSWORD;
const CNPJ = process.env.NFE_EMITENTE_CNPJ;
const UF = process.env.NFE_SEFAZ_UF_CODE || "31"; // MG

// Endpoint Ambiente Nacional - Producao
const URL_DIST = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";

function buildDistDFeSOAP(ultNSU) {
  const nsu = String(ultNSU).padStart(15, "0");
  return `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
      <nfeDadosMsg>
        <distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
          <tpAmb>1</tpAmb>
          <cUFAutor>${UF}</cUFAutor>
          <CNPJ>${CNPJ}</CNPJ>
          <distNSU>
            <ultNSU>${nsu}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>`;
}

function postSOAP(url, body) {
  return new Promise((resolve, reject) => {
    const pfx = fs.readFileSync(PFX_PATH);
    const buf = Buffer.from(body, "utf8");
    const req = https.request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Content-Length": buf.length
      },
      pfx,
      passphrase: PFX_PASS,
      minVersion: "TLSv1.2",
      rejectUnauthorized: true
    }, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", c => raw += c);
      res.on("end", () => resolve({ status: res.statusCode, body: raw }));
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "g");
  const matches = [];
  let m;
  while ((m = re.exec(xml)) !== null) matches.push(m[1]);
  return matches;
}

async function main() {
  console.log("Consultando SEFAZ DistribuicaoDFe...");
  console.log("PFX:", PFX_PATH);
  console.log("CNPJ:", CNPJ);

  let ultNSU = 0;
  let maxNSU = 0;
  let found1240 = null;
  let found1241 = null;
  let attempts = 0;

  do {
    attempts++;
    const soap = buildDistDFeSOAP(ultNSU);
    const resp = await postSOAP(URL_DIST, soap);

    if (resp.status !== 200) {
      console.log("HTTP Error:", resp.status);
      console.log(resp.body.substring(0, 500));
      break;
    }

    const cStat = (extractTag(resp.body, "cStat")[0] || "").trim();
    const xMotivo = (extractTag(resp.body, "xMotivo")[0] || "").trim();
    maxNSU = parseInt(extractTag(resp.body, "maxNSU")[0] || "0");
    const ultNSUResp = parseInt(extractTag(resp.body, "ultNSU")[0] || "0");

    console.log(`\nAttempt ${attempts} | cStat: ${cStat} | ${xMotivo} | ultNSU: ${ultNSUResp} | maxNSU: ${maxNSU}`);

    if (cStat === "137" || cStat === "656") {
      console.log("Nenhum documento encontrado neste range.");
      break;
    }

    // Extract docZip entries (gzipped XML)
    const docs = extractTag(resp.body, "docZip");
    const nsus = extractTag(resp.body, "NSU") || [];
    const schemas = resp.body.match(/schema="([^"]+)"/g) || [];

    console.log(`Docs encontrados: ${docs.length}`);

    for (let i = 0; i < docs.length; i++) {
      try {
        const gzBuf = Buffer.from(docs[i], "base64");
        const xml = zlib.gunzipSync(gzBuf).toString("utf8");

        // Check if this is NF 1240 or 1241
        if (xml.includes("<nNF>1240</nNF>") || xml.includes("<nNF>1241</nNF>")) {
          const chave = extractTag(xml, "chNFe")[0] || extractTag(xml, "chave")[0] || "";
          const nNF = extractTag(xml, "nNF")[0] || "";
          const proto = extractTag(xml, "nProt")[0] || "";
          console.log(`\n*** ENCONTRADA NF ${nNF} ***`);
          console.log(`Chave: ${chave}`);
          console.log(`Protocolo: ${proto}`);

          if (nNF === "1240") found1240 = { chave, proto, xml: xml.substring(0, 500) };
          if (nNF === "1241") found1241 = { chave, proto, xml: xml.substring(0, 500) };
        }
      } catch (e) {
        // might not be gzip, try plain
      }
    }

    if (found1240 && found1241) break;

    ultNSU = ultNSUResp;
    if (ultNSU >= maxNSU || attempts > 20) break;

  } while (true);

  console.log("\n\n========== RESULTADO ==========");
  if (found1240) {
    console.log("NF 1240:");
    console.log("  Chave:", found1240.chave);
    console.log("  Protocolo:", found1240.proto);
  } else {
    console.log("NF 1240: NAO ENCONTRADA");
  }
  if (found1241) {
    console.log("NF 1241:");
    console.log("  Chave:", found1241.chave);
    console.log("  Protocolo:", found1241.proto);
  } else {
    console.log("NF 1241: NAO ENCONTRADA");
  }
}

main().catch(e => console.error("ERRO:", e.message));
