const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const OUTPUT_PATH = path.join(process.cwd(), "dashboard", "data", "quotes.json");
const TERRITORY_MAP_PATH = path.join(process.cwd(), "dashboard", "data", "school-territory-map.json");
const TODAY = new Date("2026-03-02T00:00:00");

function parseDateBR(raw) {
  const [d, m, y] = String(raw || "").split("/");
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function normalizeStatus(rawStatus, prazoIso) {
  const status = String(rawStatus || "").toLowerCase();
  if (status.includes("encerrado") || status.includes("cancelado")) return "encerrado";
  if (!prazoIso) return "aberto";
  const prazo = new Date(`${prazoIso}T00:00:00`);
  const days = Math.ceil((prazo.getTime() - TODAY.getTime()) / 86400000);
  if (days <= 2) return "prazo_critico";
  return "aberto";
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_e) {
    return fallback;
  }
}

function normalizeText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function inferSREFromCityFallback(city) {
  const map = {
    "Belo Horizonte": "SRE Metropolitana B",
    Contagem: "SRE Metropolitana C",
    Curvelo: "SRE Curvelo",
    Uberlandia: "SRE Uberlandia",
    Varginha: "SRE Varginha",
  };
  return map[city] || "SRE Nao mapeada";
}

const OBJECT_RULES = [
  {
    label: "Alimentacao escolar e merenda",
    keywords: ["arroz", "feijao", "macarrao", "acucar", "oleo", "merenda", "alimento", "biscoito", "leite"],
  },
  {
    label: "Material de limpeza e higiene",
    keywords: ["detergente", "sabao", "agua sanitaria", "alcool", "higiene", "limpeza", "papel higienico"],
  },
  {
    label: "Material de escritorio e consumo",
    keywords: ["caneta", "lapis", "papel a4", "caderno", "escritorio", "toner", "cartucho", "consumo"],
  },
  {
    label: "Pereciveis e hortifrutigranjeiros",
    keywords: ["fruta", "verdura", "legume", "hortifruti", "carne", "frango", "perecivel"],
  },
];

function inferTerritory(row, territoryMap) {
  const schoolKey = normalizeText(row.escola);
  const exact = territoryMap[schoolKey];
  if (exact) {
    return {
      municipio: exact.municipio || "Nao mapeado",
      sre: exact.sre || inferSREFromCityFallback(exact.municipio || ""),
      confiancaTerritorio: "alta",
    };
  }

  const partialKey = Object.keys(territoryMap).find((k) => schoolKey.includes(k) || k.includes(schoolKey));
  if (partialKey) {
    const ref = territoryMap[partialKey];
    return {
      municipio: ref.municipio || "Nao mapeado",
      sre: ref.sre || inferSREFromCityFallback(ref.municipio || ""),
      confiancaTerritorio: "media",
    };
  }

  const fallbackCity = "Nao mapeado";
  return {
    municipio: fallbackCity,
    sre: inferSREFromCityFallback(fallbackCity),
    confiancaTerritorio: "baixa",
  };
}

function inferObject(row) {
  const text = normalizeText([row.escola, row.objectRaw].filter(Boolean).join(" "));
  let best = { label: "Objeto nao identificado", hits: 0 };

  for (const rule of OBJECT_RULES) {
    const hits = rule.keywords.reduce((acc, k) => acc + (text.includes(k) ? 1 : 0), 0);
    if (hits > best.hits) best = { label: rule.label, hits };
  }

  if (best.hits >= 2) return { objeto: best.label, confiancaObjeto: "alta" };
  if (best.hits === 1) return { objeto: best.label, confiancaObjeto: "media" };
  return { objeto: "Objeto nao identificado", confiancaObjeto: "baixa" };
}

function estimateCostFromId(id) {
  const tail = Number(String(id).slice(-3)) || 150;
  return 4000 + tail * 23;
}

function suggestPrice(cost) {
  return Number((cost * 1.22).toFixed(2));
}

async function run() {
  const cnpj = process.env.SGD_CNPJ;
  const pass = process.env.SGD_PASS;

  if (!cnpj || !pass) {
    console.error("Defina SGD_CNPJ e SGD_PASS nas variaveis de ambiente.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto("https://caixaescolar.educacao.mg.gov.br/selecionar-perfil", {
      waitUntil: "domcontentloaded",
      timeout: 120000,
    });
    await page.getByText("Fornecedor", { exact: true }).first().click();
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/login\?profile=FORN/, { timeout: 20000 });

    await page
      .locator(
        'input[placeholder*="CNPJ" i], input[placeholder*="CPF" i], input[name*="cpf" i], input[name*="cnpj" i], input[id*="cpf" i], input[id*="cnpj" i]'
      )
      .first()
      .fill(cnpj);
    await page
      .locator('input[type="password"], input[name*="senha" i], input[id*="senha" i]')
      .first()
      .fill(pass);

    await Promise.allSettled([
      page.waitForLoadState("networkidle", { timeout: 30000 }),
      page
        .locator('button:has-text("Entrar"), button[type="submit"], input[type="submit"]')
        .first()
        .click(),
    ]);

    await page.goto("https://caixaescolar.educacao.mg.gov.br/compras/orcamentos", {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForTimeout(1400);

    const rows = await page.$$eval("table tbody tr", (trs) =>
      trs.map((tr) => {
        const tds = Array.from(tr.querySelectorAll("td")).map((td) =>
          (td.textContent || "").trim().replace(/\s+/g, " ")
        );
        return {
          id: tds[0] || "",
          ano: tds[1] || "",
          escola: tds[2] || "",
          prazo: tds[3] || "",
          statusRaw: tds[4] || "",
          objectRaw: tds[5] || "",
        };
      })
    );

    const territoryMap = readJson(TERRITORY_MAP_PATH, {});

    const mapped = rows
      .filter((r) => r.id && r.escola)
      .map((r) => {
        const prazoIso = parseDateBR(r.prazo);
        const territory = inferTerritory(r, territoryMap);
        const custoEstimado = estimateCostFromId(r.id);
        const obj = inferObject(r);
        return {
          id: r.id,
          escola: r.escola,
          municipio: territory.municipio,
          sre: territory.sre,
          confiancaTerritorio: territory.confiancaTerritorio,
          objeto: obj.objeto,
          confiancaObjeto: obj.confiancaObjeto,
          prazo: prazoIso || "2026-03-31",
          status: normalizeStatus(r.statusRaw, prazoIso),
          custoEstimado,
          precoSugerido: suggestPrice(custoEstimado),
        };
      });

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(mapped, null, 2), "utf8");
    console.log(`Coleta concluida. ${mapped.length} cotacoes em ${OUTPUT_PATH}`);
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error("Falha na coleta:", err.message);
  process.exit(1);
});
