/**
 * retry-sefaz.js
 *
 * Polls SEFAZ DistribuicaoDFe with retry logic for rate-limiting (cStat 656).
 * Searches returned documents for NF numbers 1240 and 1241.
 * If found, updates Supabase notas_fiscais with chave_acesso and protocolo.
 *
 * Required environment variables:
 *   NFE_CERT_PFX_PATH   - Absolute path to the .pfx certificate file
 *   NFE_CERT_PASSWORD    - Password for the .pfx certificate
 *   NFE_EMITENTE_CNPJ    - CNPJ of the emitente (14 digits)
 *   SUPABASE_URL         - Supabase project URL (e.g. https://xxx.supabase.co)
 *   SUPABASE_SERVICE_KEY  - Supabase service role key
 *
 * Optional:
 *   NFE_SEFAZ_UF_CODE    - UF code (default: "31" for MG)
 *   NFE_INITIAL_NSU      - Starting NSU for pagination (default: "000000000001326")
 *   NFE_EMPRESA_ID       - Empresa ID for Supabase filter (default: "LARIUCCI")
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// --- Env var validation ---
const REQUIRED_ENV = [
  "NFE_CERT_PFX_PATH",
  "NFE_CERT_PASSWORD",
  "NFE_EMITENTE_CNPJ",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_KEY"
];
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error("FATAL: Missing required environment variables:");
  missingEnv.forEach((key) => console.error(`  - ${key}`));
  console.error("\nSet them before running this script. Example:");
  console.error('  NFE_CERT_PFX_PATH="/path/to/cert.pfx" NFE_CERT_PASSWORD="xxx" \\');
  console.error('  NFE_EMITENTE_CNPJ="00000000000000" SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_KEY="eyJ..." node retry-sefaz.js');
  process.exit(1);
}

// --- Configuration ---
const SEFAZ_URL = "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx";
const PFX_PATH = process.env.NFE_CERT_PFX_PATH;
const PFX_PASSWORD = process.env.NFE_CERT_PASSWORD;
const CNPJ = process.env.NFE_EMITENTE_CNPJ;
const UF_CODE = process.env.NFE_SEFAZ_UF_CODE || "31"; // MG
const INITIAL_NSU = process.env.NFE_INITIAL_NSU || "000000000001326";

const MAX_ATTEMPTS = 12;
const WAIT_MS = 5 * 60 * 1000; // 5 minutes

const TARGET_NFS = [1240, 1241];

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const EMPRESA_ID = process.env.NFE_EMPRESA_ID || "LARIUCCI";

// --- Helpers ---

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function padNSU(nsu) {
  return String(nsu).padStart(15, "0");
}

function buildSoapEnvelope(ultNSU) {
  return `<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
<soap12:Body>
<nfeDistDFeInteresse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
<nfeDadosMsg>
<distDFeInt versao="1.01" xmlns="http://www.portalfiscal.inf.br/nfe">
<tpAmb>1</tpAmb><cUFAutor>${UF_CODE}</cUFAutor><CNPJ>${CNPJ}</CNPJ>
<distNSU><ultNSU>${padNSU(ultNSU)}</ultNSU></distNSU>
</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>
</soap12:Body></soap12:Envelope>`;
}

function callSefaz(soapBody) {
  return new Promise((resolve, reject) => {
    const pfxBuffer = fs.readFileSync(PFX_PATH);
    const url = new URL(SEFAZ_URL);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: "POST",
      pfx: pfxBuffer,
      passphrase: PFX_PASSWORD,
      headers: {
        "Content-Type": "application/soap+xml; charset=utf-8",
        "Content-Length": Buffer.byteLength(soapBody, "utf8"),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve(body);
      });
    });

    req.on("error", (err) => reject(err));
    req.write(soapBody);
    req.end();
  });
}

function extractTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : null;
}

function extractAllTags(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  const results = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function decompressDocZip(base64Data) {
  try {
    const buf = Buffer.from(base64Data, "base64");
    const decompressed = zlib.gunzipSync(buf);
    return decompressed.toString("utf8");
  } catch (err) {
    console.error("  [WARN] Failed to decompress docZip:", err.message);
    return null;
  }
}

function extractNFNumber(xmlDoc) {
  // Try <nNF> tag
  const nNF = extractTag(xmlDoc, "nNF");
  if (nNF) return parseInt(nNF, 10);
  return null;
}

function extractChaveAcesso(xmlDoc) {
  // Try <chNFe> first
  let chave = extractTag(xmlDoc, "chNFe");
  if (chave) return chave.trim();
  // Try <infNFe Id="NFe...">
  const idMatch = xmlDoc.match(/Id="NFe(\d{44})"/);
  if (idMatch) return idMatch[1];
  return null;
}

function extractProtocolo(xmlDoc) {
  const nProt = extractTag(xmlDoc, "nProt");
  if (nProt) return nProt.trim();
  return null;
}

async function updateSupabase(nfNumber, chaveAcesso, protocolo) {
  const patchUrl = `${SUPABASE_URL}/rest/v1/notas_fiscais?numero=eq.${nfNumber}&empresa_id=eq.${EMPRESA_ID}`;
  const body = JSON.stringify({
    chave_acesso: chaveAcesso,
    protocolo: protocolo,
    sefaz: {
      chaveAcesso: chaveAcesso,
      protocolo: protocolo,
      status: "autorizada",
    },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(patchUrl);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal",
        "Content-Length": Buffer.byteLength(body, "utf8"),
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const responseBody = Buffer.concat(chunks).toString("utf8");
        console.log(`  Supabase PATCH NF ${nfNumber}: status ${res.statusCode}`, responseBody || "(empty)");
        resolve(res.statusCode);
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// --- Main ---

async function main() {
  console.log("=== SEFAZ DistribuicaoDFe Retry Script ===");
  console.log(`PFX: ${PFX_PATH}`);
  console.log(`CNPJ: ${CNPJ} | UF: ${UF_CODE} | Initial ultNSU: ${INITIAL_NSU}`);
  console.log(`Target NFs: ${TARGET_NFS.join(", ")}`);
  console.log(`Max attempts: ${MAX_ATTEMPTS} (${MAX_ATTEMPTS * 5} min total)\n`);

  // Verify PFX exists
  if (!fs.existsSync(PFX_PATH)) {
    console.error("FATAL: PFX file not found at:", PFX_PATH);
    process.exit(1);
  }

  const foundNFs = {}; // { 1240: { chave, protocolo }, ... }
  let currentNSU = INITIAL_NSU;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (attempt > 1) {
      console.log(`\nWaiting 5 minutes before attempt ${attempt}...`);
      await sleep(WAIT_MS);
    }

    console.log(`\n--- Attempt ${attempt}/${MAX_ATTEMPTS} | ${new Date().toISOString()} ---`);
    console.log(`Querying ultNSU=${padNSU(currentNSU)}`);

    let responseXml;
    try {
      const soap = buildSoapEnvelope(currentNSU);
      responseXml = await callSefaz(soap);
    } catch (err) {
      console.error(`  ERROR calling SEFAZ: ${err.message}`);
      continue;
    }

    // Extract cStat
    const cStat = extractTag(responseXml, "cStat");
    const xMotivo = extractTag(responseXml, "xMotivo");
    console.log(`  cStat=${cStat} | xMotivo=${xMotivo}`);

    if (cStat === "656") {
      console.log("  Rate-limited (656). Will retry...");
      continue;
    }

    if (cStat === "137" || cStat === "138") {
      // 137 = no more docs, 138 = docs found
      const maxNSU = extractTag(responseXml, "maxNSU");
      const ultNSUResp = extractTag(responseXml, "ultNSU");
      console.log(`  maxNSU=${maxNSU} | ultNSU(response)=${ultNSUResp}`);

      // Extract all docZip entries
      const docZips = extractAllTags(responseXml, "docZip");
      console.log(`  Found ${docZips.length} docZip entries`);

      for (let i = 0; i < docZips.length; i++) {
        const rawDoc = decompressDocZip(docZips[i]);
        if (!rawDoc) continue;

        const nNF = extractNFNumber(rawDoc);
        if (nNF && TARGET_NFS.includes(nNF)) {
          const chave = extractChaveAcesso(rawDoc);
          const prot = extractProtocolo(rawDoc);
          console.log(`\n  >>> FOUND NF ${nNF}!`);
          console.log(`      Chave de Acesso: ${chave}`);
          console.log(`      Protocolo: ${prot}`);
          foundNFs[nNF] = { chave, protocolo: prot };
        }
      }

      // If we found all target NFs, stop
      if (TARGET_NFS.every(nf => foundNFs[nf])) {
        console.log("\n  All target NFs found!");
        break;
      }

      // Paginate: if there are more docs (ultNSU < maxNSU), update NSU and query again immediately
      if (ultNSUResp && maxNSU && parseInt(ultNSUResp) < parseInt(maxNSU)) {
        currentNSU = ultNSUResp;
        console.log(`  More docs available. Continuing from NSU ${currentNSU}...`);
        // Don't count this as a rate-limited retry; loop back without waiting
        attempt--; // compensate the increment
        // Small delay to avoid hammering
        await sleep(2000);
        continue;
      }

      if (cStat === "137") {
        console.log("  No more documents from SEFAZ (cStat 137).");
        // Still might need to wait for new docs to appear
        if (!TARGET_NFS.every(nf => foundNFs[nf])) {
          console.log("  Not all NFs found yet. Will retry after wait...");
          continue;
        }
      }
    } else {
      console.log(`  Unexpected cStat=${cStat}. Full response (first 2000 chars):`);
      console.log(responseXml.substring(0, 2000));
      continue;
    }
  }

  // --- Results ---
  console.log("\n\n=== RESULTS ===");
  const foundKeys = Object.keys(foundNFs);
  if (foundKeys.length === 0) {
    console.log("No target NFs were found in SEFAZ responses.");
    console.log("The NFs may not have been distributed yet. Try again later.");
    process.exit(0);
  }

  for (const nf of foundKeys) {
    const data = foundNFs[nf];
    console.log(`\nNF ${nf}:`);
    console.log(`  Chave de Acesso: ${data.chave}`);
    console.log(`  Protocolo:       ${data.protocolo}`);
  }

  // --- Update Supabase ---
  console.log("\n\n=== UPDATING SUPABASE ===");
  for (const nf of foundKeys) {
    const data = foundNFs[nf];
    if (!data.chave || !data.protocolo) {
      console.log(`  Skipping NF ${nf}: missing chave or protocolo`);
      continue;
    }
    try {
      await updateSupabase(parseInt(nf), data.chave, data.protocolo);
    } catch (err) {
      console.error(`  ERROR updating NF ${nf} in Supabase: ${err.message}`);
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
