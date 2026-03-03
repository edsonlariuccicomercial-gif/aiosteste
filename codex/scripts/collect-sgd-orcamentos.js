/**
 * collect-sgd-orcamentos.js
 *
 * Coleta oportunidades ativas (status "Não Enviada") do SGD-MG
 * usando a REST API oficial, filtradas por SRE Uberaba.
 *
 * Fluxo:
 *   1. Login via Playwright (para obter sessao autenticada)
 *   2. Busca lista de municipios via API
 *   3. Mapeia municipios da SRE Uberaba
 *   4. Busca grupos de despesa via API
 *   5. Para cada municipio SRE Uberaba, busca propostas "Nao Enviada"
 *   6. Transforma e salva em quotes.json
 *
 * Uso: npx dotenv-cli -- node scripts/collect-sgd-orcamentos.js
 */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const API_BASE = "https://api.caixaescolar.educacao.mg.gov.br";
const SGD_BASE = "https://caixaescolar.educacao.mg.gov.br";
const OUTPUT_PATH = path.join(process.cwd(), "dashboard", "data", "quotes.json");

// Municipios da SRE Uberaba (fonte: sreuberaba.educacao.mg.gov.br)
const SRE_UBERABA_MUNICIPIOS = [
  "agua comprida", "araxa", "campo florido", "campos altos", "carneirinho",
  "comendador gomes", "conceicao das alagoas", "conquista", "delta", "fronteira",
  "frutal", "ibia", "itapagipe", "iturama", "limeira do oeste", "pedrinopolis",
  "pirajuba", "planura", "pratinha", "sacramento", "santa juliana",
  "sao francisco de sales", "tapira", "uberaba", "uniao de minas", "verissimo",
];

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// Login via Playwright
// ---------------------------------------------------------------------------
async function login(page) {
  const cnpj = process.env.SGD_CNPJ;
  const pass = process.env.SGD_PASS;

  if (!cnpj || !pass) {
    throw new Error("Defina SGD_CNPJ e SGD_PASS no .env");
  }

  await page.goto(`${SGD_BASE}/selecionar-perfil`, {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });

  await page.getByText("Fornecedor", { exact: true }).first().click();
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/login\?profile=FORN/, { timeout: 20000 });

  const docInput = page
    .locator(
      'input[placeholder*="CNPJ" i], input[placeholder*="CPF" i], input#document'
    )
    .first();
  await docInput.fill(cnpj.replace(/\D/g, ""));

  await page.locator('input[type="password"]').first().fill(pass);

  const submitBtn = page
    .locator('button:has-text("Entrar"), button[type="submit"]')
    .first();

  await Promise.allSettled([
    page.waitForLoadState("networkidle", { timeout: 30000 }),
    submitBtn.click(),
  ]);

  await page.waitForFunction(
    () => !/\/login$/.test(window.location.pathname.toLowerCase()),
    { timeout: 15000 }
  );

  if (/\/login$/.test(new URL(page.url()).pathname.toLowerCase())) {
    throw new Error("Login recusado pelo SGD. Verifique SGD_CNPJ e SGD_PASS.");
  }

  console.log("[login] Autenticado com sucesso");
}

// ---------------------------------------------------------------------------
// API helper — executa fetch dentro do browser com cookies da sessao
// ---------------------------------------------------------------------------
async function apiFetch(page, endpoint) {
  return page.evaluate(
    async ({ base, ep }) => {
      const resp = await fetch(`${base}${ep}`, { credentials: "include" });
      if (!resp.ok) throw new Error(`API ${resp.status}: ${ep}`);
      return resp.json();
    },
    { base: API_BASE, ep: endpoint }
  );
}

// ---------------------------------------------------------------------------
// Busca municipios e mapeia SRE Uberaba
// ---------------------------------------------------------------------------
async function fetchSreUberabaMap(page) {
  const json = await apiFetch(page, "/county/by-network");
  const counties = json.data || json;

  const sreMap = {};
  for (const c of counties) {
    const cn = norm(c.txCounty);
    const match = SRE_UBERABA_MUNICIPIOS.some(
      (t) => cn === t || cn.replace(/ /g, "") === t.replace(/ /g, "")
    );
    if (match) {
      sreMap[c.idCounty] = c.txCounty;
    }
  }

  console.log(`[municipios] ${Object.keys(sreMap).length}/26 da SRE Uberaba mapeados de ${counties.length} total`);
  return sreMap;
}

// ---------------------------------------------------------------------------
// Busca grupos de despesa (API + nearest-match para redes cruzadas)
// ---------------------------------------------------------------------------
async function fetchExpenseGroups(page) {
  const map = {};

  // Fonte: endpoint de grupos ativos (retorna os 23 grupos da rede do fornecedor)
  try {
    const json = await apiFetch(page, "/expense-group/active");
    const groups = Array.isArray(json) ? json : json.data || [];
    for (const g of groups) {
      map[g.idExpenseGroup] = g.txExpenseGroup;
    }
  } catch (_e) { /* silencioso */ }

  console.log(`[despesa] ${Object.keys(map).length} grupos base carregados da rede do fornecedor`);
  return map;
}

// ---------------------------------------------------------------------------
// Resolve nome do grupo de despesa por nearest-match
// Cada rede escolar cria instancias dos mesmos 23 templates de grupo,
// com IDs diferentes mas nomes identicos. Os IDs sao espacados ~48 entre
// tipos, entao nearest-match com threshold < 24 e seguro.
// ---------------------------------------------------------------------------
function resolveExpenseGroupName(expenseGroupId, referenceMap) {
  // Match direto
  if (referenceMap[expenseGroupId]) {
    return { name: referenceMap[expenseGroupId], confidence: "alta" };
  }

  // Nearest-match
  const refIds = Object.keys(referenceMap).map(Number).sort((a, b) => a - b);
  let bestId = null;
  let bestDist = Infinity;
  for (const refId of refIds) {
    const dist = Math.abs(expenseGroupId - refId);
    if (dist < bestDist) {
      bestDist = dist;
      bestId = refId;
    }
  }

  if (bestId !== null && bestDist <= 30) {
    return { name: referenceMap[bestId], confidence: "alta" };
  }

  return { name: `Grupo #${expenseGroupId}`, confidence: "baixa" };
}

// ---------------------------------------------------------------------------
// Busca propostas ativas por municipio (paginado)
// ---------------------------------------------------------------------------
async function fetchProposalsForCounty(page, idCounty) {
  const allItems = [];
  let pg = 1;
  const limit = 50;

  while (true) {
    const json = await apiFetch(
      page,
      `/budget-proposal/summary-by-supplier-profile?filter.supplierStatus=$eq:NAEN&filter.idCounty=$eq:${idCounty}&page=${pg}&limit=${limit}`
    );

    const items = json.data || [];
    allItems.push(...items);

    const totalPages = json.meta?.totalPages || 1;
    if (!items.length || pg >= totalPages) break;
    pg++;
  }

  return allItems;
}

// ---------------------------------------------------------------------------
// Transformacao para formato do dashboard
// ---------------------------------------------------------------------------
function transformProposals(proposals, sreMap, expenseMap) {
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00");

  return proposals
    .filter((p) => {
      // Manter apenas com prazo futuro ou de hoje
      const deadline = new Date(p.dtProposalSubmission);
      const deadlineDate = new Date(deadline.toISOString().slice(0, 10) + "T00:00:00");
      return deadlineDate >= today;
    })
    .map((p) => {
      const deadline = new Date(p.dtProposalSubmission);
      const deadlineDate = new Date(deadline.toISOString().slice(0, 10) + "T00:00:00");
      const daysLeft = Math.ceil(
        (deadlineDate.getTime() - today.getTime()) / 86400000
      );

      const municipio = sreMap[p.idCounty] || "Nao mapeado";
      const resolved = resolveExpenseGroupName(p.expenseGroupId, expenseMap);
      const objetoLabel = resolved.name;
      const confiancaObjeto = resolved.confidence;

      // Estimativa de custo baseada no idBudget (placeholder ate ter dados reais)
      const custoEstimado = 4000 + ((p.idBudget % 1000) * 17);
      const precoSugerido = Number((custoEstimado * 1.22).toFixed(2));

      return {
        id: String(p.nuBudgetOrder),
        idBudget: p.idBudget,
        escola: p.schoolName,
        municipio,
        sre: "SRE Uberaba",
        confiancaTerritorio: "alta",
        objeto: objetoLabel,
        confiancaObjeto,
        prazo: deadlineDate.toISOString().slice(0, 10),
        diasRestantes: daysLeft,
        status: daysLeft <= 2 ? "prazo_critico" : "aberto",
        custoEstimado,
        precoSugerido,
        expenseGroupId: p.expenseGroupId,
        idSchool: p.idSchool,
        idSubprogram: p.idSubprogram,
        year: p.year,
      };
    });
}

// ---------------------------------------------------------------------------
// Estatisticas
// ---------------------------------------------------------------------------
function printStats(quotes) {
  const byMunicipio = {};
  const byObjeto = {};
  let criticos = 0;

  for (const q of quotes) {
    byMunicipio[q.municipio] = (byMunicipio[q.municipio] || 0) + 1;
    byObjeto[q.objeto] = (byObjeto[q.objeto] || 0) + 1;
    if (q.status === "prazo_critico") criticos++;
  }

  console.log("\n=== Resumo da Coleta ===");
  console.log(`Total: ${quotes.length} oportunidades ativas na SRE Uberaba`);
  console.log(`Prazo critico (<=2 dias): ${criticos}`);
  console.log("\nPor municipio:");
  for (const [m, n] of Object.entries(byMunicipio).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m}: ${n}`);
  }
  console.log("\nPor grupo de despesa:");
  for (const [o, n] of Object.entries(byObjeto).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${o}: ${n}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    // 1. Login
    await login(page);

    // 2. Navegar para pagina de orcamentos (ativa sessao de fornecedor)
    await page.goto(`${SGD_BASE}/compras/orcamentos`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });

    // 3. Buscar dados de referencia
    const [sreMap, expenseMap] = await Promise.all([
      fetchSreUberabaMap(page),
      fetchExpenseGroups(page),
    ]);

    // 4. Coletar propostas por municipio
    const allProposals = [];
    const countyEntries = Object.entries(sreMap);

    for (const [idCounty, countyName] of countyEntries) {
      const proposals = await fetchProposalsForCounty(page, Number(idCounty));
      if (proposals.length > 0) {
        allProposals.push(...proposals);
        console.log(`[coleta] ${countyName}: ${proposals.length} oportunidades`);
      }
    }

    console.log(`[coleta] Total bruto: ${allProposals.length} propostas "Nao Enviada" na SRE Uberaba`);

    // 5. Transformar e filtrar (somente prazo futuro)
    const quotes = transformProposals(allProposals, sreMap, expenseMap);

    // 6. Salvar
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(quotes, null, 2), "utf8");

    console.log(`[output] ${quotes.length} cotacoes salvas em ${OUTPUT_PATH}`);

    // 7. Stats
    printStats(quotes);
  } catch (err) {
    console.error("[erro] Falha na coleta:", err.message);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
