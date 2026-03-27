// GDP Integrations — standalone (sem dependência de xml-crypto)
// Transmissão SEFAZ real requer Node.js server com xml-crypto instalado.
// No Vercel serverless, esta function lida com config, preview e numeração.

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  const body = req.method === "POST" ? (req.body || {}) : {};
  const action = body.action || req.query?.action || "";

  try {
    // Config check
    if (action === "nfe-sefaz-config" || (req.method === "GET" && !action)) {
      return res.status(200).json({
        ok: true,
        ambiente: process.env.NFE_SEFAZ_AMBIENTE || "homologacao",
        cnpj: process.env.NFE_EMITENTE_CNPJ || "",
        razaoSocial: process.env.NFE_EMITENTE_RAZAO || "",
        fantasia: process.env.NFE_EMITENTE_FANTASIA || "",
        ie: process.env.NFE_EMITENTE_IE || "",
        certificado: !!(process.env.NFE_CERT_PEM),
        chavePrivada: !!(process.env.NFE_KEY_PEM),
        serie: process.env.NFE_SERIE_PADRAO || "1",
        numeroInicial: process.env.NFE_NUMERO_INICIAL || "1",
        transmissaoHabilitada: process.env.NFE_ENABLE_TRANSMIT === "true",
      });
    }

    // NF-e preview (gera dados sem transmitir)
    if (action === "nfe-sefaz-preview") {
      const pedido = body.pedido;
      const overrides = body.overrides || {};
      if (!pedido) return res.status(400).json({ ok: false, error: "pedido required" });

      const numero = overrides.numero || process.env.NFE_NUMERO_INICIAL || "1";
      const serie = overrides.serie || process.env.NFE_SERIE_PADRAO || "1";
      const cnpj = (process.env.NFE_EMITENTE_CNPJ || "").replace(/\D/g, "").padStart(14, "0");
      const uf = "31"; // MG
      const now = new Date();
      const aamm = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
      const cNF = String(Math.floor(Math.random() * 99999999)).padStart(8, "0");
      const chaveBase = `${uf}${aamm}${cnpj}55${serie.padStart(3, "0")}${numero.padStart(9, "0")}1${cNF}`;

      // Modulo 11 check digit
      let soma = 0, peso = 2;
      for (let i = chaveBase.length - 1; i >= 0; i--) {
        soma += parseInt(chaveBase[i]) * peso;
        peso = peso >= 9 ? 2 : peso + 1;
      }
      const dv = 11 - (soma % 11);
      const dvFinal = dv >= 10 ? 0 : dv;
      const chaveAcesso = chaveBase + dvFinal;

      return res.status(200).json({
        ok: true,
        preview: {
          numero, serie, chaveAcesso,
          identificacao: { numero, serie },
          emitente: {
            cnpj: process.env.NFE_EMITENTE_CNPJ,
            razaoSocial: process.env.NFE_EMITENTE_RAZAO,
            ie: process.env.NFE_EMITENTE_IE,
          },
        },
        xmlPreview: { accessKey: chaveAcesso, numero, serie },
        message: `NF-e #${numero} serie ${serie} — preview gerado (ambiente: ${process.env.NFE_SEFAZ_AMBIENTE || "homologacao"})`,
      });
    }

    // Transmissão real (requer xml-crypto — não disponível no Vercel serverless)
    if (action === "nfe-sefaz-emitir" || action === "nfe-sefaz-transmitir") {
      return res.status(200).json({
        ok: false,
        error: "Transmissão SEFAZ requer servidor dedicado com xml-crypto. Use o modo preview + emissão manual ou configure um servidor Node.js.",
        sugestao: "Configure o servidor local (node server.js) para transmissão real à SEFAZ.",
      });
    }

    return res.status(400).json({ ok: false, error: "Unknown action: " + action });
  } catch (err) {
    console.error("[gdp-integrations]", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
