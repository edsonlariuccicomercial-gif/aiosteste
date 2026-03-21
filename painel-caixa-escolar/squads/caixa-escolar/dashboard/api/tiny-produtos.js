// ─── Vercel API Route: Cadastro de Produtos no Tiny ERP ───
// ADR-001: Importa lógica de produto do módulo compartilhado
// POST /api/tiny-produtos
import {
  findNcm, normalizeUnit, generateSku, searchTinyProduct, shortenDescription,
} from "../server-lib/product-utils.js";

function corsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

export default async function handler(req, res) {
  corsHeaders(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const token = process.env.TINY_API_TOKEN;
  if (!token) return res.status(500).json({ success: false, error: "TINY_API_TOKEN nao configurado" });

  const body = req.body;
  if (!body) return res.status(400).json({ success: false, error: "JSON invalido" });

  const { itens, contractId, action } = body;

  // ─── Action: listar produtos existentes ───
  if (action === "listar") {
    try {
      const form = new URLSearchParams();
      form.set("token", token);
      form.set("formato", "json");
      form.set("pesquisa", body.pesquisa || "");
      form.set("pagina", String(body.pagina || 1));

      const resp = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── Action: obter produto por ID ───
  if (action === "obter") {
    try {
      const form = new URLSearchParams();
      form.set("token", token);
      form.set("formato", "json");
      form.set("id", String(body.id || ""));

      const resp = await fetch("https://api.tiny.com.br/api2/produto.obter.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }
      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ─── Action default: cadastrar itens ───
  if (!itens || !itens.length) {
    return res.status(400).json({ success: false, error: "itens[] obrigatorio" });
  }

  // Pre-check: search existing products to skip duplicates
  let existingCodes = new Set();
  try {
    for (let pg = 1; pg <= 3; pg++) {
      const searchForm = new URLSearchParams();
      searchForm.set("token", token);
      searchForm.set("formato", "json");
      searchForm.set("pesquisa", (contractId || "").replace(/[^A-Z0-9]/gi, "").slice(-6));
      searchForm.set("pagina", String(pg));
      const sr = await fetch("https://api.tiny.com.br/api2/produtos.pesquisa.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: searchForm.toString(),
      });
      const st = await sr.text();
      const sp = JSON.parse(st);
      const prods = sp.retorno?.produtos || [];
      prods.forEach(p => existingCodes.add((p.produto?.codigo || "").toUpperCase()));
      if (pg >= parseInt(sp.retorno?.numero_paginas || "1")) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  } catch (_) { /* best-effort pre-check */ }

  const results = [];
  for (let i = 0; i < itens.length; i++) {
    const item = itens[i];
    const ncmMatch = findNcm(item.descricao);
    const descricao = shortenDescription(item.descricao);
    const ncm = item.ncm || (ncmMatch ? ncmMatch.ncm : "");

    // If item has no SKU, search Tiny for existing product by name first
    if (!item.codigo && !item.sku) {
      const existing = await searchTinyProduct(token, item.descricao);
      if (existing && existing.codigo) {
        results.push({ num: item.num, sku: existing.codigo, descricao, ncm: existing.ncm || ncm, unidade: existing.unidade || normalizeUnit(item.unidade), status: "existente", error: "Produto encontrado no Tiny por nome" });
        if (i < itens.length - 1) await new Promise(r => setTimeout(r, 1500));
        continue;
      }
    }

    const sku = item.codigo || item.sku || generateSku(item, i, contractId);
    const unidade = normalizeUnit(item.unidade);

    // Skip if already exists in Tiny
    if (existingCodes.has(sku.toUpperCase())) {
      results.push({ num: item.num, sku, descricao, ncm, unidade, status: "existente", error: "Ja cadastrado (detectado pre-check)" });
      continue;
    }

    const produto = {
      produto: {
        codigo: sku,
        nome: descricao,
        unidade: unidade,
        preco: Number(item.precoUnitario || 0).toFixed(2),
        ncm,
        origem: "0",
        tipo: "P",
        situacao: "A",
        classe_ipi: "",
        descricao_complementar: item.descricaoCompleta || "",
        marca: "Licit-AIX",
      },
    };

    const form = new URLSearchParams();
    form.set("token", token);
    form.set("formato", "json");
    form.set("produto", JSON.stringify(produto));

    try {
      const resp = await fetch("https://api.tiny.com.br/api2/produto.incluir.php", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });
      const text = await resp.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch (_) { parsed = { raw: text }; }

      const ret = parsed.retorno || {};
      const status = String(ret.status || "").toLowerCase();

      if (status === "ok") {
        const tinyId = ret.registros?.[0]?.registro?.id || ret.id || null;
        results.push({ num: item.num, sku, descricao, ncm, unidade, status: "ok", tinyId });
      } else {
        const errMsg = ret.erros?.[0]?.erro || ret.erros?.[0] || ret.mensagem || "Erro desconhecido";
        const errStr = typeof errMsg === "string" ? errMsg : JSON.stringify(errMsg);
        if (errStr.toLowerCase().includes("ja cadastrado") || errStr.toLowerCase().includes("codigo ja existe")) {
          results.push({ num: item.num, sku, descricao, ncm, status: "existente", error: errStr });
        } else {
          results.push({ num: item.num, sku, descricao, ncm, status: "erro", error: errStr });
        }
      }
    } catch (err) {
      results.push({ num: item.num, sku, descricao, status: "erro", error: err.message });
    }

    // Tiny rate limit: ~30 req/min
    if (i < itens.length - 1) {
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  const ok = results.filter(r => r.status === "ok").length;
  const existente = results.filter(r => r.status === "existente").length;
  const erros = results.filter(r => r.status === "erro").length;

  return res.status(200).json({
    success: true,
    summary: { total: itens.length, cadastrados: ok, existentes: existente, erros },
    results,
  });
}
