/**
 * fetch-pncp-prices.js
 *
 * Busca precos reais de atas de registro de preco no PNCP (Portal Nacional de Contratacoes Publicas).
 * Retorna valorUnitarioHomologado — preco real de contrato, nao media.
 *
 * Uso: node scripts/fetch-pncp-prices.js
 *
 * Saida: dashboard/data/banco-precos-pncp.json
 */

const fs = require("fs");
const path = require("path");

const SEARCH_URL = "https://pncp.gov.br/api/search/";
const INTEGRATION_URL = "https://pncp.gov.br/api/pncp/v1";

const OUTPUT_PATH = path.join(__dirname, "..", "dashboard", "data", "banco-precos-pncp.json");

// SKUs e termos de busca no PNCP
const SKU_SEARCHES = [
  { sku: "ALIM-ARROZ-5KG", terms: ["arroz tipo 1 5kg"], unit: "kg" },
  { sku: "ALIM-FEIJAO-1KG", terms: ["feijao carioca 1kg"], unit: "kg" },
  { sku: "LIMP-AGUA-SANITARIA-1L", terms: ["agua sanitaria"], unit: "litro" },
  { sku: "ESCR-CADERNO-10M", terms: ["caderno brochura"], unit: "unidade" },
  { sku: "MANUT-REFORMA-GERAL", terms: ["manutencao predial escolar", "reforma predial escola"], unit: "servico" },
  { sku: "CAPAC-FORMACAO-EDU", terms: ["capacitacao profissionais educacao", "formacao continuada educacao"], unit: "servico" },
  { sku: "SERV-OPERACIONAL-CONT", terms: ["servicos operacionais escola", "servico limpeza escolar"], unit: "servico" },
  { sku: "SERV-EVENTO-ESCOLAR", terms: ["evento escolar", "confraternizacao escolar"], unit: "servico" },
  { sku: "GAS-RECARGA-13KG", terms: ["gas cozinha 13kg", "recarga gas glp"], unit: "unidade" },
  { sku: "EQUIP-COZINHA-GERAL", terms: ["equipamento cozinha escolar", "fogao industrial"], unit: "unidade" },
  { sku: "EQUIP-TECNOLOGIA", terms: ["computador escola", "notebook educacao"], unit: "unidade" },
  { sku: "EQUIP-SEGURANCA", terms: ["equipamento seguranca escola", "extintor incendio"], unit: "unidade" },
  { sku: "MOBIL-ADMINISTRATIVO", terms: ["mobiliario escolar", "mesa escritorio escolar"], unit: "unidade" },
  { sku: "MATPED-SEGURANCA", terms: ["material pedagogico seguranca"], unit: "unidade" },
];

const MAX_ATAS_PER_SKU = 5;
const MAX_ITEMS_PER_ATA = 20;
const DELAY_MS = 800;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} for ${url}`);
  }
  return resp.json();
}

async function searchAtas(keyword) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(keyword)}&tipos_documento=ata&pagina=1&tam_pagina=${MAX_ATAS_PER_SKU}`;
  try {
    const data = await fetchJson(url);
    return Array.isArray(data.items) ? data.items : [];
  } catch (err) {
    console.error(`  [search] Erro buscando "${keyword}": ${err.message}`);
    return [];
  }
}

function extractCompraRef(ata) {
  // Extrair cnpj, ano, sequencial do item retornado pela search API
  const cnpj = ata.orgao_cnpj || "";
  const link = ata.item_url || ata.url || "";

  // Tentar extrair do link: /compras/{ano}/{seq}
  const compraMatch = link.match(/compras\/(\d{4})\/(\d+)/);
  if (compraMatch) {
    return { cnpj, ano: compraMatch[1], seq: compraMatch[2] };
  }

  // Tentar extrair do numero de controle
  const ctrl = ata.numero_controle_pncp || "";
  const ctrlMatch = ctrl.match(/(\d{14})-\d+-(\d+)\/(\d{4})/);
  if (ctrlMatch) {
    return { cnpj: ctrlMatch[1], ano: ctrlMatch[3], seq: ctrlMatch[2] };
  }

  return null;
}

async function getItemsWithPrices(cnpj, ano, seq) {
  const items = [];
  try {
    const url = `${INTEGRATION_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=1&tamanhoPagina=${MAX_ITEMS_PER_ATA}`;
    const data = await fetchJson(url);
    const itemList = Array.isArray(data) ? data : [];

    for (const item of itemList) {
      if (!item.temResultado) continue;
      const num = item.numeroItem;

      await sleep(DELAY_MS);

      try {
        const resUrl = `${INTEGRATION_URL}/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${num}/resultados?pagina=1&tamanhoPagina=3`;
        const results = await fetchJson(resUrl);
        const resultList = Array.isArray(results) ? results : [];

        if (resultList.length > 0) {
          const winner = resultList[0];
          items.push({
            descricao: String(item.descricao || "").trim(),
            unidade: String(item.unidadeMedida || "").trim(),
            quantidade: item.quantidade || 0,
            valorEstimado: item.valorUnitarioEstimado || 0,
            valorHomologado: winner.valorUnitarioHomologado || 0,
            fornecedor: String(winner.nomeRazaoSocialFornecedor || "").trim(),
            dataResultado: winner.dataResultado || "",
            situacao: String(item.situacaoCompraItemNome || "").trim(),
          });
        }
      } catch (_err) {
        // Ignora item sem resultado
      }
    }
  } catch (err) {
    console.error(`  [items] Erro obtendo itens ${cnpj}/${ano}/${seq}: ${err.message}`);
  }
  return items;
}

async function fetchPricesForSku(skuConfig) {
  const { sku, terms, unit } = skuConfig;
  const allPrices = [];

  for (const term of terms) {
    console.log(`  Buscando: "${term}"...`);
    await sleep(DELAY_MS);

    const atas = await searchAtas(term);
    console.log(`  -> ${atas.length} ata(s) encontrada(s)`);

    for (const ata of atas) {
      const ref = extractCompraRef(ata);
      if (!ref) continue;

      const orgao = ata.orgao_nome || "";
      const vigencia = ata.data_fim_vigencia || ata.data_inicio_vigencia || "";

      console.log(`  -> Itens de ${orgao.slice(0, 40)}... (${ref.cnpj}/${ref.ano}/${ref.seq})`);
      await sleep(DELAY_MS);

      const items = await getItemsWithPrices(ref.cnpj, ref.ano, ref.seq);

      for (const item of items) {
        if (item.valorHomologado > 0) {
          allPrices.push({
            orgao,
            cnpj: ref.cnpj,
            ano: ref.ano,
            sequencial: ref.seq,
            vigencia,
            ...item,
          });
        }
      }
    }

    if (allPrices.length >= 10) break; // Suficiente para este SKU
  }

  return {
    sku,
    unit,
    searchTerms: terms,
    totalResults: allPrices.length,
    prices: allPrices,
  };
}

async function main() {
  console.log("=== Banco de Precos PNCP — Atas de Registro ===\n");

  const results = [];

  for (const skuConfig of SKU_SEARCHES) {
    console.log(`\n[${skuConfig.sku}]`);
    const data = await fetchPricesForSku(skuConfig);
    results.push(data);

    if (data.totalResults > 0) {
      const prices = data.prices.map((p) => p.valorHomologado).filter((v) => v > 0);
      if (prices.length) {
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const median = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
        console.log(`  Resumo: ${prices.length} precos | Min: R$ ${min.toFixed(2)} | Mediana: R$ ${median.toFixed(2)} | Max: R$ ${max.toFixed(2)}`);
      }
    } else {
      console.log("  Nenhum preco encontrado.");
    }
  }

  const output = {
    source: "PNCP - Portal Nacional de Contratacoes Publicas",
    type: "atas_registro_preco",
    fetchedAt: new Date().toISOString(),
    totalSkus: results.length,
    totalPrices: results.reduce((acc, r) => acc + r.totalResults, 0),
    skus: results,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf-8");
  console.log(`\n=== Concluido ===`);
  console.log(`Arquivo: ${OUTPUT_PATH}`);
  console.log(`SKUs pesquisados: ${results.length}`);
  console.log(`Precos coletados: ${output.totalPrices}`);
}

main().catch((err) => {
  console.error("Erro fatal:", err);
  process.exit(1);
});
