const https = require("https");
const { SgdClient, BASE_URL } = require("./sgd-client");

(async () => {
  const c = new SgdClient("36802147000142", "9046w48uE@");
  await c.login();
  console.log("[OK] Login, cookie:", c.cookie?.substring(0, 40) + "...");

  // Pick a fresh NAEN budget
  const data = await c.listBudgets({ status: "NAEN" }, 1, 5);
  const items = data.data || [];
  const budget = items[0]; // first available
  console.log("Target:", budget.nuBudgetOrder, budget.schoolName);

  const detail = await c.getBudgetDetail(budget.idSubprogram, budget.idSchool, budget.idBudget);
  console.log("Status:", detail.status, "| Axis:", detail.idAxis);

  const itemsRes = await c.getBudgetItems(budget.idSubprogram, budget.idSchool, budget.idBudget);
  const budgetItems = itemsRes.data || [];

  const payload = JSON.stringify({
    dtGoodsDelivery: detail.dtDelivery,
    dtServiceDelivery: detail.dtDelivery,
    idAxis: detail.idAxis,
    budgetProposalItems: budgetItems.map((i) => ({
      nuValueByItem: 1,
      txItemObservation: (i.txDescription || "Conforme especificado").substring(0, 200),
      idBudgetItem: i.idBudgetItem,
    })),
  });

  console.log("Payload:", payload);

  // Use raw https.request instead of fetch
  const url = new URL(`${BASE_URL}/budget-proposal/send-proposal/by-subprogram/${budget.idSubprogram}/by-school/${budget.idSchool}/by-budget/${budget.idBudget}`);

  const options = {
    hostname: url.hostname,
    path: url.pathname,
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
      "Cookie": c.cookie,
    },
  };

  console.log("\n[SENDING via https.request]");
  console.log("URL:", url.pathname);
  console.log("Headers:", JSON.stringify(options.headers));

  const result = await new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => body += chunk);
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });

  console.log(`[${result.status}]`, result.body);
})();
