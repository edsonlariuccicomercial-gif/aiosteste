// ===== DOCX PARSER =====
async function parseDocx(file) {
  const zip = await JSZip.loadAsync(file);
  const xml = await zip.file("word/document.xml").async("string");
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

  // Extract paragraphs (only those NOT inside tables)
  const paragraphs = [];
  doc.querySelectorAll("p").forEach(p => {
    // Skip paragraphs inside table cells
    let parent = p.parentElement;
    let inTable = false;
    while (parent) {
      if (parent.localName === "tc" || parent.localName === "tbl") { inTable = true; break; }
      parent = parent.parentElement;
    }
    if (inTable) return;
    const texts = [];
    p.querySelectorAll("t").forEach(t => texts.push(t.textContent));
    const text = texts.join("").trim();
    if (text) paragraphs.push(text);
  });

  // Extract tables
  const tables = [];
  doc.querySelectorAll("tbl").forEach(tbl => {
    const rows = [];
    tbl.querySelectorAll("tr").forEach(tr => {
      const cells = [];
      tr.querySelectorAll("tc").forEach(tc => {
        // Group text by paragraph to preserve spacing
        const paragraphs = [];
        tc.querySelectorAll("p").forEach(p => {
          const pTexts = [];
          p.querySelectorAll("t").forEach(t => pTexts.push(t.textContent));
          const pText = pTexts.join("").trim();
          if (pText) paragraphs.push(pText);
        });
        cells.push(paragraphs.join(" ").trim());
      });
      rows.push(cells);
    });
    tables.push(rows);
  });

  return { paragraphs, tables };
}

function interpretMapa(parsed) {
  const { paragraphs, tables } = parsed;
  if (tables.length < 1) throw new Error("Mapa invalido: nenhuma tabela encontrada no arquivo");

  // Metadata from paragraphs
  let escola = "", edital = "", criterio = "", dataApuracao = "";
  for (const p of paragraphs) {
    const pUp = p.toUpperCase();
    if (pUp.includes("CAIXA ESCOLAR") && !escola) escola = p;
    if (pUp.includes("EDITAL")) {
      const m = p.match(/Edital\s+n[°ºo]?\s*([\d\/\-]+)/i);
      if (m) edital = m[1];
    }
    if (pUp.includes("CRIT")) {
      const m = p.match(/Crit.rio.*?[–\-]\s*(.*)/i);
      if (m) criterio = m[1].trim();
    }
    if (pUp.includes("AUTENTICA")) {
      const m = p.match(/(\d{2}\/\d{2}\/\d{4})/);
      if (m) dataApuracao = m[1];
    }
  }
  // Fallback: if no escola found, use first paragraph
  if (!escola && paragraphs.length > 1) escola = paragraphs[1] || paragraphs[0];

  // Table 0: Items + supplier prices
  const mainTable = tables[0];
  const headerRow = mainTable[0];

  // Smart column detection: find key columns by header text
  let colItem = -1, colDesc = -1, colUnd = -1, colQtd = -1, firstSupplierCol = -1;
  const skipHeaders = ["preco/unidade","preco","valor","total","item","n","num","descri","und","unid","quant","qtd","qtde"];
  for (let c = 0; c < headerRow.length; c++) {
    const h = String(headerRow[c]).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!h) continue;
    if ((h === "item" || h === "n" || h === "num" || h === "n.") && colItem < 0) colItem = c;
    else if ((h.includes("descri") || h.includes("produto") || h.includes("especif") || h.includes("material")) && colDesc < 0) colDesc = c;
    else if ((h.includes("und") || h.includes("unid") || h === "un") && colUnd < 0) colUnd = c;
    else if ((h.includes("quant") || h.includes("qtd")) && colQtd < 0) colQtd = c;
  }
  // Fallback to fixed positions if detection fails
  if (colDesc < 0) colDesc = 1;
  if (colUnd < 0) colUnd = 2;
  if (colQtd < 0) colQtd = 3;
  firstSupplierCol = Math.max(colDesc, colUnd, colQtd) + 1;

  // Suppliers are columns after the last known field
  const supplierNames = [];
  for (let c = firstSupplierCol; c < headerRow.length; c++) {
    const h = String(headerRow[c]).trim();
    if (!h) continue;
    const hLow = h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    // Skip only exact structural headers (not partial matches)
    const isStructural = /^(item|n\.?|num|descri|und|unid|un|quant|qtd|qtde|preco|valor|total|preco\/unidade)$/i.test(hLow.trim());
    if (!isStructural) {
      // Extract supplier name: remove "Licitante N" prefix if present
      let name = h.replace(/^Licitante\s*\d+\s*/i, "").trim();
      if (!name || /^(valor|preco)$/i.test(name)) name = h; // keep full if stripped to nothing
      supplierNames.push(name);
    }
  }

  // Detect data start row (skip sub-headers like "Preco/unidade")
  let dataStartRow = 1;
  if (mainTable.length > 2) {
    const row1 = mainTable[1];
    const row1Text = row1.map(c => String(c).toLowerCase()).join(" ");
    if (row1Text.includes("preco") || row1Text.includes("valor") || row1Text.includes("unidade")) dataStartRow = 2;
  }

  // Parse items
  const itens = [];
  let itemNum = 0;
  for (let r = dataStartRow; r < mainTable.length; r++) {
    const row = mainTable[r];
    const descricao = row[colDesc] || "";
    if (!descricao) continue;
    itemNum++;

    const unidade = row[colUnd] || "";
    const quantidade = parseFloat(String(row[colQtd] || "0").replace(/\./g, "").replace(",", ".")) || 0;

    const precos = {};
    const precosTotal = {};
    for (let s = 0; s < supplierNames.length; s++) {
      const raw = String(row[firstSupplierCol + s] || "");
      const cleaned = raw.replace(/[^\d,\.]/g, "");
      // Handle Brazilian format: "1.234,56" → 1234.56
      let price = 0;
      if (cleaned) {
        const hasDotAndComma = cleaned.includes(".") && cleaned.includes(",");
        if (hasDotAndComma) price = parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
        else if (cleaned.includes(",")) price = parseFloat(cleaned.replace(",", ".")) || 0;
        else price = parseFloat(cleaned) || 0;
      }
      precosTotal[supplierNames[s]] = price;
      // Convert to unit price: total / quantity
      precos[supplierNames[s]] = (price > 0 && quantidade > 0) ? Math.round((price / quantidade) * 100) / 100 : price;
    }

    itens.push({ num: itemNum, descricao, unidade, quantidade, precos, precosTotal });
  }

  // Table 1: Classification (optional — may not exist in Excel/PDF)
  const fornecedores = [];
  if (tables.length < 2) {
    // No classification table — infer suppliers from item prices
    for (let s = 0; s < supplierNames.length; s++) {
      const itensGanhos = [];
      for (const item of itens) {
        const prices = Object.entries(item.precos).filter(([,v]) => v > 0);
        if (prices.length === 0) continue;
        const minPrice = Math.min(...prices.map(([,v]) => v));
        if (item.precos[supplierNames[s]] === minPrice) itensGanhos.push(item.num);
      }
      fornecedores.push({ ordem: s + 1, nome: supplierNames[s], itensGanhos });
    }
    return { escola, edital, criterio, dataApuracao, supplierNames, itens, fornecedores };
  }
  const classTable = tables[1];
  for (let r = 1; r < classTable.length; r++) {
    const row = classTable[r];
    const ordem = parseInt(row[0]) || r;
    const nome = row[1] || "";
    const itensStr = row[2] || "";

    // Parse "1,2,4,5,6,7,8,9 e 10" or "5-7-12-29-34" or "3" or "–"
    let itensGanhos = [];
    if (itensStr && itensStr !== "\u2013" && itensStr !== "-" && itensStr !== "\u00a0") {
      // Support multiple separators: comma, hyphen, "e", semicolon, space
      const normalized = itensStr.replace(/\s*e\s*/g, ",").replace(/[\-;]/g, ",");
      const parts = normalized.split(",");
      itensGanhos = parts.map(s => parseInt(s.trim())).filter(n => !isNaN(n));
    }

    if (nome) {
      fornecedores.push({ ordem, nome, itensGanhos });
    }
  }

  return { escola, edital, criterio, dataApuracao, supplierNames, itens, fornecedores };
}

// ===== EXCEL/CSV PARSER (SheetJS) =====
async function parseExcel(file) {
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: "array" });

  const paragraphs = [];
  const tables = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    if (!rows.length) continue;

    // Heuristic: rows with mostly empty cells are metadata paragraphs
    // Rows that form a grid (3+ columns with data) are table rows
    let currentTable = [];
    for (const row of rows) {
      const nonEmpty = row.filter(c => c !== "" && c !== null && c !== undefined);
      if (nonEmpty.length === 0) {
        // Empty row = table separator
        if (currentTable.length > 0) { tables.push(currentTable); currentTable = []; }
        continue;
      }
      if (nonEmpty.length <= 2 && row.length <= 3) {
        // Looks like metadata/header text
        if (currentTable.length > 0) { tables.push(currentTable); currentTable = []; }
        paragraphs.push(nonEmpty.join(" ").trim());
      } else {
        // Table row
        currentTable.push(row.map(c => String(c).trim()));
      }
    }
    if (currentTable.length > 0) tables.push(currentTable);
  }

  if (tables.length === 0) throw new Error("Nenhuma tabela encontrada na planilha");
  return { paragraphs, tables };
}

// ===== PDF PARSER (pdf.js) =====
async function parsePDF(file) {
  if (!window.pdfjsLib) throw new Error("Biblioteca PDF nao carregada. Recarregue a pagina.");
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  const allLines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Group text items by Y position with tolerance (items within 3px = same line)
    const rawItems = content.items.filter(i => i.str.trim()).map(i => ({
      x: i.transform[4], y: Math.round(i.transform[5]), text: i.str
    }));

    const lineGroups = [];
    const yTolerance = 3;
    const sortedByY = [...rawItems].sort((a, b) => b.y - a.y);
    for (const item of sortedByY) {
      const existing = lineGroups.find(g => Math.abs(g.y - item.y) <= yTolerance);
      if (existing) { existing.items.push(item); }
      else { lineGroups.push({ y: item.y, items: [item] }); }
    }

    lineGroups.sort((a, b) => b.y - a.y);
    for (const group of lineGroups) {
      const items = group.items.sort((a, b) => a.x - b.x);
      const lineText = items.map(i => i.text).join(" ").trim();
      if (lineText) allLines.push({ y: group.y, items, text: lineText });
    }
  }

  // Heuristic: detect table rows by tab-like spacing between text items
  const paragraphs = [];
  const tables = [];
  let currentTable = [];

  for (const line of allLines) {
    // Detect if this line has tabular structure (multiple spaced columns)
    const gaps = [];
    for (let i = 1; i < line.items.length; i++) {
      const gap = line.items[i].x - (line.items[i-1].x + line.items[i-1].text.length * 5);
      gaps.push(gap);
    }
    const bigGaps = gaps.filter(g => g > 20).length;

    if (bigGaps >= 2 && line.items.length >= 3) {
      // Tabular line — split by large gaps into columns
      const cells = [];
      let currentCell = line.items[0].text;
      for (let i = 1; i < line.items.length; i++) {
        const gap = line.items[i].x - (line.items[i-1].x + line.items[i-1].text.length * 5);
        if (gap > 20) {
          cells.push(currentCell.trim());
          currentCell = line.items[i].text;
        } else {
          currentCell += " " + line.items[i].text;
        }
      }
      cells.push(currentCell.trim());
      currentTable.push(cells);
    } else {
      // Paragraph text
      if (currentTable.length > 2) { tables.push(currentTable); }
      currentTable = [];
      paragraphs.push(line.text);
    }
  }
  if (currentTable.length > 2) tables.push(currentTable);

  // Verificar se as tabelas encontradas têm conteúdo real (não lixo de OCR embutido)
  const totalCells = tables.reduce((s, t) => s + t.reduce((s2, row) => s2 + row.length, 0), 0);
  const hasNumericData = tables.some(t => t.some(row => row.some(cell => /\d+[.,]\d{2}/.test(cell))));
  if (tables.length === 0 || (totalCells < 10 && !hasNumericData)) {
    // PDF escaneado ou com pouco texto extraível — tentar OCR via renderização + AI
    return await parsePdfViaOCR(pdf);
  }
  return { paragraphs, tables };
}

async function parsePdfViaOCR(pdf) {
  const totalPages = pdf.numPages;
  showToast(`PDF escaneado detectado (${totalPages} pgs). Processando via OCR (IA)... Aguarde.`, 10000);

  // Render all pages to images
  const allImages = [];
  for (let p = 1; p <= totalPages; p++) {
    const page = await pdf.getPage(p);
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    allImages.push(canvas.toDataURL("image/jpeg", 0.6));
  }

  // Process in batches of 3 pages to stay under payload limits
  const batchSize = 3;
  const batches = [];
  for (let i = 0; i < allImages.length; i += batchSize) {
    batches.push(allImages.slice(i, i + batchSize));
  }

  const results = [];
  let fornecedoresCtx = []; // supplier names from first batch to pass to subsequent batches
  for (let b = 0; b < batches.length; b++) {
    if (batches.length > 1) {
      showToast(`OCR: processando lote ${b + 1} de ${batches.length}...`, 8000);
    }
    const partial = await ocrParseImages(batches[b], b === 0, fornecedoresCtx);
    results.push(partial);
    // Capture supplier names from first batch
    if (b === 0 && partial.fornecedores && partial.fornecedores.length > 0) {
      fornecedoresCtx = partial.fornecedores.map(f => typeof f === "string" ? f : (f.nome || ""));
    } else if (b === 0 && partial.itens && partial.itens.length > 0) {
      // Infer from first item precos keys
      for (const item of partial.itens) {
        if (item.precos && typeof item.precos === "object") {
          fornecedoresCtx = Object.keys(item.precos);
          break;
        }
      }
    }
  }

  // Merge all raw results then convert
  if (results.length === 1) return ocrToMapaFormat(results[0]);
  return mergeOcrResults(results);
}

function mergeOcrResults(results) {
  // First result has metadata (escola, edital, etc)
  const merged = { escola: "", edital: "", dataApuracao: "", criterio: "", fornecedores: [], itens: [] };
  for (const r of results) {
    if (r.escola && !merged.escola) merged.escola = r.escola;
    if (r.edital && !merged.edital) merged.edital = r.edital;
    if (r.dataApuracao && !merged.dataApuracao) merged.dataApuracao = r.dataApuracao;
    if (r.criterio && !merged.criterio) merged.criterio = r.criterio;
    if (r.fornecedores && r.fornecedores.length > merged.fornecedores.length) {
      merged.fornecedores = r.fornecedores;
    }
    if (r.itens) merged.itens.push(...r.itens);
  }
  // Renumber items sequentially
  merged.itens.forEach((item, idx) => { item.num = idx + 1; });
  return ocrToMapaFormat(merged);
}

async function ocrParseImages(imageDataUrls, isFirstBatch, fornecedoresCtx) {
  const jsonExample = `{
  "escola": "Caixa Escolar ...",
  "edital": "PE 001/2026",
  "dataApuracao": "01/01/2026",
  "criterio": "Menor preço por item",
  "fornecedores": [{"nome": "Empresa A", "cnpj": "00.000.000/0001-00"}, {"nome": "Empresa B", "cnpj": ""}],
  "itens": [
    {"num": 1, "descricao": "Arroz tipo 1 5kg", "unidade": "Pct", "quantidade": 100, "precos": {"Empresa A": 22.50, "Empresa B": 23.00}, "vencedor": "Empresa A"},
    {"num": 2, "descricao": "Feijao carioca 1kg", "unidade": "Pct", "quantidade": 80, "precos": {"Empresa A": 8.90, "Empresa B": 7.50}, "vencedor": "Empresa B"}
  ]
}`;
  let prompt;
  if (isFirstBatch !== false) {
    prompt = `Extraia TODOS os dados desta tabela de Mapa de Apuração de licitação pública. IMPORTANTE: extraia os PREÇOS UNITÁRIOS de cada fornecedor para cada item. Retorne EXATAMENTE neste formato JSON (os precos de cada item devem ser um objeto com o nome do fornecedor como chave e o valor unitario como numero):\n${jsonExample}\nRetorne APENAS o JSON válido, sem markdown, sem código.`;
  } else {
    const nomes = (fornecedoresCtx || []).join('", "');
    prompt = `Continue extraindo os itens das páginas adicionais do mesmo Mapa de Apuração de licitação. Os fornecedores são: ["${nomes}"]. Para CADA item extraia o preço unitário de CADA fornecedor. Retorne JSON: {"itens": [{"num": 1, "descricao": "...", "unidade": "...", "quantidade": 0, "precos": {"${(fornecedoresCtx||[])[0] || 'Fornecedor A'}": 0.00, "${(fornecedoresCtx||[])[1] || 'Fornecedor B'}": 0.00}, "vencedor": "..."}]}. Retorne APENAS JSON, sem markdown.`;
  }

  const content = [];
  content.push({ type: "text", text: prompt });
  imageDataUrls.forEach(url => {
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  });

  try {
    const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "" : window.location.origin;
    const resp = await fetch(baseUrl + "/api/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: "__OCR_IMAGE_MODE__",
        formato: "mapa_apuracao_ocr",
        fornecedor: "",
        contexto: "Mapa de Apuração e Classificação de Propostas de licitação pública",
        _ocrMessages: [{ role: "user", content }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || errData.detail || "Erro na API OCR: " + resp.status);
    }

    const data = await resp.json();
    if (data.escola || data.itens || data.fornecedores) {
      return data; // raw OCR result — conversion happens in parsePdfViaOCR
    }
    throw new Error("Formato de resposta OCR não reconhecido");
  } catch (err) {
    throw new Error("OCR falhou: " + err.message + ". Tente converter o PDF para Excel primeiro.");
  }
}

function ocrToMapaFormat(ocr) {
  const paragraphs = [];
  if (ocr.escola) paragraphs.push("ESCOLA: " + ocr.escola);
  if (ocr.edital) paragraphs.push("EDITAL: " + ocr.edital);
  if (ocr.dataApuracao) paragraphs.push("DATA: " + ocr.dataApuracao);
  if (ocr.criterio) paragraphs.push("CRITÉRIO: " + ocr.criterio);

  // Collect supplier names from fornecedores array or from item precos keys
  let fornecedorNames = (ocr.fornecedores || []).map(f => typeof f === "string" ? f : (f.nome || ""));
  if (fornecedorNames.length === 0 && ocr.itens && ocr.itens.length > 0) {
    // Infer supplier names from the first item that has precos
    for (const item of ocr.itens) {
      if (item.precos && typeof item.precos === "object") {
        fornecedorNames = Object.keys(item.precos);
        break;
      }
    }
  }

  const tables = [];
  const header = ["Item", "Descrição", "Unidade", "Qtd"];
  fornecedorNames.forEach(name => header.push(name));
  header.push("Vencedor");

  const rows = [header];
  (ocr.itens || []).forEach(item => {
    const row = [
      String(item.num || item.item || ""),
      item.descricao || item.nome || item.description || "",
      item.unidade || item.und || "Un",
      String(item.quantidade || item.qtd || item.qty || "")
    ];
    fornecedorNames.forEach(name => {
      let preco = "";
      if (item.precos && typeof item.precos === "object") {
        preco = item.precos[name] ?? "";
      } else if (item.precoUnitario) {
        preco = item.precoUnitario;
      }
      // Convert comma decimal to dot for number handling
      if (typeof preco === "string") preco = preco.replace(",", ".");
      row.push(String(preco || ""));
    });
    row.push(item.vencedor || item.winner || "");
    rows.push(row);
  });
  tables.push(rows);
  return { paragraphs, tables };
}

// ===== FILE UPLOAD =====
async function handleFileUpload(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'docx') {
    try {
      const parsed = await parseDocx(file);
      parsedMapa = interpretMapa(parsed);
      selectedSupplierIdx = null;
      renderImportPreview();
      showToast("Mapa parseado com sucesso!");
    } catch (err) {
      showToast("Erro ao parsear DOCX: " + err.message, 5000);
      console.error(err);
    }
  } else if (['xlsx', 'xls', 'csv'].includes(ext)) {
    try {
      const parsed = await parseExcel(file);
      parsedMapa = interpretMapa(parsed);
      selectedSupplierIdx = null;
      renderImportPreview();
      showToast("Excel/CSV parseado com sucesso!");
    } catch (err) {
      showToast("Erro ao parsear Excel: " + err.message, 5000);
      console.error(err);
    }
  } else if (ext === 'pdf') {
    try {
      const parsed = await parsePDF(file);
      parsedMapa = interpretMapa(parsed);
      selectedSupplierIdx = null;
      renderImportPreview();
      showToast("PDF parseado com sucesso!");
    } catch (err) {
      showToast("Erro ao parsear PDF: " + err.message, 5000);
      console.error(err);
    }
  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    showToast("Imagem detectada. Para importar mapas em imagem, converta para PDF ou Excel primeiro. Dica: use o app CamScanner ou Adobe Scan para converter foto em PDF.", 8000);
  } else {
    showToast("Formato nao suportado: ." + ext, 5000);
  }
}

// Drag & drop (disabled — file pickers open directly from buttons)

// ===== RENDER IMPORT PREVIEW =====
function renderImportPreview() {
  if (!parsedMapa) return;
  const m = parsedMapa;

  document.getElementById("import-preview").classList.remove("hidden");
  document.getElementById("preview-title").textContent = m.escola || "Mapa de Apuracao";
  document.getElementById("preview-edital").textContent = m.edital ? `Edital ${m.edital}` : "";
  document.getElementById("preview-criterio").textContent = m.criterio || "";
  document.getElementById("preview-data").textContent = m.dataApuracao || "";

  // Supplier grid
  const grid = document.getElementById("supplier-grid");
  grid.innerHTML = m.fornecedores.map((f, idx) => {
    const count = f.itensGanhos.length;
    return `<div class="supplier-card" id="sup-${idx}" onclick="selectSupplier(${idx})">
      <h4>${esc(f.nome)}</h4>
      <p>${count > 0 ? `${count} item(ns) ganho(s): ${f.itensGanhos.join(", ")}` : "Nenhum item ganho"}</p>
    </div>`;
  }).join("");

  // Items table
  const thForn = document.getElementById("th-fornecedores");
  thForn.colSpan = m.supplierNames.length;
  thForn.textContent = "Precos por Fornecedor";

  // Rebuild thead with supplier columns
  const thead = thForn.closest("thead");
  thead.innerHTML = `<tr>
    <th>#</th><th>Descricao</th><th>Unidade</th><th class="text-right">Qtd</th>
    ${m.supplierNames.map(s => `<th class="text-right nowrap">${esc(s.length > 20 ? s.slice(0, 18) + "..." : s)}</th>`).join("")}
    <th>Vencedor</th>
  </tr>`;

  const tbody = document.getElementById("preview-items-tbody");
  tbody.innerHTML = m.itens.map(item => {
    // Find winner for this item
    const winner = m.fornecedores.find(f => f.itensGanhos.includes(item.num));
    const winnerName = winner ? winner.nome : "-";
    const winnerShort = winnerName.length > 20 ? winnerName.slice(0, 18) + "..." : winnerName;

    return `<tr>
      <td class="text-center">${item.num}</td>
      <td>${esc(item.descricao)}</td>
      <td class="nowrap">${esc(item.unidade)}</td>
      <td class="text-right font-mono">${item.quantidade}</td>
      ${m.supplierNames.map(s => {
        const p = item.precos[s];
        const pTotal = item.precosTotal ? item.precosTotal[s] : p;
        const isWinner = winner && s === winner.nome;
        const title = pTotal !== p && pTotal > 0 ? `Total: ${brl.format(pTotal)}` : "";
        return `<td class="text-right font-mono ${isWinner ? 'green' : ''}" style="${isWinner ? 'font-weight:700' : ''}" title="${title}">${p > 0 ? brl.format(p) : "-"}</td>`;
      }).join("")}
      <td class="nowrap"><span class="badge badge-green">${esc(winnerShort)}</span></td>
    </tr>`;
  }).join("");

  renderWonItems();
}

function selectSupplier(idx) {
  selectedSupplierIdx = idx;
  document.querySelectorAll(".supplier-card").forEach((c, i) => {
    c.classList.toggle("selected", i === idx);
  });
  renderWonItems();
}

function renderWonItems() {
  const card = document.getElementById("won-items-card");
  const btn = document.getElementById("btn-criar-contrato");

  if (selectedSupplierIdx === null || !parsedMapa) {
    card.classList.add("hidden");
    btn.disabled = true;
    return;
  }

  card.classList.remove("hidden");
  const supplier = parsedMapa.fornecedores[selectedSupplierIdx];
  const wonItems = parsedMapa.itens.filter(i => supplier.itensGanhos.includes(i.num));

  document.getElementById("won-items-title").textContent = `Itens Ganhos por ${supplier.nome} (${wonItems.length})`;

  let total = 0;
  document.getElementById("won-items-tbody").innerHTML = wonItems.map(item => {
    const preco = item.precos[supplier.nome] || 0;
    const subtotal = preco * item.quantidade;
    total += subtotal;
    return `<tr>
      <td class="text-center">${item.num}</td>
      <td>${esc(item.descricao)}</td>
      <td class="nowrap">${esc(item.unidade)}</td>
      <td class="text-right font-mono">${item.quantidade}</td>
      <td class="text-right font-mono">${brl.format(preco)}</td>
      <td class="text-right font-mono" style="font-weight:700;color:var(--green)">${brl.format(subtotal)}</td>
    </tr>`;
  }).join("");

  document.getElementById("won-items-total").textContent = brl.format(total);
  btn.disabled = wonItems.length === 0;
}

// ===== CREATE CONTRACT =====
function criarContrato() {
  if (!parsedMapa || selectedSupplierIdx === null) return;
  const m = parsedMapa;
  const supplier = m.fornecedores[selectedSupplierIdx];
  const wonItems = m.itens.filter(i => supplier.itensGanhos.includes(i.num));

  if (wonItems.length === 0) {
    showToast("Nenhum item ganho por este fornecedor.", 3000);
    return;
  }

  const now = new Date();
  const id = `CTR-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`;

  const contrato = {
    id,
    escola: m.escola,
    edital: m.edital,
    criterio: m.criterio,
    dataApuracao: m.dataApuracao,
    dataCriacao: now.toISOString(),
    fornecedor: supplier.nome,
    status: "ativo",
    itens: wonItems.map(item => {
      const ncmMatch = findNcmLocal(item.descricao);
      return {
        num: item.num,
        descricao: item.descricao,
        unidade: item.unidade,
        qtdContratada: item.quantidade,
        precoUnitario: item.precos[supplier.nome] || 0,
        qtdEntregue: 0,
        ncm: ncmMatch ? ncmMatch.ncm : ""
      };
    }),
    fornecedoresMapa: m.fornecedores.map(f => ({
      nome: f.nome,
      itensGanhos: f.itensGanhos
    }))
  };

  const clienteVinculado = findClienteBySchoolName(contrato.escola);
  if (clienteVinculado) vincularClienteAoContrato(contrato, clienteVinculado);
  contratos.push(contrato);
  saveContratos();
  if (clienteVinculado) saveUsuarios();

  // Auto-preencher NCM + cadastrar itens no ERP (background, non-blocking)
  const ncmResult = autoPreencherNcm(contrato.id);
  if (ncmResult.pending > 0) classificarNcmIA(contrato.id);

  // Alimentar banco de precos com dados de concorrentes
  alimentarBancoConcorrentes(m, supplier.nome);

  // Bridge 4: Contrato → Banco (preço confirmado)
  if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
    (contrato.itens || []).forEach(function(item) {
      if (!item.skuVinculado) return;
      var bp = bancoPrecos.itens.find(function(b) { return b.sku === item.skuVinculado || normalizedText(b.item) === normalizedText(item.descricao); });
      if (bp) {
        if (!bp.propostas) bp.propostas = [];
        bp.propostas.push({ edital: contrato.processo || contrato.id, escola: contrato.escola, preco: item.precoUnitario, data: new Date().toISOString().slice(0,10), tipo: 'contrato' });
        if (!bp.precoReferenciaHistorico || item.precoUnitario > 0) {
          var ganhos = bp.propostas.filter(function(p) { return p.tipo === 'contrato'; });
          bp.precoReferenciaHistorico = ganhos.reduce(function(s,p) { return s + p.preco; }, 0) / ganhos.length;
        }
      }
    });
    saveBancoLocal();
  }

  // Reset import
  parsedMapa = null;
  selectedSupplierIdx = null;
  document.getElementById("import-preview").classList.add("hidden");
  document.getElementById("file-input").value = "";

  showToast(`Contrato ${id} criado com ${wonItems.length} itens!`);
  renderAll();

  // Story 4.16: Abrir tela de sincronizacao antes de ir ao detalhe
  abrirSincronizacaoItens(contrato.id);
}

// Alimentar banco de precos (Caixa Escolar) com precos dos concorrentes do mapa
function alimentarBancoConcorrentes(mapa, meuNome) {
  const BANCO_KEY = "caixaescolar.banco.v1";
  let banco;
  try { banco = JSON.parse(localStorage.getItem(BANCO_KEY)); } catch(_) { banco = null; }
  if (!banco || !Array.isArray(banco.itens)) banco = { updatedAt: "", itens: [] };

  const todayStr = new Date().toISOString().slice(0, 10);
  const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  let updated = 0;
  for (const item of mapa.itens) {
    // Encontrar ou criar item no banco
    const itemNorm = norm(item.descricao);
    let bp = banco.itens.find(b => norm(b.item) === itemNorm);
    if (!bp) {
      bp = {
        id: "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5),
        item: item.descricao,
        grupo: "Mapa Importado",
        unidade: item.unidade || "Unidade",
        custoBase: 0,
        margemPadrao: 0.30,
        precoReferencia: 0,
        ultimaCotacao: todayStr,
        fonte: "Mapa " + (mapa.edital || ""),
        propostas: [],
        concorrentes: [],
        custosFornecedor: []
      };
      banco.itens.push(bp);
    }

    // Garantir arrays existem
    if (!bp.concorrentes) bp.concorrentes = [];
    if (!bp.propostas) bp.propostas = [];

    // Registrar precos UNITARIOS de CADA fornecedor
    for (const [fornecedor, precoUnit] of Object.entries(item.precos)) {
      if (precoUnit <= 0) continue;

      if (norm(fornecedor) === norm(meuNome)) {
        // Meu preco — registrar como proposta e atualizar custo base
        const jaExiste = bp.propostas.find(p => p.edital === (mapa.edital || "") && p.escola === (mapa.escola || ""));
        if (!jaExiste) {
          bp.propostas.push({
            edital: mapa.edital || "",
            escola: mapa.escola || "",
            preco: precoUnit,
            data: todayStr,
            resultado: "pendente"
          });
        }
        // Atualizar custo base e preco referencia
        bp.custoBase = precoUnit;
        bp.precoReferencia = Math.round(precoUnit * (1 + bp.margemPadrao) * 100) / 100;
      } else {
        // Concorrente — registrar preco unitario
        const jaExiste = bp.concorrentes.find(c => norm(c.nome) === norm(fornecedor) && c.edital === (mapa.edital || ""));
        if (!jaExiste) {
          bp.concorrentes.push({
            nome: fornecedor,
            preco: precoUnit,
            edital: mapa.edital || "",
            escola: mapa.escola || "",
            data: todayStr
          });
        }
      }
    }

    bp.ultimaCotacao = todayStr;
    updated++;
  }

  banco.updatedAt = todayStr;
  localStorage.setItem(BANCO_KEY, JSON.stringify(banco));
  showToast(`Inteligencia: ${updated} itens com precos de concorrentes registrados no Banco de Precos.`, 5000);
}

// ===== IMPORT MODE SWITCHER =====
let currentImportMode = "mapa";
function setImportMode(mode) {
  currentImportMode = mode;
  document.getElementById("import-mode-lista").classList.toggle("hidden", mode !== "lista");
  document.getElementById("import-mode-crono").classList.toggle("hidden", mode !== "crono");
}

// ===== LISTA DE PRODUTOS IMPORT =====
let parsedLista = null;
let parsedListaSheets = null;

async function handleListaUpload(file) {
  if (!file) return;
  setImportMode('lista');
  const ext = file.name.split('.').pop().toLowerCase();

  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });

      parsedListaSheets = {};
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        const itens = parseSheetToItems(rows);
        if (itens.length > 0) {
          parsedListaSheets[sheetName] = itens;
        }
      }

      const sheetNames = Object.keys(parsedListaSheets);
      if (sheetNames.length === 0) {
        showToast("Nenhum item encontrado na planilha. Verifique se ha colunas de descricao/produto.", 5000);
        return;
      }

      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      const allRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
      autoFillMetadataFromRows(allRows);

      if (sheetNames.length > 1) {
        renderSheetSelector(sheetNames);
      } else {
        parsedLista = parsedListaSheets[sheetNames[0]];
        renderListaPreview();
        showToast(`${parsedLista.length} itens encontrados!`);
      }
    } catch (err) {
      showToast("Erro ao ler planilha: " + err.message, 5000);
      console.error(err);
    }
  } else if (ext === 'docx' || ext === 'doc') {
    try {
      const parsed = await parseDocx(file);
      loadListaFromTables(parsed);
    } catch (err) {
      showToast("Erro ao ler Word: " + err.message, 5000);
      console.error(err);
    }
  } else if (ext === 'pdf') {
    try {
      const parsed = await parsePDF(file);
      loadListaFromTables(parsed);
    } catch (err) {
      showToast("Erro ao ler PDF: " + err.message, 5000);
      console.error(err);
    }
  } else {
    showToast("Formato nao suportado. Use Excel, Word ou PDF.", 4000);
  }
}

function loadListaFromTables(parsed) {
  const { paragraphs, tables } = parsed;
  if (!tables || tables.length === 0) {
    showToast("Nenhuma tabela encontrada no arquivo.", 5000);
    return;
  }

  parsedListaSheets = {};
  tables.forEach((tbl, idx) => {
    const itens = parseSheetToItems(tbl);
    if (itens.length > 0) {
      parsedListaSheets[`Tabela ${idx + 1}`] = itens;
    }
  });

  const sheetNames = Object.keys(parsedListaSheets);
  if (sheetNames.length === 0) {
    showToast("Nenhum item encontrado nas tabelas. Verifique se ha colunas de descricao/produto.", 5000);
    return;
  }

  // Auto-fill metadata from paragraphs
  if (paragraphs && paragraphs.length > 0) {
    for (const p of paragraphs) {
      const pUp = p.toUpperCase();
      if (pUp.includes("CAIXA ESCOLAR") || pUp.includes("ESCOLA")) {
        const el = document.getElementById("lista-escola");
        if (el && !el.value) el.value = p.trim();
      }
      if (pUp.includes("EDITAL") || pUp.includes("PREGAO")) {
        const m = p.match(/(?:Edital|Preg[aã]o)\s+(?:n[°ºo]?\s*)?([\d\/\-\.]+)/i);
        if (m) {
          const el = document.getElementById("lista-edital");
          if (el && !el.value) el.value = m[0].trim();
        }
      }
    }
  }

  if (sheetNames.length > 1) {
    renderSheetSelector(sheetNames);
  } else {
    parsedLista = parsedListaSheets[sheetNames[0]];
    renderListaPreview();
    showToast(`${parsedLista.length} itens encontrados!`);
  }
}

function parseSheetToItems(rows) {
  if (rows.length < 2) return [];

  // Find the header row (first row with at least 3 non-empty cells that look like headers)
  let headerIdx = -1;
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const filled = rows[i].filter(c => String(c).trim().length > 0).length;
    const headerLike = rows[i].some(c => {
      const s = String(c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
      return ["item","descricao","produto","unid","quant","preco","valor","qtd","unidade"].some(k => s.includes(k));
    });
    if (filled >= 3 && headerLike) { headerIdx = i; break; }
  }
  if (headerIdx === -1) return [];

  const header = rows[headerIdx].map(h => String(h).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim());
  const colMap = detectColumns(header);

  if (colMap.descricao === -1) return [];

  // Also scan sub-header rows (headerIdx+1) for additional labels like "valor unitário"
  let colReaj = -1;
  // Check the row right after header for sub-labels
  if (headerIdx + 1 < rows.length) {
    const subRow = rows[headerIdx + 1].map(c => String(c).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim());
    for (let i = 0; i < subRow.length; i++) {
      if (subRow[i].includes("valor unit") || subRow[i].includes("reajust")) {
        colReaj = i; break;
      }
    }
  }

  // Check main header for reajustado column too
  if (colReaj === -1) {
    for (let i = header.length - 1; i >= 0; i--) {
      if (header[i].includes("reajust")) { colReaj = i; break; }
    }
  }

  // If price column not found by header, detect it from data:
  // Find the first column after unidade that has numeric values (likely price)
  if (colMap.preco === -1 && colMap.valorTotal === -1) {
    const startCol = Math.max(colMap.unidade >= 0 ? colMap.unidade + 1 : 3, 2);
    // Check first data rows to find a column with decimal numbers (prices)
    for (let col = startCol; col < (rows[headerIdx] || []).length && col < 10; col++) {
      let numericCount = 0;
      let hasDecimal = false;
      for (let r = headerIdx + 1; r < Math.min(headerIdx + 6, rows.length); r++) {
        const val = rows[r][col];
        if (typeof val === "number" && val > 0) {
          numericCount++;
          if (val !== Math.floor(val)) hasDecimal = true;
        }
      }
      // If most data rows have numbers in this col and at least one has decimals, it's likely price
      if (numericCount >= 2 && hasDecimal) {
        // Check if this is likely a total column (values seem too high for unit prices)
        // Heuristic: compare value with quantity — if value/qty gives reasonable unit price, it's a total
        const hdrLabel = header[col] || '';
        if (hdrLabel.includes('valor') || hdrLabel.includes('total') || hdrLabel.includes('subtotal')) {
          colMap.valorTotal = col;
        } else {
          colMap.preco = col;
        }
        break;
      }
    }
  }

  const itens = [];
  let num = 0;
  // Skip sub-header row if it exists (row after header that has no item number)
  const dataStart = (headerIdx + 1 < rows.length && !rows[headerIdx + 1][0]) ? headerIdx + 2 : headerIdx + 1;

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    const desc = colMap.descricao >= 0 ? String(row[colMap.descricao] || "").trim() : "";
    if (!desc || desc.length < 2) continue;

    // Skip sub-header rows
    const descLower = desc.toLowerCase();
    if (descLower.includes("descri") || descLower.includes("total")) continue;

    const unidade = colMap.unidade >= 0 ? String(row[colMap.unidade] || "Un").trim() : "Un";
    const qtd = colMap.quantidade >= 0 ? parseNum(row[colMap.quantidade]) : 1;

    // Prefer reajusted price if available
    let preco = 0;
    let isTotal = false;
    if (colReaj >= 0 && parseNum(row[colReaj]) > 0) {
      preco = parseNum(row[colReaj]);
    } else if (colMap.preco >= 0) {
      preco = parseNum(row[colMap.preco]);
    } else if (colMap.valorTotal >= 0) {
      // Column is "Valor" / "Total" — divide by quantity to get unit price
      preco = parseNum(row[colMap.valorTotal]);
      isTotal = true;
    }

    // If price was from a total column, calculate unit price
    if (isTotal && qtd > 0 && preco > 0) {
      preco = Math.round((preco / qtd) * 100) / 100;
    }

    num++;
    itens.push({ num, descricao: desc, unidade, quantidade: qtd || 1, preco });
  }

  return itens;
}

function renderSheetSelector(sheetNames) {
  document.getElementById("lista-dados-contrato").style.display = "block";
  document.getElementById("lista-preview").style.display = "block";

  // Show sheet tabs
  let selectorHtml = `<div style="margin-bottom:1rem">
    <label style="font-size:.8rem;color:var(--mut);display:block;margin-bottom:.5rem">A planilha possui ${sheetNames.length} abas. Selecione quais importar:</label>
    <div style="display:flex;gap:.5rem;flex-wrap:wrap">
      ${sheetNames.map((name, i) => {
        const count = parsedListaSheets[name].length;
        return `<label style="display:flex;align-items:center;gap:.4rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;padding:.5rem .8rem;cursor:pointer;font-size:.85rem">
          <input type="checkbox" class="sheet-check" value="${esc(name)}" checked onchange="updateListaFromSheets()">
          <strong>${esc(name)}</strong> <span style="color:var(--mut);font-size:.75rem">(${count} itens)</span>
        </label>`;
      }).join("")}
    </div>
  </div>`;

  // Insert selector before the table
  const previewCard = document.getElementById("lista-preview");
  let existing = document.getElementById("sheet-selector");
  if (existing) existing.remove();
  const div = document.createElement("div");
  div.id = "sheet-selector";
  div.innerHTML = selectorHtml;
  previewCard.insertBefore(div, previewCard.querySelector(".table-wrap"));

  updateListaFromSheets();
}

function updateListaFromSheets() {
  const checks = document.querySelectorAll(".sheet-check:checked");
  const selectedNames = Array.from(checks).map(c => c.value);

  // Merge items from selected sheets
  let merged = [];
  let num = 0;
  for (const name of selectedNames) {
    const items = parsedListaSheets[name] || [];
    for (const item of items) {
      num++;
      merged.push({ ...item, num, aba: name });
    }
  }

  parsedLista = merged;
  renderListaPreview();
}

function detectColumns(header) {
  const map = { descricao: -1, unidade: -1, quantidade: -1, preco: -1, valorTotal: -1 };
  const patterns = {
    descricao: ["descricao", "produto", "nome", "material", "especificacao", "mercadoria"],
    unidade: ["unidade", "unid.", "unid", "medida", "und"],
    quantidade: ["quantidade", "qtd", "qtde", "quant.", "quant", "qty"],
    preco: ["r$ unit", "preco unit", "preco", "valor unit", "unitario", "vl unit", "vl. unit"],
    valorTotal: ["valor total", "valor", "total", "vl total", "subtotal"]
  };

  for (const [field, keywords] of Object.entries(patterns)) {
    for (let i = 0; i < header.length; i++) {
      if (keywords.some(k => header[i].includes(k))) {
        map[field] = i;
        break;
      }
    }
  }

  // Fallback: if descricao not found, look for "item" but only if it's a text column (not numeric)
  if (map.descricao === -1) {
    for (let i = 0; i < header.length; i++) {
      if (header[i] === "item" && i > 0) continue; // skip first col that's likely #
      if (header[i].includes("item") && !header[i].includes("qtd")) { map.descricao = i; break; }
    }
  }

  return map;
}

function parseNum(val) {
  if (typeof val === "number") return val;
  const s = String(val).replace(/[^\d.,-]/g, "").replace(/\.(?=.*[.,])/g, "").replace(",", ".");
  return parseFloat(s) || 0;
}

function autoFillMetadataFromRows(rows) {
  // Scan top 15 rows for metadata
  for (let i = 0; i < Math.min(15, rows.length); i++) {
    const rowText = rows[i].map(c => String(c).trim()).join(" ").toUpperCase();
    // Look for escola/caixa escolar
    if (rowText.includes("CAIXA ESCOLAR") || rowText.includes("ESCOLA ESTADUAL") || rowText.includes("ESCOLA MUNICIPAL")) {
      // Try to find the actual name (non-label cell)
      for (const cell of rows[i]) {
        const s = String(cell).trim();
        if (s.length > 5 && !s.toUpperCase().startsWith("CAIXA ESCOLAR:") && !s.toUpperCase().startsWith("ESCOLA ESTADUAL:") && !s.toUpperCase().startsWith("ESCOLA MUNICIPAL:")) {
          const el = document.getElementById("lista-escola");
          if (el && !el.value) el.value = s;
          break;
        }
      }
    }
    // Look for processo/edital number
    const match = rowText.match(/(\d{1,4}\/20\d{2})/);
    if (match) {
      const el = document.getElementById("lista-processo");
      if (el && !el.value) el.value = match[1];
    }
  }
}

function renderListaPreview() {
  if (!parsedLista) return;
  document.getElementById("lista-dados-contrato").style.display = "block";
  document.getElementById("lista-preview").style.display = "block";
  document.getElementById("lista-count").textContent = `(${parsedLista.length} itens)`;

  let total = 0;
  document.getElementById("lista-preview-tbody").innerHTML = parsedLista.map(item => {
    const subtotal = item.preco * item.quantidade;
    total += subtotal;
    return `<tr>
      <td class="text-center">${item.num}</td>
      <td>${esc(item.descricao)}</td>
      <td class="nowrap">${esc(item.unidade)}</td>
      <td class="text-right font-mono">${item.quantidade}</td>
      <td class="text-right font-mono">${item.preco > 0 ? brl.format(item.preco) : '-'}</td>
      <td class="text-right font-mono" style="font-weight:700;color:var(--green)">${subtotal > 0 ? brl.format(subtotal) : '-'}</td>
    </tr>`;
  }).join("");
  document.getElementById("lista-total").textContent = brl.format(total);
}

function criarContratoLista() {
  if (!parsedLista || parsedLista.length === 0) return;

  const escola = (document.getElementById("lista-escola")?.value || "").trim();
  if (!escola) { showToast("Preencha o nome da escola/orgao.", 3000); return; }

  const now = new Date();
  const id = `CTR-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`;

  const contrato = {
    id,
    escola,
    edital: (document.getElementById("lista-edital")?.value || "").trim(),
    processo: (document.getElementById("lista-processo")?.value || "").trim(),
    vigencia: (document.getElementById("lista-vigencia")?.value || "").trim(),
    objeto: (document.getElementById("lista-objeto")?.value || "").trim(),
    observacoes: (document.getElementById("lista-observacoes")?.value || "").trim(),
    criterio: "",
    dataApuracao: now.toISOString().slice(0, 10),
    dataCriacao: now.toISOString(),
    fornecedor: "Lariucci & Ribeiro Pereira",
    status: "ativo",
    itens: parsedLista.map(item => {
      const ncmMatch = findNcmLocal(item.descricao);
      return {
        num: item.num,
        descricao: item.descricao,
        unidade: item.unidade,
        qtdContratada: item.quantidade,
        precoUnitario: item.preco,
        qtdEntregue: 0,
        ncm: ncmMatch ? ncmMatch.ncm : ""
      };
    }),
    fornecedoresMapa: []
  };

  const clienteVinculado = findClienteBySchoolName(contrato.escola);
  if (clienteVinculado) vincularClienteAoContrato(contrato, clienteVinculado);
  contratos.push(contrato);
  saveContratos();
  if (clienteVinculado) saveUsuarios();

  // Auto-preencher NCM + cadastrar itens no ERP (background, non-blocking)
  const ncmResult2 = autoPreencherNcm(contrato.id);
  if (ncmResult2.pending > 0) classificarNcmIA(contrato.id);

  // Bridge 4: Contrato → Banco (preço confirmado)
  if (typeof bancoPrecos !== 'undefined' && bancoPrecos.itens) {
    (contrato.itens || []).forEach(function(item) {
      if (!item.skuVinculado) return;
      var bp = bancoPrecos.itens.find(function(b) { return b.sku === item.skuVinculado || normalizedText(b.item) === normalizedText(item.descricao); });
      if (bp) {
        if (!bp.propostas) bp.propostas = [];
        bp.propostas.push({ edital: contrato.processo || contrato.id, escola: contrato.escola, preco: item.precoUnitario, data: new Date().toISOString().slice(0,10), tipo: 'contrato' });
        if (!bp.precoReferenciaHistorico || item.precoUnitario > 0) {
          var ganhos = bp.propostas.filter(function(p) { return p.tipo === 'contrato'; });
          bp.precoReferenciaHistorico = ganhos.reduce(function(s,p) { return s + p.preco; }, 0) / ganhos.length;
        }
      }
    });
    saveBancoLocal();
  }

  // Reset
  cancelListaImport();
  showToast(`Contrato ${id} criado com ${parsedLista.length} itens!`);
  parsedLista = null;
  renderAll();
  switchTab("contratos");
}

function cancelListaImport() {
  parsedLista = null;
  document.getElementById("lista-dados-contrato").style.display = "none";
  document.getElementById("lista-preview").style.display = "none";
  document.getElementById("file-input-lista").value = "";
  document.getElementById("lista-escola").value = "";
  document.getElementById("lista-processo").value = "";
  document.getElementById("lista-edital").value = "";
  document.getElementById("lista-vigencia").value = "";
  document.getElementById("lista-objeto").value = "";
  document.getElementById("lista-observacoes").value = "";
}

// Drag & drop for lista upload
(function() {
  const zone = document.getElementById("upload-zone-lista");
  if (!zone) return;
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleListaUpload(e.dataTransfer.files[0]);
  });
})();

function cancelImport() {
  parsedMapa = null;
  selectedSupplierIdx = null;
  document.getElementById("import-preview").classList.add("hidden");
  document.getElementById("file-input").value = "";
}

// ===== CRONOGRAMA DE ENTREGA IMPORT =====
let parsedCrono = null;
let cronoFiles = [];

async function handleCronoFiles(files) {
  if (!files || files.length === 0) return;
  setImportMode('crono');
  cronoFiles = [];
  const allContratos = [];
  let escola = '', cnpj = '', endereco = '', telefone = '', fornecedor = '';
  let allDatas = new Set();

  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      let result;
      if (ext === 'json') {
        result = await readCronoJSON(file);
      } else if (ext === 'pdf') {
        result = await readCronoPDF(file);
      } else if (ext === 'xlsx' || ext === 'xls') {
        result = await readCronoExcel(file);
      } else if (ext === 'docx') {
        result = await readCronoWord(file);
      } else {
        showToast("Formato nao suportado: " + ext, 3000);
        continue;
      }
      if (result) {
        if (result.escola) escola = result.escola;
        if (result.cnpj) cnpj = result.cnpj;
        if (result.endereco) endereco = result.endereco;
        if (result.telefone) telefone = result.telefone;
        if (result.fornecedor) fornecedor = result.fornecedor;
        (result.datas || []).forEach(d => allDatas.add(d));
        (result.contratos || []).forEach(c => allContratos.push(c));
        cronoFiles.push(file.name);
      }
    } catch(err) {
      showToast("Erro ao ler " + file.name + ": " + err.message, 3000);
    }
  }

  if (allContratos.length === 0) {
    showToast("Nenhum cronograma encontrado nos arquivos.", 3000);
    return;
  }

  parsedCrono = {
    escola, cnpj, endereco, telefone, fornecedor,
    datas: [...allDatas].sort((a, b) => {
      const [da, ma] = a.split('/'); const [db, mb] = b.split('/');
      return (parseInt(ma)*100 + parseInt(da)) - (parseInt(mb)*100 + parseInt(db));
    }),
    contratos: allContratos
  };
  renderCronoPreview();
}

function handleCronoUpload(file) { handleCronoFiles([file]); }

async function readCronoJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => { try { resolve(JSON.parse(e.target.result)); } catch(err) { reject(err); } };
    reader.readAsText(file, 'utf-8');
  });
}

async function readCronoPDF(file) {
  if (!window.pdfjsLib) throw new Error("PDF.js nao carregado");
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;

  // Only parse page 1 (the actual data table)
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();

  // Group text items by Y coordinate (rows) with tolerance for sub-pixel differences
  const Y_TOLERANCE = 4;
  const rawItems = content.items.map(item => ({
    y: Math.round(item.transform[5]),
    x: Math.round(item.transform[4]),
    text: item.str.trim()
  })).filter(i => i.text);

  // Cluster Y values within tolerance
  const yClusters = [];
  const sortedByY = [...rawItems].sort((a, b) => b.y - a.y);
  sortedByY.forEach(item => {
    const existing = yClusters.find(c => Math.abs(c.y - item.y) <= Y_TOLERANCE);
    if (existing) {
      existing.items.push(item);
      existing.y = Math.round(existing.items.reduce((s, i) => s + i.y, 0) / existing.items.length);
    } else {
      yClusters.push({ y: item.y, items: [item] });
    }
  });

  // Sort clusters top-to-bottom and build rows
  yClusters.sort((a, b) => b.y - a.y);
  const rows = yClusters.map(c => c.items.sort((a, b) => a.x - b.x));

  // Extract header info from top rows
  let escola = '', cnpj = '', processo = '', fornecedor = '', recurso = 'Geral';
  const allText = rows.map(r => r.map(c => c.text).join(' ')).join('\n');

  const escolaMatch = allText.match(/Caixa Escolar[^\n]*/i);
  if (escolaMatch) escola = escolaMatch[0].replace(/CNJP.*/, '').replace(/CNPJ.*/, '').trim();
  const cnpjMatch = allText.match(/CNJ?P\s*n?[°º]?\s*([\d.\/\-]+)/i);
  if (cnpjMatch) cnpj = cnpjMatch[1];
  const procMatch = allText.match(/(?:PAS|PROCESSO)[^\d]*(\d{1,4}\/\d{4})/i);
  if (procMatch) processo = procMatch[1];
  const fornMatch = allText.match(/FORNECEDOR:\s*([^\n]+)/i);
  if (fornMatch) fornecedor = fornMatch[1].trim();

  const fnLower = file.name.toLowerCase();
  if (fnLower.includes('federal') || allText.toLowerCase().includes('pnae')) recurso = 'PNAE';
  else if (fnLower.includes('estadual') || allText.toLowerCase().includes('contrapartida')) recurso = 'Contrapartida';

  // Find the header row with "Data DD/MM" patterns to get column positions
  let dateColumns = []; // { x, date }
  let headerRowIdx = -1;
  for (let ri = 0; ri < rows.length; ri++) {
    const dateCols = rows[ri].filter(c => /^Data\s+\d{2}\/\d{2}$/.test(c.text) || /^\d{2}\/\d{2}$/.test(c.text));
    if (dateCols.length >= 5) {
      dateColumns = dateCols.map(c => ({
        x: c.x,
        date: c.text.replace('Data ', '')
      }));
      headerRowIdx = ri;
      break;
    }
  }

  // Also check for "Data" and "DD/MM" on separate items at same Y
  if (dateColumns.length === 0) {
    for (let ri = 0; ri < rows.length; ri++) {
      const row = rows[ri];
      const dateItems = [];
      for (let ci = 0; ci < row.length; ci++) {
        if (row[ci].text === 'Data' && ci + 1 < row.length && /^\d{2}\/\d{2}$/.test(row[ci + 1].text)) {
          dateItems.push({ x: row[ci].x, date: row[ci + 1].text });
          ci++; // skip the date part
        }
      }
      if (dateItems.length >= 5) {
        dateColumns = dateItems;
        headerRowIdx = ri;
        break;
      }
    }
  }

  if (dateColumns.length === 0 || headerRowIdx < 0) {
    // Cronograma sem colunas de data detectadas = PDF provavelmente escaneado
    // Tentar text parsing primeiro como fallback rapido
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const ct = await pg.getTextContent();
      const lines = [];
      let lastY = null, curLine = '';
      ct.items.forEach(it => {
        const yy = Math.round(it.transform[5]);
        if (lastY !== null && Math.abs(yy - lastY) > 3) { lines.push(curLine); curLine = ''; }
        curLine += it.str + ' ';
        lastY = yy;
      });
      if (curLine.trim()) lines.push(curLine);
      fullText += lines.join('\n') + '\n';
    }
    const textResult = parseCronoText(fullText, file.name);

    // Se text parsing encontrou resultado robusto (5+ itens), usar
    if (textResult && textResult.contratos && textResult.contratos.some(c => c.itens.length >= 5)) {
      return textResult;
    }

    // Caso contrario, usar OCR via IA (visão) — cronograma precisa de todos os itens
    showToast("PDF sem tabela de datas detectada. Processando via OCR (IA)... Aguarde.", 15000);
    return await readCronoPdfOCR(pdf, file.name);
  }

  const datas = dateColumns.map(d => d.date);

  // Find column positions for PRODUTO, VR. UNIT., TOTAL
  let prodXMin = 0, prodXMax = 0, precoX = 0, totalQtyX = 0, totalValX = 0, itemNumX = 0;
  const headerRow = rows[headerRowIdx];
  const totalPositions = [];
  headerRow.forEach(c => {
    if (c.text === 'PRODUTO') { prodXMin = c.x; }
    if (c.text.includes('VR.') || c.text.includes('UNIT')) { precoX = c.x; }
    if (c.text === 'TOTAL') { totalPositions.push(c.x); }
    if (c.text.includes('ITENS')) { itemNumX = c.x; }
  });
  // First TOTAL = quantity total, second TOTAL = value total
  if (totalPositions.length >= 2) {
    totalPositions.sort((a,b) => a - b);
    totalQtyX = totalPositions[0];
    totalValX = totalPositions[1];
  } else if (totalPositions.length === 1) {
    totalQtyX = totalPositions[0];
  }
  const lastDateX = Math.max(...dateColumns.map(d => d.x));
  // Cutoff: anything beyond lastDateX + margin is post-date columns
  const postDateCutoff = lastDateX + 15;

  // Parse data rows (rows after header)
  const items = [];
  const dateXPositions = dateColumns.map(d => d.x);
  const firstDateX = Math.min(...dateXPositions);

  for (let ri = headerRowIdx + 1; ri < rows.length; ri++) {
    const row = rows[ri];
    if (row.length < 5) continue;

    // Find product name (between unit and price columns)
    let unidade = '', descricao = '', preco = 0, itemNum = '';
    const qtdByDate = {};
    let totalQty = 0;

    // Collect text items by position
    const beforeDates = row.filter(c => c.x < firstDateX - 10);
    const inDates = row.filter(c => c.x >= firstDateX - 10);

    // Parse unit, product, price from pre-date columns
    beforeDates.forEach(c => {
      if (/^(Kg|Pc\([^)]*\)|Lt\([^)]*\)|Fr\([^)]*\)|Un|Cx|Pct|Bd|Mç|Dz|L|G)$/i.test(c.text)) {
        unidade = c.text;
      } else if (/^R\$/.test(c.text)) {
        const pStr = c.text.replace('R$', '').replace(/\s+/g, '').replace(',', '.');
        preco = parseFloat(pStr) || 0;
      } else if (/^\d+[,.]?\d*$/.test(c.text) && !unidade) {
        // quantity before unit — skip (will be captured as QUANT)
      } else if (/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇÑ]/.test(c.text) && c.text.length > 1 && !/^\d/.test(c.text) && !/^R\$/.test(c.text)) {
        descricao = descricao ? descricao + ' ' + c.text : c.text;
      }
    });

    if (!descricao || !unidade) continue;

    // Fix broken prices — R$ and value often on separate cells
    if (preco === 0) {
      // Find R$ marker and take the next numeric cell as price
      for (let ci = 0; ci < beforeDates.length; ci++) {
        if (/R\$/.test(beforeDates[ci].text)) {
          // Collect adjacent numeric fragments after R$
          const fragments = [];
          for (let cj = ci; cj < beforeDates.length; cj++) {
            const t = beforeDates[cj].text.replace('R$', '').trim();
            if (t) fragments.push(t);
          }
          const pStr = fragments.join('').replace(/\s+/g, '').replace(/\./g, '').replace(',', '.');
          preco = parseFloat(pStr) || 0;
          break;
        }
      }
    }

    // Match quantities to dates by closest X position
    inDates.forEach(c => {
      if (/R\$/.test(c.text) || /[,.]/.test(c.text)) return; // Skip monetary values
      const val = parseInt(c.text);
      if (isNaN(val) || val <= 0) return;

      // Post-date zone: TOTAL qty, TOTAL R$, ITENS-PAS
      if (c.x > postDateCutoff) {
        if (totalQtyX > 0 && Math.abs(c.x - totalQtyX) < 15) {
          totalQty = val;
        } else if (itemNumX > 0 && Math.abs(c.x - itemNumX) < 15) {
          itemNum = String(val);
        } else if (!totalQty && totalValX === 0) {
          totalQty = val; // First number after dates = total qty
        }
        return;
      }

      // Date zone: find closest date column
      let closestDate = null;
      let closestDist = Infinity;
      dateColumns.forEach(dc => {
        const dist = Math.abs(c.x - dc.x);
        if (dist < closestDist) { closestDist = dist; closestDate = dc.date; }
      });

      if (closestDate && closestDist < 20 && val > 0) {
        qtdByDate[closestDate] = val;
      }
    });

    if (Object.keys(qtdByDate).length === 0) continue;
    if (!totalQty) totalQty = Object.values(qtdByDate).reduce((s, v) => s + v, 0);

    items.push({
      num: itemNum,
      descricao,
      unidade,
      precoUnitario: preco,
      qtdContratada: totalQty,
      cronograma: qtdByDate
    });
  }

  if (items.length === 0) {
    showToast("PDF: nenhum item extraido de " + file.name + ". Tente importar como JSON.", 4000);
    return null;
  }

  const total = items.reduce((s, it) => s + (it.precoUnitario || 0) * (it.qtdContratada || it.quantidade || 0), 0);
  const endMatch = allText.match(/Rua[^\n–—]*/i);

  return {
    escola: escola || 'Escola nao identificada',
    cnpj,
    endereco: endMatch ? endMatch[0].trim() : '',
    telefone: '',
    fornecedor,
    datas,
    contratos: [{
      processo,
      recurso,
      tipo: recurso === 'PNAE' ? 'Federal' : (recurso === 'Contrapartida' ? 'Estadual' : 'Geral'),
      objeto: 'Aquisicao de generos alimenticios - ' + recurso,
      obs: 'Recurso ' + recurso + ' - Processo de Aquisicao Simplificada ' + processo,
      itens: items,
      total: Math.round(total * 100) / 100
    }]
  };
}

async function readCronoPdfOCR(pdf, filename) {
  // Render all pages to images
  const allImages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const scale = 1.8;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;
    allImages.push(canvas.toDataURL("image/jpeg", 0.7));
  }

  // Build vision request — send all pages to AI
  const imageContent = allImages.map(img => ({
    type: "image_url",
    image_url: { url: img }
  }));

  const fnLower = filename.toLowerCase();
  let recursoHint = '';
  if (fnLower.includes('federal') || fnLower.includes('pnae')) recursoHint = 'PNAE (Federal)';
  else if (fnLower.includes('estadual') || fnLower.includes('contrapartida')) recursoHint = 'Contrapartida (Estadual)';

  const prompt = `Você é um especialista em extrair dados de CRONOGRAMAS DE ENTREGA de licitações de Caixas Escolares em Minas Gerais.

Analise as imagens deste PDF e extraia TODOS os dados em JSON. O documento é um cronograma de entrega com:
- Dados da escola (nome, CNPJ)
- Nome do fornecedor
- Número do processo (PAS)
- Tabela com: produtos, unidades, preços unitários, e quantidades por data de entrega
${recursoHint ? '- Recurso: ' + recursoHint : ''}

Retorne APENAS JSON válido neste formato EXATO (sem markdown, sem texto extra):
{
  "escola": "nome da caixa escolar",
  "cnpj": "XX.XXX.XXX/XXXX-XX",
  "fornecedor": "nome do fornecedor",
  "processo": "XXX/XXXX",
  "recurso": "PNAE ou Contrapartida",
  "datas": ["DD/MM", "DD/MM", ...],
  "itens": [
    {
      "num": "número do item",
      "descricao": "NOME DO PRODUTO",
      "unidade": "Kg ou Pc(XXX) ou Lt(XXX) ou Fr(XXX) ou Un",
      "precoUnitario": 0.00,
      "qtdContratada": 0,
      "cronograma": { "DD/MM": qty, "DD/MM": qty }
    }
  ],
  "total": 0.00
}

IMPORTANTE:
- Extraia TODOS os itens da tabela, não apenas alguns
- Os preços unitários devem ser números decimais (ex: 19.40, não "R$ 19,40")
- As quantidades no cronograma são números inteiros por data
- qtdContratada é o TOTAL de todas as datas somadas
- O total é a soma de (precoUnitario * qtdContratada) de todos os itens`;

  const content = [
    { type: "text", text: prompt },
    ...imageContent
  ];

  try {
    const resp = await fetch("/api/ai-parse-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texto: "__OCR_IMAGE_MODE__",
        formato: "cronograma_ocr",
        _ocrMessages: [{ role: "user", content }]
      })
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || "Erro na API OCR: " + resp.status);
    }

    const data = await resp.json();

    // Parse AI response into cronograma format
    const result = typeof data === 'string' ? JSON.parse(data) : data;

    const recurso = result.recurso || recursoHint || 'Geral';
    const processo = result.processo || '';
    const datas = result.datas || [];
    const itens = (result.itens || []).map(it => ({
      num: String(it.num || ''),
      descricao: it.descricao || '',
      unidade: it.unidade || 'Un',
      precoUnitario: Number(it.precoUnitario) || 0,
      qtdContratada: Number(it.qtdContratada) || Object.values(it.cronograma || {}).reduce((s, v) => s + (Number(v) || 0), 0),
      cronograma: it.cronograma || {}
    }));

    if (itens.length === 0) {
      showToast("OCR: nenhum item extraido do PDF. Tente importar como JSON.", 5000);
      return null;
    }

    const total = result.total || itens.reduce((s, it) => s + (it.precoUnitario || 0) * (it.qtdContratada || it.quantidade || 0), 0);

    showToast(`OCR concluido: ${itens.length} itens extraidos!`, 4000);

    return {
      escola: result.escola || 'Escola nao identificada',
      cnpj: result.cnpj || '',
      endereco: '',
      telefone: '',
      fornecedor: result.fornecedor || '',
      datas,
      contratos: [{
        processo,
        recurso,
        tipo: recurso.includes('PNAE') ? 'Federal' : (recurso.includes('Contrapartida') ? 'Estadual' : 'Geral'),
        objeto: 'Aquisicao de generos alimenticios - ' + recurso,
        obs: 'Recurso ' + recurso + ' - Processo ' + processo,
        itens,
        total: Math.round(total * 100) / 100
      }]
    };
  } catch (err) {
    showToast("Erro no OCR: " + err.message + ". Tente importar como JSON.", 6000);
    return null;
  }
}

async function readCronoExcel(file) {
  if (!window.XLSX) throw new Error("SheetJS nao carregado");
  const data = await file.arrayBuffer();
  const wb = XLSX.read(data, { type: 'array' });
  let fullText = '';
  wb.SheetNames.forEach(name => {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    rows.forEach(row => { fullText += row.join('\t') + '\n'; });
    fullText += '\n===SHEET===\n';
  });
  return parseCronoText(fullText, file.name);
}

async function readCronoWord(file) {
  // Extract text from docx using JSZip
  const data = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(data);
  const docXml = await zip.file('word/document.xml').async('text');
  const text = docXml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  return parseCronoText(text, file.name);
}

function parseCronoText(text, filename) {
  // Extract escola info
  let escola = '', cnpj = '', endereco = '', telefone = '', fornecedor = '';
  const escolaMatch = text.match(/Caixa Escolar[^\n]*/i);
  if (escolaMatch) escola = escolaMatch[0].replace(/CNJP.*/, '').trim();
  const cnpjMatch = text.match(/CNJ?P\s*n?[°º]?\s*([\d./-]+)/i);
  if (cnpjMatch) cnpj = cnpjMatch[1];
  const foneMatch = text.match(/Fone:\s*([^\n–—]+)/i);
  if (foneMatch) telefone = foneMatch[1].trim();
  const fornMatch = text.match(/FORNECEDOR:\s*([^\n]+)/i);
  if (fornMatch) fornecedor = fornMatch[1].trim();

  // Extract process number
  const procMatch = text.match(/(?:PROCESSO|PAS)\s*(?:DE AQUISI[ÇC][ÃA]O SIMPLIFICADA)?\s*(\d{1,4}\/\d{4})/i);
  const processo = procMatch ? procMatch[1] : '';

  // Detect resource type from filename or text
  let recurso = 'Geral';
  const fnLower = filename.toLowerCase();
  const textLower = text.toLowerCase();
  if (fnLower.includes('federal') || textLower.includes('pnae')) recurso = 'PNAE';
  else if (fnLower.includes('estadual') || textLower.includes('contrapartida')) recurso = 'Contrapartida';

  // Find delivery dates: "Data DD/MM" pattern
  const dateRegex = /Data\s+(\d{2}\/\d{2})/gi;
  const datas = [];
  let dm;
  while ((dm = dateRegex.exec(text)) !== null) {
    if (!datas.includes(dm[1])) datas.push(dm[1]);
  }
  // Cap at unique dates (avoid duplicates from page 2)
  const uniqueDatas = [...new Set(datas)];

  if (uniqueDatas.length === 0) {
    showToast("Nenhuma data de entrega encontrada no arquivo: " + filename, 3000);
    return null;
  }

  // Parse items: look for lines with product data
  // Format: QTY UNIT PRODUCT PRICE date_qtys... TOTAL TOTAL_VALUE ITEM_NUM
  // Or tabular: UNIT PRODUCT PRICE date_qtys...
  const items = [];
  const lines = text.split('\n');

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li].trim();
    if (!line) continue;

    // Try to match product lines - look for unit patterns at the start
    const unitMatch = line.match(/^(\d+[\.,]?\d*)\s+(Kg|Pc\([^)]+\)|Lt\([^)]+\)|Fr\([^)]+\)|Un|L)\s+(.+)/i) ||
                      line.match(/^(Kg|Pc\([^)]+\)|Lt\([^)]+\)|Fr\([^)]+\)|Un|L)\s+(.+)/i);

    if (!unitMatch) continue;

    let unidade, restLine;
    if (unitMatch[3]) {
      // Format: QTY UNIT REST
      unidade = unitMatch[2];
      restLine = unitMatch[3];
    } else {
      // Format: UNIT REST
      unidade = unitMatch[1];
      restLine = unitMatch[2];
    }

    // Extract product name (uppercase letters until price)
    const prodMatch = restLine.match(/^([A-ZÀÁÂÃÉÊÍÓÔÕÚÜÇÑ\s\/]+)\s+R\$\s*([\d\s.,]+)/);
    if (!prodMatch) continue;

    const descricao = prodMatch[1].trim();
    const precoRaw = prodMatch[2].replace(/\s+/g, '').replace(',', '.');
    const preco = parseFloat(precoRaw) || 0;
    if (!descricao || preco <= 0) continue;

    // Extract quantities after price - these are the date quantities
    const afterPrice = restLine.substring(restLine.indexOf(prodMatch[0]) + prodMatch[0].length).trim();
    const nums = afterPrice.split(/\s+/).map(n => parseInt(n) || 0);

    // Last few numbers are: TOTAL, TOTAL_VALUE parts, ITEM_NUM
    // Try to find the cronograma quantities by matching against date count
    const cronograma = {};
    let totalQty = 0;

    // The quantities should align with the dates
    for (let di = 0; di < uniqueDatas.length && di < nums.length; di++) {
      if (nums[di] > 0) {
        cronograma[uniqueDatas[di]] = nums[di];
        totalQty += nums[di];
      }
    }

    // Try to get total from after the date quantities
    const totalIdx = uniqueDatas.length;
    if (totalIdx < nums.length && nums[totalIdx] > 0) {
      totalQty = nums[totalIdx]; // Use the explicit total
    }

    // Get item number (usually last number)
    const itemNum = nums.length > 0 ? String(nums[nums.length - 1]) : '';

    if (totalQty > 0 && Object.keys(cronograma).length > 0) {
      items.push({
        num: itemNum,
        descricao,
        unidade,
        precoUnitario: preco,
        qtdContratada: totalQty,
        cronograma
      });
    }
  }

  if (items.length === 0) {
    showToast("Nenhum item encontrado no cronograma: " + filename, 3000);
    return null;
  }

  const total = items.reduce((s, it) => s + (it.precoUnitario || 0) * (it.qtdContratada || it.quantidade || 0), 0);

  // Try to get address from text
  const endMatch = text.match(/Rua[^\n–—]*/i);
  if (endMatch) endereco = endMatch[0].trim();

  return {
    escola: escola || 'Escola não identificada',
    cnpj, endereco, telefone, fornecedor,
    datas: uniqueDatas,
    contratos: [{
      processo,
      recurso,
      tipo: recurso === 'PNAE' ? 'Federal' : (recurso === 'Contrapartida' ? 'Estadual' : 'Geral'),
      objeto: `Aquisição de gêneros alimentícios - ${recurso}`,
      obs: `Recurso ${recurso} - Processo de Aquisição Simplificada ${processo}`,
      itens: items,
      total: Math.round(total * 100) / 100
    }]
  };
}

function renderCronoPreview() {
  if (!parsedCrono) return;
  document.getElementById("crono-preview").style.display = "block";

  // Escola info
  document.getElementById("crono-escola-info").innerHTML = `
    <strong>${parsedCrono.escola || ''}</strong><br>
    <span style="color:var(--mut)">CNPJ: ${parsedCrono.cnpj || ''} | ${parsedCrono.endereco || ''} | ${parsedCrono.telefone || ''}</span><br>
    <span style="color:var(--mut)">Fornecedor: ${parsedCrono.fornecedor || ''}</span><br>
    <span style="color:var(--blue);font-weight:600">${parsedCrono.datas.length} datas de entrega programadas</span>
  `;

  // Contracts list
  let html = '';
  (parsedCrono.contratos || []).forEach((ctr, ci) => {
    const totalPedidos = parsedCrono.datas.length;
    html += `<div class="card" style="margin-bottom:1rem;border-left:3px solid var(--blue)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem">
        <div>
          <h4 style="margin:0;color:var(--blue)">Contrato ${ci+1}: ${esc(ctr.recurso || '')} — Proc. ${esc(ctr.processo || '')}</h4>
          <div style="font-size:.82rem;color:var(--mut)">${esc(ctr.objeto || ctr.obs || '')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:1.1rem;font-weight:800;color:var(--green)">${brl.format(ctr.total)}</div>
          <div style="font-size:.8rem;color:var(--mut)">${ctr.itens.length} itens</div>
        </div>
      </div>
      <div style="font-size:.82rem;margin-bottom:.5rem;font-weight:600">Itens do contrato:</div>
      <div class="table-wrap" style="max-height:250px;overflow-y:auto">
        <table><thead><tr><th>#</th><th>Produto</th><th>Unid.</th><th class="text-right">Qtd</th><th class="text-right">Preco Unit.</th><th class="text-right">Total</th></tr></thead><tbody>`;
    ctr.itens.forEach(it => {
      const sub = it.precoUnitario * it.qtdContratada;
      html += `<tr><td>${esc(it.num)}</td><td>${esc(it.descricao)}</td><td>${esc(it.unidade)}</td><td class="text-right">${it.qtdContratada}</td><td class="text-right">${brl.format(it.precoUnitario)}</td><td class="text-right font-mono" style="color:var(--green)">${brl.format(sub)}</td></tr>`;
    });
    html += `</tbody></table></div>
      <div style="margin-top:.8rem;font-size:.82rem;font-weight:600">Pedidos agendados (${totalPedidos} entregas):</div>
      <div style="display:flex;flex-wrap:wrap;gap:.4rem;margin-top:.4rem">`;
    parsedCrono.datas.forEach(d => {
      const itensData = ctr.itens.filter(it => it.cronograma && it.cronograma[d] > 0);
      const valorData = itensData.reduce((s, it) => s + it.precoUnitario * it.cronograma[d], 0);
      html += `<div style="background:var(--s1);border:1px solid var(--bdr);border-radius:6px;padding:.3rem .6rem;font-size:.72rem;text-align:center;min-width:80px">
        <div style="font-weight:700">${d}/${new Date().getFullYear()}</div>
        <div style="color:var(--mut)">${itensData.length} itens</div>
        <div style="color:var(--green);font-weight:600">${brl.format(valorData)}</div>
      </div>`;
    });
    html += '</div></div>';
  });

  document.getElementById("crono-contratos-list").innerHTML = html;
}

function cancelCronoImport() {
  parsedCrono = null;
  document.getElementById("crono-preview").style.display = "none";
  document.getElementById("file-input-crono").value = "";
}

function importarCronograma() {
  if (!parsedCrono || !parsedCrono.contratos) return;
  const now = new Date();
  const ano = now.getFullYear();

  parsedCrono.contratos.forEach(ctr => {
    // Create contract
    const ctrId = `CTR-${ano}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}-${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`;
    const contrato = {
      id: ctrId,
      escola: parsedCrono.escola,
      edital: '',
      processo: ctr.processo || '',
      vigencia: parsedCrono.datas[0] + '/' + ano + ' a ' + parsedCrono.datas[parsedCrono.datas.length - 1] + '/' + ano,
      objeto: ctr.objeto || ctr.recurso || '',
      observacoes: ctr.obs || '',
      criterio: '',
      dataApuracao: now.toISOString().slice(0, 10),
      dataCriacao: now.toISOString(),
      fornecedor: parsedCrono.fornecedor || 'Lariucci & Ribeiro Pereira',
      status: 'ativo',
      itens: ctr.itens.map(it => {
        const ncmMatch = findNcmLocal(it.descricao);
        return {
          num: it.num,
          descricao: it.descricao,
          unidade: it.unidade,
          qtdContratada: it.qtdContratada,
          precoUnitario: it.precoUnitario,
          qtdEntregue: 0,
          ncm: (ncmMatch ? ncmMatch.ncm : '')
        };
      }),
      fornecedoresMapa: [],
      cronograma: true
    };
    const clienteVinculado = findClienteBySchoolName(contrato.escola);
    if (clienteVinculado) vincularClienteAoContrato(contrato, clienteVinculado);
    contratos.push(contrato);
    if (clienteVinculado) saveUsuarios();

    // Build obs for pedidos
    const obsParts = [];
    if (ctr.processo) obsParts.push("Processo: " + ctr.processo);
    if (ctr.recurso) obsParts.push("Recurso: " + ctr.recurso);
    if (ctr.objeto) obsParts.push("Objeto: " + ctr.objeto);
    if (ctr.obs) obsParts.push(ctr.obs);
    const obsStr = obsParts.join(" | ");

    // Create scheduled pedidos for each date
    parsedCrono.datas.forEach(dataStr => {
      const itensNaData = [];
      let valorPedido = 0;
      ctr.itens.forEach(it => {
        const qty = (it.cronograma && it.cronograma[dataStr]) || 0;
        if (qty > 0) {
          itensNaData.push({
            itemNum: it.num,
            descricao: it.descricao,
            unidade: it.unidade,
            qtd: qty,
            precoUnitario: it.precoUnitario
          });
          valorPedido += qty * it.precoUnitario;
        }
      });

      if (itensNaData.length === 0) return;

      // Parse date: "04/02" → "YYYY-MM-DD"
      const [dd, mm] = dataStr.split('/');
      const dataISO = `${ano}-${mm}-${dd}`;
      const dataFmt = `${dd}/${mm}/${ano}`;

      const pedId = `PED-${dataISO.replace(/-/g,'')}-${ctr.processo.replace(/\//g,'')}-${String(Math.floor(Math.random()*999)).padStart(3,"0")}`;

      pedidos.push({
        id: pedId,
        contratoId: ctrId,
        escola: parsedCrono.escola,
        data: dataISO,
        dataEntrega: dataFmt,
        itens: itensNaData,
        valor: Math.round(valorPedido * 100) / 100,
        status: 'agendado',
        obs: obsStr,
        marcador: 'Licit-AIX',
        saldoDeduzido: false,
        cronograma: true
      });
    });
  });

  saveContratos();
  savePedidos();
  renderAll();

  // Auto-cadastrar itens no ERP para cada contrato criado (background)
  parsedCrono.contratos.forEach(ctr => {
    const created = contratos.find(x => x.processo === ctr.processo);
    if (created) {
      const ncmR = autoPreencherNcm(created.id);
      if (ncmR.pending > 0) classificarNcmIA(created.id);
    }
  });

  // Capture counts before reset
  const numContratos = parsedCrono.contratos.length;
  const numPedidos = pedidos.filter(p => p.cronograma && p.status === 'agendado').length;

  // Reset
  cancelCronoImport();
  switchTab("contratos");
  showToast(`Cronograma importado: ${numContratos} contratos + ${numPedidos} pedidos agendados criados!`, 5000);
}

// Drag & drop for crono upload
(function() {
  const zone = document.getElementById("upload-zone-crono");
  if (!zone) return;
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("dragover"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("dragover"));
  zone.addEventListener("drop", e => {
    e.preventDefault();
    zone.classList.remove("dragover");
    if (e.dataTransfer.files.length) handleCronoFiles(e.dataTransfer.files);
  });
})();

// ===== RENDER CONTRATOS =====
function renderContratos() {
  const busca = (document.getElementById("busca-contrato").value || "").toLowerCase();
  const statusFiltro = document.getElementById("filtro-status-contrato").value;

  let filtered = contratos.filter(c => {
    const matchBusca = !busca || (c.escola||'').toLowerCase().includes(busca) || (c.edital||'').toLowerCase().includes(busca) || (c.id||'').toLowerCase().includes(busca) || (c.processo||'').toLowerCase().includes(busca) || (c.objeto||'').toLowerCase().includes(busca);
    const matchStatus = !statusFiltro || c.status === statusFiltro;
    return matchBusca && matchStatus;
  });

  // Atualizar contador da aba com quantidade filtrada
  document.getElementById("tab-count-contratos").textContent = filtered.length;

  const grid = document.getElementById("contract-grid");
  const empty = document.getElementById("contratos-empty");

  if (filtered.length === 0) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  grid.innerHTML = filtered.map(c => {
    const itens = Array.isArray(c.itens) ? c.itens : [];
    const calcTotal = itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
    const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : calcTotal;
    const totalEntregue = itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdEntregue) || 0), 0);
    const pctExec = totalContratado > 0 ? (totalEntregue / totalContratado * 100) : 0;
    const itensPendentes = itens.filter(i => (parseFloat(i.qtdEntregue) || 0) < (parseFloat(i.qtdContratada || i.quantidade) || 0)).length;
    const badgeClass = c.status === "ativo" ? "badge-green" : "badge-red";

    return `<div class="contract-card" onclick="abrirContrato('${c.id}')">
      <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:.5rem">
        <span class="font-mono" style="font-size:.75rem;color:var(--dim)">${c.id}</span>
        <span class="badge ${badgeClass}" onclick="toggleStatusContrato('${c.id}')" style="cursor:pointer" title="Clique para alternar status">${c.status}</span>
      </div>
      <h3>${esc(c.escola.length > 60 ? c.escola.slice(0, 58) + "..." : c.escola)}</h3>
      <div class="meta">${c.processo ? 'Proc. ' + esc(c.processo) + ' | ' : ''}${c.edital ? 'Edital ' + esc(c.edital) + ' | ' : ''}${c.itens.length} itens | ${esc(c.fornecedor)}</div>
      ${c.observacoes ? '<div style="font-size:.75rem;color:var(--cyan);margin-bottom:.5rem;max-height:2.4em;overflow:hidden;text-overflow:ellipsis" title="' + esc(c.observacoes) + '">📝 ' + esc(c.observacoes.length > 80 ? c.observacoes.slice(0,78)+'...' : c.observacoes) + '</div>' : ''}
      <div style="display:flex;justify-content:space-between;font-size:.8rem;margin-bottom:.5rem">
        <span style="color:var(--green);font-weight:700">${brl.format(totalContratado)}</span>
        <span style="color:var(--mut)">${itensPendentes} pendentes</span>
      </div>
      <div class="progress"><div class="progress-fill ${pctExec >= 80 ? 'green' : pctExec >= 40 ? 'yellow' : 'blue'}" style="width:${pctExec}%"></div></div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:.3rem">
        <span style="font-size:.7rem;color:var(--dim)">${pctExec.toFixed(0)}% executado</span>
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-sm btn-blue" onclick="vincularEscolaContrato('${c.id}')" style="font-size:.7rem;padding:.2rem .6rem" title="Vincular escola a este contrato"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${temEscolaVinculada(c.id) ? 'var(--green)' : 'var(--red)'};margin-right:4px"></span>Vincular Escola</button>
        </div>
      </div>
      ${getEscolasVinculadasBadges(c.id)}
    </div>`;
  }).join("");
}

function getEscolasVinculadasBadges(contratoId) {
  const linked = getClientesVinculadosAoContrato(contratoId);
  if (linked.length === 0) return '<div style="font-size:.7rem;color:var(--dim);margin-top:.3rem;font-style:italic">Nenhuma escola vinculada</div>';
  return '<div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.3rem">' +
    linked.map(u => '<span style="background:var(--blue);color:#fff;font-size:.65rem;padding:.15rem .5rem;border-radius:10px">' + esc(u.nome.length > 25 ? u.nome.slice(0,23)+'...' : u.nome) + '</span>').join('') +
    '</div>';
}

function temEscolaVinculada(contratoId) {
  return !!getClientePrincipalDoContrato(contratoId);
}

function toggleStatusContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  const novoStatus = c.status === 'ativo' ? 'encerrado' : 'ativo';
  if (!confirm(`Alterar status do contrato ${c.id} para "${novoStatus}"?`)) return;
  c.status = novoStatus;
  saveContratos();
  renderAll();
  showToast(`Contrato ${c.id} → ${novoStatus}`);
}

function vincularEscolaContrato(contratoId) {
  if (usuarios.length === 0) {
    showToast("Cadastre escolas na aba Clientes primeiro.", 3000);
    return;
  }

  const opts = usuarios.map(u => {
    const jaVinculado = (u.contratos_vinculados || []).includes(contratoId);
    return '<label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem;padding:.4rem 0;cursor:pointer">' +
      '<input type="checkbox" class="vincular-escola-chk" value="' + esc(u.id) + '" ' + (jaVinculado ? 'checked' : '') + '> ' +
      esc(u.nome) + (u.municipio ? ' <span style="color:var(--dim);font-size:.75rem">(' + esc(u.municipio) + ')</span>' : '') +
      '</label>';
  }).join("");

  const c = contratos.find(x => x.id === contratoId);
  const titulo = c ? c.escola.slice(0, 50) : contratoId;

  document.getElementById("modal-contrato-titulo").textContent = "Vincular Escolas — " + titulo;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="margin-bottom:1rem;color:var(--mut);font-size:.85rem">Selecione as escolas que devem ter acesso a este contrato no Portal:</div>
    <input type="text" id="busca-vincular-escola" placeholder="Buscar escola..." oninput="filtrarEscolasVinculo()" autocomplete="off" style="width:100%;margin-bottom:.8rem">
    <div id="lista-escolas-vinculo" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:.8rem 1rem;background:var(--surface)">
      ${opts}
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="document.getElementById('modal-contrato').classList.add('hidden')">Cancelar</button>
      <button class="btn btn-green" onclick="salvarVinculoEscolas('${contratoId}')">Salvar Vinculos</button>
    </div>
  `;
  document.getElementById("modal-contrato").classList.remove("hidden");
}

function filtrarEscolasVinculo() {
  const q = (document.getElementById("busca-vincular-escola").value || "").toLowerCase();
  document.querySelectorAll("#lista-escolas-vinculo label").forEach(label => {
    const text = label.textContent.toLowerCase();
    label.style.display = text.includes(q) ? "" : "none";
  });
}

function salvarVinculoEscolas(contratoId) {
  const checkedIds = [...document.querySelectorAll(".vincular-escola-chk:checked")].map(cb => cb.value);
  const uncheckedIds = [...document.querySelectorAll(".vincular-escola-chk:not(:checked)")].map(cb => cb.value);
  const contrato = contratos.find((item) => item.id === contratoId);

  for (const u of usuarios) {
    if (!u.contratos_vinculados) u.contratos_vinculados = [];
    if (checkedIds.includes(u.id) && !u.contratos_vinculados.includes(contratoId)) {
      u.contratos_vinculados.push(contratoId);
    }
    if (uncheckedIds.includes(u.id)) {
      u.contratos_vinculados = u.contratos_vinculados.filter(id => id !== contratoId);
    }
  }
  if (contrato) {
    const clientePrincipal = checkedIds.length ? usuarios.find((user) => user.id === checkedIds[0]) : null;
    if (clientePrincipal) {
      vincularClienteAoContrato(contrato, clientePrincipal);
    } else {
      contrato.escolaClienteId = "";
    }
    saveContratos();
  }

  saveUsuarios();

  document.getElementById("modal-contrato").classList.add("hidden");
  renderContratos();
  showToast("Escolas vinculadas ao contrato com sucesso!");
}

function abrirCatalogoEscolar(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens || c.itens.length === 0) {
    showToast("Contrato sem itens.", 3000);
    return;
  }

  // Load pending orders to calculate real saldo
  let _pedidosAll = [];
  try { _pedidosAll = unwrapData(JSON.parse(localStorage.getItem('gdp.pedidos.v1'))); } catch(_) {}
  const pedidosCtr = _pedidosAll.filter(p => p.contratoId === contratoId && p.status !== 'entregue');

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);
  const saldoContrato = totalContratado - totalEntregue;

  // Load Banco de Produtos for enrichment
  loadBancoProdutos();
  const _bp = bancoProdutos.itens || [];

  // Enrich SKU from Banco de Produtos — ONLY for display enrichment, do NOT auto-assign SKU to contract items
  // SKU assignment is exclusively via manual linking (skuVinculado) through Inteligência

  // Build catalog table (enriched with Banco de Produtos)
  const itensHtml = c.itens.map((item, idx) => {
    const qtdContr = parseFloat(item.qtdContratada || item.quantidade) || 0;
    const entregue = parseFloat(item.qtdEntregue) || 0;
    const saldo = qtdContr > 0 ? qtdContr - entregue : 0;
    // Item is only truly exhausted if it HAD a quantity AND it's all delivered
    const semLimite = qtdContr <= 0;
    const esgotado = !semLimite && saldo <= 0;

    // Enrich display: match by SKU or description
    const descNorm = (item.descricao || '').toUpperCase().trim();
    let bp = null;
    if (item.sku) bp = _bp.find(p => p.sku && p.sku.toUpperCase() === item.sku.toUpperCase());
    if (!bp) bp = _bp.find(p => (p.descricao || '').toUpperCase().trim() === descNorm);
    if (!bp) {
      const words = descNorm.split(/\s+/).slice(0, 3).join(' ');
      if (words.length > 5) bp = _bp.find(p => (p.descricao || '').toUpperCase().trim().startsWith(words));
    }
    const descFinal = bp ? (bp.descricao || item.descricao) : item.descricao;
    const unidFinal = item.unidade || (bp ? bp.unidade : null) || 'un';
    const skuInfo = item.sku ? ' <span style="color:var(--dim);font-size:.68rem;font-family:monospace">[' + esc(item.sku) + ']</span>' : '';

    const maxQtd = semLimite ? 9999 : saldo;
    const dispLabel = semLimite ? '—' : (esgotado ? '<span style="color:var(--red)">0</span>' : String(saldo));

    return `<tr style="${esgotado ? 'opacity:.45' : ''}">
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(descFinal)}">${esc(descFinal)}${skuInfo}</td>
      <td class="text-center">${esc(unidFinal)}</td>
      <td class="text-center">${dispLabel}</td>
      <td class="text-right">${brl.format(item.precoUnitario)}</td>
      <td class="text-center">${esgotado
        ? '<span style="font-size:.72rem;color:var(--dim)">Esgotado</span>'
        : '<input type="number" min="0" max="' + maxQtd + '" value="0" step="any" class="catalogo-qtd" data-idx="' + idx + '" data-preco="' + item.precoUnitario + '" data-max="' + maxQtd + '" style="width:60px;text-align:center;padding:.2rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--txt);font-size:.8rem" onchange="atualizarTotalCatalogo(\'' + contratoId + '\')">'
      }</td>
      <td class="text-right catalogo-subtotal" id="cat-sub-${idx}">R$ 0,00</td>
    </tr>`;
  }).join("");

  document.getElementById("modal-contrato-titulo").textContent = "📋 Catálogo — " + (c.escola.length > 40 ? c.escola.slice(0,38)+'...' : c.escola);
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem">
      <div style="font-size:.85rem"><strong>Contrato:</strong> ${esc(c.id)} | <strong>Saldo disponível:</strong> <span style="color:var(--green);font-weight:700">${brl.format(saldoContrato)}</span></div>
      <button class="btn btn-sm" style="background:rgba(16,185,129,.15);color:var(--green);border:none;font-weight:700" onclick="adicionarTodosCatalogo('${contratoId}')">🛒 Adicionar Todos</button>
    </div>
    <div style="margin-bottom:.8rem">
      <input type="text" id="catalogo-busca" placeholder="Buscar produto no catálogo..." oninput="filtrarCatalogo()" style="width:100%;padding:.5rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem">
    </div>
    <div class="table-wrap" style="max-height:50vh;overflow-y:auto">
      <table style="font-size:.8rem">
        <thead><tr><th>Item</th><th>Unid</th><th>Disponível</th><th>Preço</th><th>Qtd</th><th>Subtotal</th></tr></thead>
        <tbody>${itensHtml}</tbody>
        <tfoot><tr style="font-weight:700"><td colspan="4"></td><td class="text-center">TOTAL</td><td class="text-right" id="catalogo-total-valor">R$ 0,00</td></tr></tfoot>
      </table>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem">
      <span id="catalogo-itens-count" style="font-size:.8rem;color:var(--mut)">0 itens selecionados</span>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-outline" onclick="document.getElementById('modal-contrato').classList.add('hidden')">Cancelar</button>
        <button class="btn btn-green" id="btn-catalogo-pedir" onclick="criarPedidoCatalogo('${contratoId}')">Criar Pedido</button>
      </div>
    </div>
  `;
  document.getElementById("modal-contrato").classList.remove("hidden");
}

// Visualizar vinculos de itens e escolas do contrato
function visualizarVinculos(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  _contratoAbertoId = contratoId;

  // Escolas vinculadas
  const escolasVinc = usuarios.filter(u => (u.contratos_vinculados || []).includes(contratoId));

  // Itens com vinculos
  loadBancoProdutos();
  const _bp = bancoProdutos.itens || [];
  const itensRows = c.itens.map((item, idx) => {
    const manualSku = item.skuVinculado || '';
    const autoSku = getGdpEquivalencia(item.descricao) || '';
    const sku = manualSku || autoSku;
    let prodNome = '';
    if (sku) {
      const intel = estoqueIntelProdutos.find(p => p.sku === sku || p.id === sku);
      const bp = !intel ? _bp.find(p => p.sku === sku) : null;
      prodNome = intel ? intel.nome : (bp ? (bp.nomeComercial || bp.item) : sku);
    }
    const tipo = manualSku ? '<span style="color:var(--green)">Manual</span>' : (autoSku ? '<span style="color:var(--yellow)">Auto</span>' : '<span style="color:var(--red)">Sem vínculo</span>');
    return `<tr>
      <td>${item.num}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}">${esc(item.descricao)}</td>
      <td class="text-center">${tipo}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(prodNome)}">${prodNome ? esc(prodNome) : '—'}</td>
      <td style="font-family:monospace;font-size:.72rem;color:var(--dim)">${esc(sku) || '—'}</td>
    </tr>`;
  }).join('');

  const vinculados = c.itens.filter(i => i.skuVinculado || getGdpEquivalencia(i.descricao)).length;
  const manuais = c.itens.filter(i => i.skuVinculado).length;

  document.getElementById("modal-contrato-titulo").textContent = "🔗 Vínculos — " + (c.escola.length > 40 ? c.escola.slice(0,38)+'...' : c.escola);
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div class="kpi" style="margin:0"><div class="kpi-label">Itens Vinculados</div><div class="kpi-value green" style="font-size:1.3rem">${vinculados}/${c.itens.length}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Vínculos Manuais</div><div class="kpi-value blue" style="font-size:1.3rem">${manuais}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Escolas Vinculadas</div><div class="kpi-value yellow" style="font-size:1.3rem">${escolasVinc.length}</div></div>
    </div>
    ${escolasVinc.length > 0 ? '<div style="margin-bottom:1.5rem"><h3 style="font-size:.8rem;text-transform:uppercase;color:var(--mut);margin-bottom:.5rem">Escolas com Acesso</h3><div style="display:flex;flex-wrap:wrap;gap:.4rem">' + escolasVinc.map(u => '<span style="background:var(--s1);border:1px solid var(--bdr);border-radius:6px;padding:.25rem .6rem;font-size:.78rem">' + esc(u.nome || u.nome_completo) + (u.municipio ? ' <span style="color:var(--dim);font-size:.68rem">(' + esc(u.municipio) + ')</span>' : '') + '</span>').join('') + '</div></div>' : '<div style="margin-bottom:1rem;color:var(--mut);font-size:.85rem">Nenhuma escola vinculada a este contrato.</div>'}
    <h3 style="font-size:.8rem;text-transform:uppercase;color:var(--mut);margin-bottom:.5rem">Vínculos de Produtos</h3>
    <div class="table-wrap" style="max-height:50vh;overflow-y:auto">
      <table style="font-size:.78rem">
        <thead><tr><th>#</th><th>Item Contrato</th><th class="text-center">Tipo</th><th>Produto Vinculado</th><th>SKU</th></tr></thead>
        <tbody>${itensRows}</tbody>
      </table>
    </div>
  `;
  document.getElementById("modal-contrato").classList.remove("hidden");
}

// AC10: Filter catalog products by search term
function filtrarCatalogo() {
  const busca = (document.getElementById("catalogo-busca")?.value || "").toLowerCase();
  document.querySelectorAll(".catalogo-qtd").forEach(input => {
    const row = input.closest("tr");
    if (!row) return;
    const text = row.textContent.toLowerCase();
    row.style.display = !busca || text.includes(busca) ? "" : "none";
  });
}

function atualizarTotalCatalogo(contratoId) {
  let total = 0, count = 0;
  document.querySelectorAll('.catalogo-qtd').forEach(input => {
    const qtd = parseFloat(input.value) || 0;
    const preco = parseFloat(input.dataset.preco) || 0;
    const max = parseFloat(input.dataset.max) || 0;
    const idx = input.dataset.idx;
    if (qtd > max) input.value = max;
    const subtotal = Math.min(qtd, max) * preco;
    const subEl = document.getElementById('cat-sub-' + idx);
    if (subEl) subEl.textContent = brl.format(subtotal);
    total += subtotal;
    if (qtd > 0) count++;
  });
  const totalEl = document.getElementById('catalogo-total-valor');
  if (totalEl) totalEl.textContent = brl.format(total);
  const countEl = document.getElementById('catalogo-itens-count');
  if (countEl) countEl.textContent = count + ' iten' + (count !== 1 ? 's' : '') + ' selecionado' + (count !== 1 ? 's' : '');
}

function adicionarTodosCatalogo(contratoId) {
  document.querySelectorAll('.catalogo-qtd').forEach(input => {
    const max = parseFloat(input.dataset.max) || 0;
    if (max > 0) input.value = max;
  });
  atualizarTotalCatalogo(contratoId);
  showToast("Todos os itens disponíveis adicionados ao pedido");
}

async function criarPedidoCatalogo(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  ensureContratoItensMetadata(c);
  const itensP = [];
  document.querySelectorAll('.catalogo-qtd').forEach(input => {
    const qtd = parseFloat(input.value) || 0;
    if (qtd <= 0) return;
    const idx = parseInt(input.dataset.idx);
    const item = c.itens[idx];
    if (!item) return;
    itensP.push({
      descricao: item.descricao,
      unidade: item.unidade || 'un',
      qtd: qtd,
      preco: item.precoUnitario,
      precoUnitario: item.precoUnitario,
      itemNum: item.num,
      sku: item.skuVinculado || item.sku || '',
      ncm: item.ncm || ''
    });
  });
  if (itensP.length === 0) { showToast("Selecione ao menos um item.", 3000); return; }
  const valor = itensP.reduce((s, i) => s + i.qtd * i.preco, 0);

  // Get linked school data (full client info)
  const escola = getClientePrincipalDoContrato(contratoId);
  const escolaNome = escola ? escola.nome : c.escola;

  const hoje = new Date().toISOString().slice(0,10);
  const pedido = {
    id: 'PED-' + Date.now().toString(36).toUpperCase(),
    contratoId: contratoId,
    escola: escolaNome,
    cliente: {
      nome: escolaNome,
      cnpj: escola?.cnpj || '',
      indicador_contribuinte: '9',
      ie: escola?.ie || 'ISENTO',
      cep: escola?.cep || '',
      cidade: escola?.municipio || '',
      uf: escola?.uf || 'MG',
      logradouro: escola?.logradouro || '',
      bairro: escola?.bairro || '',
      numero: escola?.numero || '',
      complemento: escola?.complemento || '',
      telefone: escola?.telefone || '',
      email: escola?.email || ''
    },
    itens: itensP,
    valor: valor,
    status: 'em_aberto',
    data: hoje,
    dataEntrega: hoje,
    origem: 'catalogo-fornecedor',
    obs: c.observacoes || '',
    saldoDeduzido: true
  };
  pedidos.push(pedido);
  savePedidos();

  // Auto-transmit: deduct saldo from contract items
  itensP.forEach(pi => {
    const normDesc = (pi.descricao || '').toUpperCase().trim();
    const item = c.itens.find(ci => ci.num === pi.itemNum || (ci.descricao || '').toUpperCase().trim() === normDesc);
    if (item) {
      const saldo = item.qtdContratada - item.qtdEntregue;
      item.qtdEntregue += Math.min(pi.qtd, saldo);
    }
  });
  saveContratos();

  document.getElementById("modal-contrato").classList.add("hidden");
  renderAll();
  showToast(`Pedido ${pedido.id} criado para operacao interna do GDP — ${itensP.length} iten(s), ${brl.format(valor)}`, 4000);
}

function excluirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir contrato ${c.id} — ${c.escola}?\n\nEsta ação não pode ser desfeita.`)) return;
  registrarContratoExcluido(c);
  contratos = contratos.filter(x => x.id !== id);
  saveContratos();
  renderAll();
  showToast(`Contrato ${id} excluído.`);
}

// ===== CONTRACT DETAIL MODAL =====
function novoContratoManual() {
  const draft = pendingContratoDraft || {};
  document.getElementById("modal-contrato-titulo").textContent = "Novo Contrato Manual";
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Escola / Órgão</label><input type="text" id="mc-escola" list="mc-clientes-list" value="${esc(draft.escola || '')}" placeholder="Nome da escola" oninput="sugerirClienteContrato(this.value)" style="width:100%"><datalist id="mc-clientes-list">${usuarios.map((u) => `<option value="${esc(u.nome)}"></option>`).join("")}</datalist></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Número do Edital</label><input type="text" id="mc-edital" value="${esc(draft.edital || '')}" placeholder="Ex: PE 001/2026" style="width:100%"></div>
      <div style="grid-column:1/-1;font-size:.78rem;padding:.65rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--mut)" id="mc-cliente-info">Selecione um cliente já cadastrado ou digite um nome para localizar.</div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Número do Processo</label><input type="text" id="mc-processo" value="${esc(draft.processo || '')}" placeholder="Ex: 001/2026" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Vigência</label><input type="text" id="mc-vigencia" value="${esc(draft.vigencia || '')}" placeholder="Ex: 01/01/2026 a 31/12/2026" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Fornecedor</label><input type="text" id="mc-fornecedor" value="${esc(draft.fornecedor || 'Lariucci & Ribeiro Pereira')}" style="width:100%"></div>
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Status</label><select id="mc-status" style="width:100%"><option value="ativo"${(draft.status || 'ativo') === 'ativo' ? ' selected' : ''}>Ativo</option><option value="encerrado"${draft.status === 'encerrado' ? ' selected' : ''}>Encerrado</option></select></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Objeto</label><input type="text" id="mc-objeto" value="${esc(draft.objeto || '')}" placeholder="Descrição do objeto" style="width:100%"></div>
      <div style="grid-column:1/-1"><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Observações</label><textarea id="mc-obs" placeholder="Informações adicionais..." style="width:100%;min-height:50px;padding:.5rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem;resize:vertical">${esc(draft.observacoes || '')}</textarea></div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="fecharModalContrato()">Cancelar</button>
      <button class="btn btn-green" onclick="salvarContratoManual()">Criar Contrato</button>
    </div>
  `;
  document.getElementById("modal-contrato").classList.remove("hidden");
  sugerirClienteContrato(draft.escola || "");
}

function salvarContratoManual() {
  const escola = (document.getElementById("mc-escola").value || "").trim();
  if (!escola) { showToast("Nome da escola é obrigatório.", 3000); return; }
  const draft = {
    escola,
    edital: (document.getElementById("mc-edital").value || "").trim(),
    processo: (document.getElementById("mc-processo").value || "").trim(),
    vigencia: (document.getElementById("mc-vigencia").value || "").trim(),
    fornecedor: (document.getElementById("mc-fornecedor").value || "").trim(),
    status: document.getElementById("mc-status").value || "ativo",
    objeto: (document.getElementById("mc-objeto").value || "").trim(),
    observacoes: (document.getElementById("mc-obs").value || "").trim()
  };
  const cliente = findClienteBySchoolName(escola);
  if (!cliente) {
    abrirCadastroClienteParaContrato(draft);
    return;
  }
  const id = "CTR-" + Date.now().toString(36).toUpperCase();
  const c = {
    id,
    escola: cliente.nome,
    edital: draft.edital,
    processo: draft.processo,
    vigencia: draft.vigencia,
    fornecedor: draft.fornecedor,
    status: draft.status,
    objeto: draft.objeto,
    observacoes: draft.observacoes,
    dataApuracao: new Date().toISOString().split("T")[0],
    itens: [],
    clienteSnapshot: buildClienteFiscalSnapshot(cliente, cliente.nome)
  };
  vincularClienteAoContrato(c, cliente);
  contratos.push(c);
  saveContratos();
  saveUsuarios();
  pendingContratoDraft = null;
  fecharModalContrato();
  // renderAll();
  showToast("Contrato " + id + " criado com cliente vinculado. Adicione itens clicando no contrato.");
}

function adicionarItemContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const nextNum = c.itens.length + 1;
  document.getElementById("modal-contrato-titulo").textContent = "Adicionar Item — " + c.id;
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Descrição do Produto</label><input type="text" id="ai-descricao" placeholder="Ex: Arroz tipo 1, 5kg" style="width:100%" oninput="sugerirNcmAdd()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Unidade</label><input type="text" id="ai-unidade" value="Un" placeholder="Un/Kg/Cx/Pct" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Contratada</label><input type="number" id="ai-qtd" value="1" min="1" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Preço Unitário (R$)</label><input type="number" id="ai-preco" value="0" step="0.01" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">NCM</label><input type="text" id="ai-ncm" placeholder="0000.00.00" style="width:100%;font-family:monospace"><div id="ai-ncm-hint" style="font-size:.65rem;color:var(--green);margin-top:.2rem"></div></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">SKU</label><input type="text" id="ai-sku" placeholder="auto ou manual" style="width:100%;font-family:monospace"></div>
      </div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="abrirContrato('${contratoId}')">Cancelar</button>
      <button class="btn btn-green" onclick="salvarItemContrato('${contratoId}')">Adicionar</button>
      <button class="btn btn-blue" onclick="salvarItemContrato('${contratoId}',true)">Adicionar + Novo</button>
    </div>
  `;
}

function salvarItemContrato(contratoId, continuar) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const descricao = (document.getElementById("ai-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  const ncmVal = (document.getElementById("ai-ncm").value || "").trim();
  const skuVal = (document.getElementById("ai-sku")?.value || "").trim();
  const item = {
    num: c.itens.length + 1,
    descricao,
    unidade: (document.getElementById("ai-unidade").value || "Un").trim(),
    qtdContratada: parseInt(document.getElementById("ai-qtd").value) || 1,
    qtdEntregue: 0,
    precoUnitario: parseFloat(document.getElementById("ai-preco").value) || 0,
    ncm: ncmVal,
    sku: skuVal
  };
  enrichContratoItemMetadata(c, item, c.itens.length);
  c.itens.push(item);
  saveContratos();
  adicionarAoBancoProdutos(item);
  showToast("Item " + item.num + " adicionado: " + descricao.slice(0, 40));

  // Auto-cadastrar no ERP (silent, background, non-blocking)
  const itemIdx = c.itens.length - 1;
  cadastrarTinyItem(contratoId, itemIdx, true).then(() => {
    if (!continuar) abrirContrato(contratoId);
  }).catch(() => {});

  if (continuar) {
    adicionarItemContrato(contratoId);
  } else {
    abrirContrato(contratoId);
    renderAll();
  }
}

function adicionarAoBancoProdutos(item) {
  loadBancoProdutos();
  const normDesc = (item.descricao || '').toUpperCase().trim();
  const existing = bancoProdutos.itens.findIndex(p =>
    (p.descricao || '').toUpperCase().trim() === normDesc
  );
  const existingSku = existing >= 0 ? (bancoProdutos.itens[existing].sku || '') : '';
  const produto = {
    descricao: item.descricao,
    unidade: item.unidade || 'Un',
    precoUnitario: item.precoUnitario || 0,
    ncm: item.ncm || '',
    sku: item.sku || existingSku || '',
    addedAt: new Date().toISOString()
  };
  if (existing >= 0) {
    bancoProdutos.itens[existing] = { ...bancoProdutos.itens[existing], ...produto };
  } else {
    bancoProdutos.itens.push(produto);
  }
  saveBancoProdutos();
  if (!document.getElementById("tab-banco-produtos").classList.contains("hidden")) {
    renderBancoProdutos();
  }
}

async function salvarEEnviarERP(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const descricao = (document.getElementById("ai-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  const preco = parseFloat(document.getElementById("ai-preco").value) || 0;
  if (preco <= 0) { showToast("Preço unitário é obrigatório.", 3000); return; }
  // 1. Save item to contract
  salvarItemContrato(contratoId);
  // 2. Get index of newly added item (last)
  const itemIdx = c.itens.length - 1;
  // 3. Send to ERP
  try {
    await cadastrarTinyItem(contratoId, itemIdx);
    showToast("Item salvo no contrato + enviado ao ERP + salvo no Banco de Produtos!", 4000);
  } catch(err) {
    showToast("Item salvo no contrato e Banco, mas erro ao enviar ao ERP: " + err.message, 5000);
  }
}

function editarItemContrato(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  _contratoAbertoId = contratoId; // sub-screen: Fechar returns to detail
  const item = c.itens[idx];
  document.getElementById("modal-contrato-titulo").textContent = "Editar Item #" + item.num + " — " + c.id;
  document.getElementById("modal-contrato-header-actions").innerHTML = `<button class="btn btn-outline btn-sm" onclick="abrirContrato('${contratoId}')">← Voltar</button>`;
  document.getElementById("modal-contrato-body").innerHTML = `
    <div style="display:grid;grid-template-columns:1fr;gap:1rem">
      <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Descrição do Produto</label><input type="text" id="ei-descricao" value="${esc(item.descricao)}" style="width:100%" oninput="sugerirNcmEdit()"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr;gap:1rem">
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Unidade</label><input type="text" id="ei-unidade" value="${esc(item.unidade)}" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Contratada</label><input type="number" id="ei-qtd" value="${item.qtdContratada}" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Qtd Entregue</label><input type="number" id="ei-entregue" value="${item.qtdEntregue}" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">Preço Unitário (R$)</label><input type="number" id="ei-preco" value="${item.precoUnitario}" step="0.01" min="0" style="width:100%"></div>
        <div><label style="font-size:.75rem;color:var(--mut);display:block;margin-bottom:.3rem">NCM</label><input type="text" id="ei-ncm" value="${esc(item.ncm || '')}" placeholder="0000.00.00" style="width:100%;font-family:monospace"><div id="ei-ncm-hint" style="font-size:.65rem;color:var(--green);margin-top:.2rem">${item.ncm ? '' : (() => { const s = findNcmLocal(item.descricao); return s ? 'Sugestão: ' + s.ncm : ''; })()}</div></div>
      </div>
    </div>
    <div style="margin-top:1.5rem;display:flex;gap:.8rem;justify-content:flex-end">
      <button class="btn btn-outline" onclick="abrirContrato('${contratoId}')">Cancelar</button>
      <button class="btn btn-sm btn-red" onclick="excluirItemContrato('${contratoId}',${idx})" style="margin-right:auto">Excluir Item</button>
      <button class="btn btn-green" onclick="salvarEdicaoItem('${contratoId}',${idx})">Salvar</button>
    </div>
  `;
}

function salvarEdicaoItem(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  const descricao = (document.getElementById("ei-descricao").value || "").trim();
  if (!descricao) { showToast("Descrição é obrigatória.", 3000); return; }
  c.itens[idx].descricao = descricao;
  c.itens[idx].unidade = (document.getElementById("ei-unidade").value || "Un").trim();
  c.itens[idx].qtdContratada = parseInt(document.getElementById("ei-qtd").value) || 0;
  c.itens[idx].qtdEntregue = parseInt(document.getElementById("ei-entregue").value) || 0;
  c.itens[idx].precoUnitario = parseFloat(document.getElementById("ei-preco").value) || 0;
  c.itens[idx].ncm = (document.getElementById("ei-ncm").value || "").trim();
  enrichContratoItemMetadata(c, c.itens[idx], idx);
  c.valorTotal = c.itens.reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada) || 0), 0);
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[idx]);
  showToast("Item atualizado!");
  abrirContrato(contratoId);
  renderAll();
}

function excluirItemContrato(contratoId, idx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[idx]) return;
  if (!confirm("Excluir item: " + c.itens[idx].descricao + "?")) return;
  c.itens.splice(idx, 1);
  c.itens.forEach((item, i) => item.num = i + 1);
  saveContratos();
  showToast("Item excluído.");
  abrirContrato(contratoId);
  renderAll();
}

function abrirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  ensureContratoItensMetadata(c);

  _contratoAbertoId = null;
  document.getElementById("modal-contrato-titulo").textContent = `${c.id} — ${c.escola.length > 50 ? c.escola.slice(0, 48) + "..." : c.escola}`;
  document.getElementById("modal-contrato-header-actions").innerHTML = `
    <button class="btn btn-sm btn-red" onclick="excluirContrato('${c.id}')">Excluir</button>
    <button class="btn btn-sm btn-blue" onclick="salvarDadosContrato('${c.id}')">Salvar</button>
    <button class="btn btn-outline btn-sm" onclick="fecharModalContrato()">Cancelar</button>
  `;

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);
  const totalSaldo = totalContratado - totalEntregue;

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div class="kpi" style="margin:0"><div class="kpi-label">Contratado</div><div class="kpi-value green" style="font-size:1.3rem">${brl.format(totalContratado)}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Entregue</div><div class="kpi-value blue" style="font-size:1.3rem">${brl.format(totalEntregue)}</div></div>
      <div class="kpi" style="margin:0"><div class="kpi-label">Saldo</div><div class="kpi-value yellow" style="font-size:1.3rem">${brl.format(totalSaldo)}</div></div>
    </div>
    <div style="background:var(--bg);border-radius:10px;padding:1rem;margin-bottom:1.5rem">
      <h3 style="font-size:.8rem;text-transform:uppercase;color:var(--mut);letter-spacing:.04em;margin-bottom:.8rem">Dados do Contrato</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:.8rem">
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Caixa Escolar / Escola</label>
          <div style="display:flex;gap:.5rem;align-items:center">
            <input type="text" id="ctr-escola-${c.id}" value="${esc(c.escola || '')}" placeholder="Nome da escola" list="ctr-clientes-list-${c.id}" style="flex:1">
            <datalist id="ctr-clientes-list-${c.id}">${usuarios.map(u => '<option value="' + esc(u.nome) + '">').join('')}</datalist>
            <button class="btn btn-sm btn-outline" onclick="vincularClienteManual('${c.id}')" title="Vincular escola a um cliente cadastrado" style="white-space:nowrap">Vincular Cliente</button>
          </div>
          <div id="ctr-cliente-info-${c.id}" style="font-size:.72rem;color:var(--mut);margin-top:.3rem">${c.escolaClienteId ? '✓ Vinculado: ' + esc((usuarios.find(u => u.id === c.escolaClienteId) || {}).nome || c.escolaClienteId) : '⚠ Sem vínculo com cliente'}</div>
        </div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Edital</label><input type="text" id="ctr-edital-${c.id}" value="${esc(c.edital || '')}" placeholder="Ex: PE 001/2026" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Fornecedor</label><input type="text" id="ctr-fornecedor-${c.id}" value="${esc(c.fornecedor || '')}" placeholder="Nome do fornecedor" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Data Apuracao</label><input type="date" id="ctr-data-${c.id}" value="${esc(c.dataApuracao || '')}" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Status</label><select id="ctr-status-${c.id}" style="width:100%"><option value="ativo" ${c.status === 'ativo' ? 'selected' : ''}>Ativo</option><option value="encerrado" ${c.status === 'encerrado' ? 'selected' : ''}>Encerrado</option></select></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Numero do Processo</label><input type="text" id="ctr-processo-${c.id}" value="${esc(c.processo || '')}" placeholder="Ex: 001/2026" style="width:100%"></div>
        <div><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Vigencia</label><input type="text" id="ctr-vigencia-${c.id}" value="${esc(c.vigencia || '')}" placeholder="Ex: 01/01/2026 a 31/12/2026" style="width:100%"></div>
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Objeto</label><input type="text" id="ctr-objeto-${c.id}" value="${esc(c.objeto || '')}" placeholder="Descricao do objeto" style="width:100%"></div>
        <div style="grid-column:1/-1"><label style="font-size:.72rem;color:var(--dim);display:block;margin-bottom:.2rem">Observacoes (replicadas automaticamente nos pedidos)</label><textarea id="ctr-obs-${c.id}" placeholder="Informacoes adicionais..." style="width:100%;min-height:50px;padding:.5rem .8rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px;color:var(--txt);font-size:.85rem;resize:vertical">${esc(c.observacoes || '')}</textarea></div>
        <div style="grid-column:1/-1;margin-top:.4rem"><label style="display:flex;align-items:center;gap:.5rem;font-size:.82rem;cursor:pointer;padding:.4rem .6rem;background:var(--s1);border:1px solid var(--bdr);border-radius:8px"><input type="checkbox" id="ctr-saldo-visivel-${c.id}" ${c.saldoVisivelEscola ? 'checked' : ''}> Permitir que a escola acompanhe o saldo do contrato no Portal Escolar</label></div>
      </div>
      <div style="margin-top:.6rem;display:flex;justify-content:space-between;align-items:center">
        <div style="display:flex;gap:.4rem">
          <button class="btn btn-sm btn-outline" onclick="recalcularSaldoContrato('${c.id}')" title="Recalcular saldo com base nos pedidos reais">🔄 Recalcular Saldo</button>
          <button class="btn btn-sm" style="background:rgba(107,114,128,.15);color:var(--mut);border:none;font-weight:700" onclick="imprimirContrato('${c.id}')" title="Imprimir contrato completo">🖨️ Imprimir</button>
        </div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.8rem;flex-wrap:wrap;gap:.5rem">
      <div style="display:flex;align-items:center;gap:.6rem">
        <h3 style="font-size:.9rem;margin:0">Itens do Contrato (${c.itens.length})</h3>
        <span style="font-size:.72rem;color:var(--dim)">${c.itens.filter(i => i.sku).length}/${c.itens.length} com SKU</span>
        <span id="itens-selecionados-${c.id}" style="font-size:.72rem;color:var(--cyan);font-weight:600"></span>
      </div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center">
        <button class="btn btn-sm btn-blue hidden" id="btn-editar-massa-${c.id}" onclick="editarItensMassa('${c.id}')" title="Editar itens selecionados">Editar Selecionados</button>
        <button class="btn btn-sm btn-red hidden" id="btn-excluir-massa-${c.id}" onclick="excluirItensSelecionados('${c.id}')" title="Excluir itens selecionados">Excluir Selecionados</button>
        <button class="btn btn-sm" style="background:rgba(139,92,246,.15);color:var(--purple);border:none;font-weight:700" onclick="abrirCatalogoEscolar('${c.id}')" title="Abrir catalogo da escola vinculada para pedidos internos">📋 Catalogo Escolar</button>
        <button class="btn btn-sm" style="background:rgba(59,130,246,.15);color:var(--blue);border:none;font-weight:700" onclick="visualizarVinculos('${c.id}')" title="Visualizar vinculos de itens e escolas">🔗 Ver Vínculos</button>
        <button class="btn btn-sm" style="background:rgba(16,185,129,.15);color:var(--green);border:none;font-weight:700" onclick="autoPreencherNcm('${c.id}');abrirContrato('${c.id}')" title="Preencher NCM automaticamente (mapa local + banco)">NCM Auto</button>
        <button class="btn btn-sm" style="background:rgba(168,85,247,.15);color:#a855f7;border:none;font-weight:700" onclick="classificarNcmIA('${c.id}')" title="Classificar NCM dos itens sem codigo usando IA (GPT)">🤖 NCM IA</button>
        <button class="btn btn-sm btn-green" onclick="adicionarItemContrato('${c.id}')">+ Novo Produto</button>
      </div>
    </div>
    <div class="table-wrap" style="overflow-y:auto;max-height:60vh">
      <table style="font-size:.78rem">
        <thead><tr><th style="width:30px"><input type="checkbox" onchange="toggleSelectAllItens('${c.id}',this.checked)" title="Selecionar todos"></th><th>#</th><th>Item</th><th style="min-width:130px">Produto Vinculado</th><th style="min-width:100px">NCM</th><th style="min-width:80px">SKU</th><th>Unid</th><th class="text-right">Contr.</th><th class="text-right">Entr.</th><th class="text-right">Saldo</th><th>%</th><th class="text-right">Preco</th><th class="text-center">Acoes</th></tr></thead>
        <tbody>${c.itens.map((item, idx) => {
          const saldo = item.qtdContratada - item.qtdEntregue;
          const pct = item.qtdContratada > 0 ? (item.qtdEntregue / item.qtdContratada * 100) : 0;
          // Priority: manual skuVinculado > equivalencia auto-match
          const equivSku = item.skuVinculado || getGdpEquivalencia(item.descricao);
          const equivProdutoIntel = equivSku ? estoqueIntelProdutos.find(p => p.sku === equivSku || p.id === equivSku) : null;
          const equivProdutoBanco = !equivProdutoIntel && equivSku ? getGdpBancoProduto(equivSku) : null;
          const equivNome = item.skuVinculado && item.produtoVinculado ? item.produtoVinculado : (equivProdutoIntel ? equivProdutoIntel.nome : (equivProdutoBanco ? (equivProdutoBanco.nomeComercial || equivProdutoBanco.item) : (item.produtoVinculado || equivSku || '')));
          return `<tr>
            <td class="text-center"><input type="checkbox" class="item-check-${c.id}" data-idx="${idx}" onchange="atualizarSelecaoItens('${c.id}')"></td>
            <td class="text-center">${item.num}</td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(item.descricao)}"><span title="${item.sku ? 'SKU disponível para pedido/NF' : 'SKU pendente de geração interna'}" style="font-size:.6rem;margin-right:.3rem">${item.sku ? '🟢' : '🟡'}</span>${esc(item.descricao)}</td>
            <td style="min-width:130px">${equivSku
              ? '<div style="display:flex;align-items:center;gap:.3rem"><span style="color:var(--green);font-size:.74rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:120px" title="' + esc(equivNome + ' (' + equivSku + ')') + '">&#10003; ' + esc(equivNome.length > 18 ? equivNome.slice(0,16) + '..' : equivNome) + '</span><button style="background:none;border:none;cursor:pointer;font-size:.68rem;color:var(--blue);padding:0" onclick="abrirVincularGDP(\'' + c.id + '\',' + idx + ')" title="Alterar vinculo">&#9998;</button></div>'
              : '<button class="btn btn-sm" style="font-size:.72rem;padding:.15rem .4rem;background:rgba(139,92,246,.15);color:var(--purple);border:none;cursor:pointer" onclick="abrirVincularGDP(\'' + c.id + '\',' + idx + ')" title="Vincular produto cadastrado">Vincular</button>'
            }</td>
            <td style="min-width:120px">
              <div style="display:flex;align-items:center;gap:.2rem">
                <input type="text" value="${esc(item.ncm || '')}" id="ncm-${c.id}-${idx}" placeholder="00.00.00.00" style="width:90px;font-size:.72rem;font-family:monospace;padding:.15rem .3rem;background:var(--s1);border:1px solid var(--bdr);border-radius:4px;color:var(--cyan)" onchange="salvarNcmItem('${c.id}',${idx},this.value)">
                <button style="background:none;border:none;cursor:pointer;font-size:.7rem;color:var(--blue);padding:0" onclick="buscarNcmItem('${c.id}',${idx})" title="Buscar NCM automaticamente">🔍</button>
              </div>
            </td>
            <td style="font-size:.72rem;font-family:monospace;color:var(--dim)">${esc(item.sku || '-')}</td>
            <td class="nowrap">${esc(item.unidade)}</td>
            <td class="text-right font-mono">${item.qtdContratada}</td>
            <td class="text-right font-mono">${item.qtdEntregue}</td>
            <td class="text-right font-mono" style="font-weight:700;color:${saldo > 0 ? 'var(--yellow)' : 'var(--green)'}">${saldo}</td>
            <td style="min-width:50px"><div class="progress"><div class="progress-fill ${pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'blue'}" style="width:${pct}%"></div></div><span style="font-size:.6rem;color:var(--dim)">${pct.toFixed(0)}%</span></td>
            <td class="text-right font-mono">${brl.format(item.precoUnitario)}</td>
            <td class="text-center" style="white-space:nowrap">
              <button class="btn btn-sm" style="font-size:.75rem;padding:.2rem .4rem;background:rgba(59,130,246,.15);color:var(--blue);border:none;cursor:pointer" onclick="editarItemContrato('${c.id}',${idx})" title="Editar item">✏️</button>
              <button class="btn btn-sm" style="font-size:.72rem;padding:.15rem .38rem;background:rgba(239,68,68,.15);color:var(--red);border:none;cursor:pointer" onclick="excluirItemContrato('${c.id}',${idx})" title="Excluir item">🗑️</button>
            </td>
          </tr>`;
        }).join("")}</tbody>
      </table>
    </div>
    <div id="tiny-result-${c.id}" class="hidden" style="margin-top:1rem;padding:1rem;border-radius:8px;background:var(--s1);border:1px solid var(--bdr);font-size:.85rem"></div>`;

  document.getElementById("modal-contrato-body").innerHTML = html;
  document.getElementById("modal-contrato").classList.remove("hidden");
  // Reset checkbox selection count after HTML rebuild
  atualizarSelecaoItens(c.id);
}

// Track which contract is currently open so Fechar can return to it
let _contratoAbertoId = null;

function fecharModalContrato() {
  if (_contratoAbertoId) {
    abrirContrato(_contratoAbertoId);
    return;
  }
  document.getElementById("modal-contrato").classList.add("hidden");
}

// AC6: ESC to close modals
document.addEventListener("keydown", function(e) {
  if (e.key === "Escape") {
    const modal = document.getElementById("modal-contrato");
    if (modal && !modal.classList.contains("hidden")) { fecharModalContrato(); return; }
  }
});

function registrarEntregas(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  let count = 0;
  c.itens.forEach((item, idx) => {
    const input = document.getElementById(`entrega-${c.id}-${idx}`);
    if (input) {
      const qty = parseInt(input.value) || 0;
      if (qty > 0) {
        const saldo = item.qtdContratada - item.qtdEntregue;
        item.qtdEntregue += Math.min(qty, saldo);
        count += qty;
      }
    }
  });

  if (count === 0) {
    showToast("Preencha pelo menos uma quantidade para registrar.", 3000);
    return;
  }

  saveContratos();
  showToast(`${count} unidades registradas como entregues!`);
  renderAll();
  abrirContrato(contratoId); // Refresh modal
}

function excluirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  if (!confirm(`Excluir contrato ${c.id} — ${c.escola}?\n\nEsta ação não pode ser desfeita.`)) return;
  registrarContratoExcluido(c);
  contratos = contratos.filter(c => c.id !== id);
  saveContratos();
  fecharModalContrato();
  renderAll();
  showToast(`Contrato ${id} excluído.`);
}

function recalcularSaldoContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;

  // Get all pedidos for this contract that had saldo deducted (status recebido or faturado)
  const pedidosCtr = pedidos.filter(p => p.contratoId === contratoId && (p.status === 'recebido' || p.status === 'faturado' || p.status === 'concluido' || p.saldoDeduzido));

  // Reset all qtdEntregue to 0
  c.itens.forEach(item => { item.qtdEntregue = 0; });

  // Recalculate from pedidos
  pedidosCtr.forEach(p => {
    (p.itens || []).forEach(pi => {
      const normDesc = (pi.descricao || '').toUpperCase().trim();
      const item = c.itens.find(ci => ci.num === pi.itemNum || (ci.descricao || '').toUpperCase().trim() === normDesc);
      if (item) {
        item.qtdEntregue += (pi.qtd || 0);
      }
    });
  });

  // Cap qtdEntregue to qtdContratada
  c.itens.forEach(item => {
    if (item.qtdEntregue > item.qtdContratada) item.qtdEntregue = item.qtdContratada;
  });

  saveContratos();
  renderAll();
  abrirContrato(contratoId);

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);
  showToast(`Saldo recalculado! Contratado: ${brl.format(totalContratado)} | Entregue: ${brl.format(totalEntregue)} | Saldo: ${brl.format(totalContratado - totalEntregue)}`, 5000);
}

function imprimirContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;

  const totalContratado = (parseFloat(c.valorTotal) || 0) > 0 ? parseFloat(c.valorTotal) : (Array.isArray(c.itens) ? c.itens : []).reduce((s, i) => s + (parseFloat(i.precoUnitario) || 0) * (parseFloat(i.qtdContratada || i.quantidade) || 0), 0);
  const totalEntregue = c.itens.reduce((s, i) => s + (i.precoUnitario || 0) * (i.qtdEntregue || 0), 0);

  const linked = getClientesVinculadosAoContrato(id);
  const escolasHtml = linked.length > 0
    ? linked.map(u => `<tr><td>${u.nome}</td><td>${u.cnpj || '-'}</td><td>${u.municipio || '-'}</td><td>${u.telefone || '-'}</td><td>${u.email || '-'}</td></tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#999">Nenhuma escola vinculada</td></tr>';

  const itensHtml = c.itens.map(item => {
    const saldo = item.qtdContratada - item.qtdEntregue;
    return `<tr>
      <td style="text-align:center">${item.num}</td>
      <td>${item.descricao}</td>
      <td style="text-align:center">${item.ncm || '-'}</td>
      <td style="text-align:center;font-family:monospace;font-size:.8em">${item.sku || '-'}</td>
      <td style="text-align:center">${item.unidade}</td>
      <td style="text-align:right">${item.qtdContratada}</td>
      <td style="text-align:right">${item.qtdEntregue}</td>
      <td style="text-align:right;font-weight:bold">${saldo}</td>
      <td style="text-align:right">${brl.format(item.precoUnitario)}</td>
      <td style="text-align:right">${brl.format(item.precoUnitario * item.qtdContratada)}</td>
    </tr>`;
  }).join('');

  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<!DOCTYPE html><html><head><title>Contrato ${c.id}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; color: #333; margin: 20px; }
      h1 { font-size: 18px; margin-bottom: 5px; }
      h2 { font-size: 14px; margin: 15px 0 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
      th, td { border: 1px solid #ddd; padding: 4px 8px; font-size: 11px; }
      th { background: #f5f5f5; font-weight: bold; text-align: left; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; margin-bottom: 15px; }
      .info-grid div { font-size: 12px; }
      .info-grid strong { color: #666; }
      .totals { display: flex; gap: 30px; margin: 10px 0; font-size: 13px; }
      .totals div { padding: 8px 12px; background: #f8f8f8; border-radius: 4px; }
      @media print { body { margin: 10px; } }
    </style>
  </head><body>
    <h1>Contrato ${c.id}</h1>
    <p style="color:#666;margin-top:0">${c.escola}</p>

    <div class="info-grid">
      <div><strong>Edital:</strong> ${c.edital || '-'}</div>
      <div><strong>Fornecedor:</strong> ${c.fornecedor || '-'}</div>
      <div><strong>Processo:</strong> ${c.processo || '-'}</div>
      <div><strong>Status:</strong> ${c.status || '-'}</div>
      <div><strong>Vigencia:</strong> ${c.vigencia || '-'}</div>
      <div><strong>Data Apuracao:</strong> ${c.dataApuracao || '-'}</div>
      ${c.objeto ? '<div style="grid-column:1/-1"><strong>Objeto:</strong> ' + c.objeto + '</div>' : ''}
      ${c.observacoes ? '<div style="grid-column:1/-1"><strong>Obs:</strong> ' + c.observacoes + '</div>' : ''}
    </div>

    <div class="totals">
      <div><strong>Contratado:</strong> ${brl.format(totalContratado)}</div>
      <div><strong>Entregue:</strong> ${brl.format(totalEntregue)}</div>
      <div><strong>Saldo:</strong> ${brl.format(totalContratado - totalEntregue)}</div>
    </div>

    <h2>Escolas Vinculadas (${linked.length})</h2>
    <table>
      <thead><tr><th>Nome</th><th>CNPJ</th><th>Municipio</th><th>Telefone</th><th>Email</th></tr></thead>
      <tbody>${escolasHtml}</tbody>
    </table>

    <h2>Itens do Contrato (${c.itens.length})</h2>
    <table>
      <thead><tr><th>#</th><th>Descricao</th><th>NCM</th><th>SKU</th><th>Unid</th><th>Contr.</th><th>Entr.</th><th>Saldo</th><th>Preco Unit.</th><th>Subtotal</th></tr></thead>
      <tbody>${itensHtml}</tbody>
      <tfoot><tr><td colspan="9" style="text-align:right;font-weight:bold">Total Contratado:</td><td style="text-align:right;font-weight:bold">${brl.format(totalContratado)}</td></tr></tfoot>
    </table>

    <p style="font-size:10px;color:#999;margin-top:20px">Impresso em ${new Date().toLocaleString('pt-BR')} | GDP - Gestao de Pedidos</p>
    <scr` + `ipt>window.print();<\/scr` + `ipt>
  </body></html>`);
  printWindow.document.close();
}

async function salvarDadosContrato(id) {
  const c = contratos.find(x => x.id === id);
  if (!c) return;
  c.escola = (document.getElementById(`ctr-escola-${id}`)?.value || "").trim();
  c.edital = (document.getElementById(`ctr-edital-${id}`)?.value || "").trim();
  c.fornecedor = (document.getElementById(`ctr-fornecedor-${id}`)?.value || "").trim();
  c.dataApuracao = (document.getElementById(`ctr-data-${id}`)?.value || "").trim();
  c.status = document.getElementById(`ctr-status-${id}`)?.value || "ativo";
  c.processo = (document.getElementById(`ctr-processo-${id}`)?.value || "").trim();
  c.vigencia = (document.getElementById(`ctr-vigencia-${id}`)?.value || "").trim();
  c.objeto = (document.getElementById(`ctr-objeto-${id}`)?.value || "").trim();
  c.observacoes = (document.getElementById(`ctr-obs-${id}`)?.value || "").trim();
  c.saldoVisivelEscola = document.getElementById(`ctr-saldo-visivel-${id}`)?.checked || false;
  saveContratos();
  // Force immediate cloud push
  if (_syncTimeout) { clearTimeout(_syncTimeout); _syncTimeout = null; }
  try { await syncToCloud(); } catch(_) {}
  showToast("Dados do contrato salvos!");
  // AC5: Auto-close modal after save
  _contratoAbertoId = null;
  document.getElementById("modal-contrato").classList.add("hidden");
  renderAll();
}

function getObsContrato(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return "";
  const parts = [];
  if (c.processo) parts.push("Processo: " + c.processo);
  if (c.edital) parts.push("Edital: " + c.edital);
  if (c.objeto) parts.push("Objeto: " + c.objeto);
  if (c.vigencia) parts.push("Vigencia: " + c.vigencia);
  if (c.observacoes) parts.push(c.observacoes);
  return parts.join(" | ");
}

// ===== RENDER ITENS (ALL CONTRACTS) =====
function renderItens() {
  // Populate filter
  const sel = document.getElementById("filtro-contrato-itens");
  const prevVal = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  contratos.forEach(c => {
    const short = c.escola.length > 40 ? c.escola.slice(0, 38) + "..." : c.escola;
    sel.appendChild(new Option(`${c.id} — ${short}`, c.id));
  });
  if (prevVal) sel.value = prevVal;

  const filtroContrato = sel.value;
  const busca = (document.getElementById("busca-item").value || "").toLowerCase();

  const allItens = [];
  const source = filtroContrato ? contratos.filter(c => c.id === filtroContrato) : contratos;
  source.forEach(c => {
    c.itens.forEach(item => {
      allItens.push({ ...item, contratoId: c.id, escola: c.escola });
    });
  });

  const filtered = allItens.filter(i => !busca || i.descricao.toLowerCase().includes(busca) || i.escola.toLowerCase().includes(busca));

  // Atualizar contador da aba com quantidade filtrada
  const itensTabCount = document.getElementById("tab-count-itens");
  if (itensTabCount) itensTabCount.textContent = filtered.length;

  const tbody = document.getElementById("itens-tbody");
  const empty = document.getElementById("itens-empty");

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map(i => {
    const saldo = i.qtdContratada - i.qtdEntregue;
    const pct = i.qtdContratada > 0 ? (i.qtdEntregue / i.qtdContratada * 100) : 0;
    const valorSaldo = saldo * i.precoUnitario;
    const escolaShort = i.escola.length > 30 ? i.escola.slice(0, 28) + "..." : i.escola;
    return `<tr>
      <td class="nowrap" title="${esc(i.escola)}">${esc(escolaShort)}</td>
      <td>${esc(i.descricao)}</td>
      <td class="font-mono" style="font-size:.72rem;color:var(--cyan)">${esc(i.ncm || '-')}</td>
      <td class="nowrap">${esc(i.unidade)}</td>
      <td class="text-right font-mono">${i.qtdContratada}</td>
      <td class="text-right font-mono">${i.qtdEntregue}</td>
      <td class="text-right font-mono" style="font-weight:700;color:${saldo > 0 ? 'var(--yellow)' : 'var(--green)'}">${saldo}</td>
      <td style="min-width:100px"><div class="progress"><div class="progress-fill ${pct >= 80 ? 'green' : pct >= 40 ? 'yellow' : 'blue'}" style="width:${pct}%"></div></div><span style="font-size:.65rem;color:var(--dim)">${pct.toFixed(0)}%</span></td>
      <td class="text-right font-mono">${brl.format(i.precoUnitario)}</td>
      <td class="text-right font-mono" style="color:var(--yellow)">${brl.format(valorSaldo)}</td>
    </tr>`;
  }).join("");
}
