const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const ROOT = process.cwd();
const DEFAULT_PAYLOAD_PATH = path.join(ROOT, "dashboard", "data", "sgd-prequote-payload.json");
const DEBUG_DIR = path.join(ROOT, ".aios", "sgd-audit-logged");

function parseArgs(argv) {
  const out = {
    payload: DEFAULT_PAYLOAD_PATH,
    submit: false,
    onlyBudget: "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--payload") out.payload = String(argv[i + 1] || out.payload);
    if (token === "--submit") out.submit = true;
    if (token === "--only-budget") out.onlyBudget = String(argv[i + 1] || "");
  }
  return out;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(raw);
  } catch (_e) {
    return fallback;
  }
}

function normalizeText(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function capture(page, prefix) {
  ensureDir(path.join(DEBUG_DIR, "noop"));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = path.join(DEBUG_DIR, `${prefix}-${stamp}`);
  try {
    await page.screenshot({ path: `${base}.png`, fullPage: true });
  } catch (_e) {}
  try {
    fs.writeFileSync(`${base}.html`, await page.content(), "utf8");
  } catch (_e) {}
  return base;
}

async function loginSgd(page) {
  const cnpj = process.env.SGD_CNPJ;
  const cpf = process.env.SGD_CPF;
  const docOverride = process.env.SGD_DOC;
  const pass = process.env.SGD_PASS;

  const hasAnyDoc = Boolean(String(docOverride || "").trim() || String(cnpj || "").trim() || String(cpf || "").trim());
  if (!hasAnyDoc || !pass) {
    throw new Error("Defina SGD_PASS e algum documento (SGD_DOC ou SGD_CNPJ ou SGD_CPF).");
  }

  await page.goto("https://caixaescolar.educacao.mg.gov.br/selecionar-perfil", {
    waitUntil: "domcontentloaded",
    timeout: 120000,
  });
  await page.getByText("Fornecedor", { exact: true }).first().click();
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/login\?profile=FORN/, { timeout: 20000 });

  const docInput = page.locator(
    'input[placeholder*="CNPJ" i], input[placeholder*="CPF" i], input[name*="cpf" i], input[name*="cnpj" i], input[id*="cpf" i], input[id*="cnpj" i], input#document'
  ).first();

  const docPlaceholder = normalizeText(await docInput.getAttribute("placeholder"));
  const defaultDoc = String(docOverride || cnpj).replace(/\D/g, "");
  const cpfDigits = String(cpf || "").replace(/\D/g, "");

  let docToUse = defaultDoc;
  if (docPlaceholder.includes("cpf") && cpfDigits.length === 11) {
    docToUse = cpfDigits;
  }

  await docInput.fill(docToUse);
  await page
    .locator('input[type="password"], input[name*="senha" i], input[id*="senha" i]')
    .first()
    .fill(pass);

  const submitBtn = page
    .locator('button:has-text("Entrar"), button[type="submit"], input[type="submit"]')
    .first();

  if ((await submitBtn.isDisabled()) && cpfDigits.length === 11 && docToUse !== cpfDigits) {
    await docInput.fill(cpfDigits);
  }

  await submitBtn.click();
  try {
    await page.waitForURL((url) => !url.pathname.toLowerCase().includes("/login"), { timeout: 30000 });
  } catch (_) {
    throw new Error("Autenticacao nao concluida em /login.");
  }
}

async function openBudgetList(page) {
  await page.goto("https://caixaescolar.educacao.mg.gov.br/compras/orcamentos", {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await page.waitForSelector("table tbody tr", { timeout: 30000 });
}

async function goToBudgetPage(page, budgetId) {
  const row = page.locator("table tbody tr", {
    has: page.locator("td", { hasText: String(budgetId) }),
  }).first();

  if (!(await row.count())) return false;
  const viewBtn = row.locator('button:has-text("Visualizar")').first();
  if (!(await viewBtn.count())) return false;

  await Promise.allSettled([
    page.waitForTimeout(400),
    viewBtn.click({ timeout: 10000 }),
  ]);
  return true;
}

async function fillProposalModal(page, proposal, doSubmit) {
  const modal = page.locator("ngb-modal-window, .modal.show, [role='dialog']").first();
  await modal.waitFor({ state: "visible", timeout: 15000 });

  const registerBtn = modal.locator('button:has-text("Cadastrar Proposta"), button:has-text("Editar")').first();
  if (await registerBtn.count()) {
    await registerBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);
  }

  const priceInputs = modal.locator(
    'input[type="number"], input[placeholder*="valor" i], input[placeholder*="preco" i], input[placeholder*="preço" i]'
  );
  const inputCount = await priceInputs.count();
  if (!inputCount) {
    return { ok: false, reason: "Nenhum input de preco encontrado no modal." };
  }

  const fillCount = Math.min(inputCount, proposal.items.length);
  for (let i = 0; i < fillCount; i += 1) {
    const target = priceInputs.nth(i);
    const value = Number(proposal.items[i].unitPrice || 0).toFixed(2);
    await target.fill(value).catch(() => {});
  }

  if (!doSubmit) {
    return { ok: true, reason: `Dry-run: ${fillCount} campo(s) preenchidos.` };
  }

  const saveBtn = modal.locator(
    'button:has-text("Salvar"), button:has-text("Enviar"), button:has-text("Confirmar"), button:has-text("Cadastrar Proposta")'
  ).first();
  if (!(await saveBtn.count())) {
    return { ok: false, reason: "Botao de envio/salvar nao encontrado." };
  }

  await Promise.allSettled([
    page.waitForLoadState("networkidle", { timeout: 10000 }),
    saveBtn.click({ timeout: 10000 }),
  ]);
  return { ok: true, reason: `Proposta enviada com ${fillCount} item(ns).` };
}

async function closeModal(page) {
  const modal = page.locator("ngb-modal-window, .modal.show, [role='dialog']").first();
  if (!(await modal.count())) return;
  const closeBtn = modal.locator(".btn-close, button:has-text('Fechar'), button:has-text('Cancelar')").first();
  if (await closeBtn.count()) {
    await closeBtn.click({ timeout: 5000 }).catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await modal.waitFor({ state: "hidden", timeout: 8000 }).catch(() => {});
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const payload = readJson(path.resolve(ROOT, args.payload), null);

  if (!payload || !Array.isArray(payload.proposals)) {
    console.error("Payload invalido. Gere antes com: npm.cmd run prequote:payload");
    process.exit(1);
  }

  const proposals = args.onlyBudget
    ? payload.proposals.filter((p) => String(p.budgetId) === String(args.onlyBudget))
    : payload.proposals;

  if (!proposals.length) {
    console.error("Nenhuma proposta para processar.");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const results = [];

  try {
    await loginSgd(page);
    await openBudgetList(page);

    for (const proposal of proposals) {
      const budgetId = String(proposal.budgetId || "");
      const itemCount = Array.isArray(proposal.items) ? proposal.items.length : 0;
      const result = {
        budgetId,
        ok: false,
        message: "",
        itemCount,
        mode: args.submit ? "submit" : "dry-run",
      };

      try {
        const found = await goToBudgetPage(page, budgetId);
        if (!found) {
          result.message = "Orcamento nao encontrado na listagem atual.";
          results.push(result);
          continue;
        }

        const fill = await fillProposalModal(page, proposal, args.submit);
        result.ok = Boolean(fill.ok);
        result.message = fill.reason || "";
        await capture(page, `sgd-prequote-${budgetId}-${result.ok ? "ok" : "fail"}`);
        await closeModal(page);
      } catch (e) {
        result.message = `Falha ao processar orcamento ${budgetId}: ${e.message}`;
        await capture(page, `sgd-prequote-${budgetId}-error`);
        await closeModal(page);
      }

      results.push(result);
      await page.waitForTimeout(350);
    }
  } finally {
    await browser.close();
  }

  const report = {
    generatedAt: new Date().toISOString(),
    payloadPath: path.relative(ROOT, path.resolve(ROOT, args.payload)),
    submit: args.submit,
    total: results.length,
    success: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
  const out = path.join(ROOT, "dashboard", "data", "sgd-prequote-submit-report.json");
  ensureDir(out);
  fs.writeFileSync(out, JSON.stringify(report, null, 2), "utf8");

  console.log(`Execucao concluida. Sucesso: ${report.success}/${report.total}`);
  console.log(`Relatorio: ${path.relative(ROOT, out)}`);
}

run().catch((err) => {
  console.error(`Falha na automacao de pre-cotacao SGD: ${err.message}`);
  process.exit(1);
});
