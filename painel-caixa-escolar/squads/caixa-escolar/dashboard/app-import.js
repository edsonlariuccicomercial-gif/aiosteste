// ===== UNIT CONVERSION INTELLIGENCE =====
const UNIT_CONVERSIONS = {
  "caixa": { aliases: ["cx", "cxa", "caixa"], defaultQty: 12 },
  "pacote": { aliases: ["pct", "pct.", "pacote"], defaultQty: 10 },
  "fardo": { aliases: ["fardo", "fd"], defaultQty: 6 },
  "duzia": { aliases: ["dz", "duzia", "dúzia"], defaultQty: 12 },
  "resma": { aliases: ["resma", "rm"], defaultQty: 500 },
  "galao": { aliases: ["galao", "gl"], defaultQty: 5 },
  "lata": { aliases: ["lata", "lt"], defaultQty: 1 },
  "rolo": { aliases: ["rolo", "rl"], defaultQty: 1 },
  "metro": { aliases: ["metro", "m", "mt"], defaultQty: 1 },
  "litro": { aliases: ["litro", "l", "lt"], defaultQty: 1 },
  "unidade": { aliases: ["unidade", "un", "und", "peca", "pc"], defaultQty: 1 },
};

function parseUnitConversion(unidadeStr, precoOriginal) {
  if (!unidadeStr || !precoOriginal) return { unidade: unidadeStr || "Unidade", preco: precoOriginal, convertido: false };
  const norm = normalizedText(unidadeStr);

  // Check "caixa c/ 12", "cx c/ 24", "pct com 10", "fardo 6 un"
  const matchQty = norm.match(/(?:cx|cxa|caixa|pct|pacote|fardo|fd|dz|duzia|resma)\s*(?:c\/|com|c\.|\/)?\s*(\d+)/);
  if (matchQty) {
    const qty = parseInt(matchQty[1], 10);
    if (qty > 1) {
      return { unidade: "Unidade", preco: Math.round((precoOriginal / qty) * 100) / 100, convertido: true, qtdOriginal: qty };
    }
  }

  // Check bare unit names with default conversion
  for (const [, conv] of Object.entries(UNIT_CONVERSIONS)) {
    if (conv.aliases.some((a) => norm === a || norm.startsWith(a + " "))) {
      return { unidade: "Unidade", preco: Math.round((precoOriginal / conv.defaultQty) * 100) / 100, convertido: true, qtdOriginal: conv.defaultQty };
    }
  }

  return { unidade: unidadeStr, preco: precoOriginal, convertido: false };
}

// ===== MULTI-FORMAT IMPORT (PDF, DOCX, Excel, JPEG/OCR, Mapa de Apuracao) =====
let importData = { rows: [], headers: [], mapping: {} };

function openImportDialog() {
  el.importFileInput.value = "";
  el.importFileInput.click();
}

// --- File Router ---
function handleExcelUpload(file) {
  const ext = file.name.split(".").pop().toLowerCase();

  if (ext === "pdf") { handlePdfUpload(file); return; }
  if (ext === "docx" || ext === "doc") { handleDocxUpload(file); return; }
  if (["jpg", "jpeg", "png"].includes(ext)) { handleImageOcr(file); return; }

  // Excel / CSV
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (json.length < 2) { alert("Planilha vazia ou sem dados."); return; }

      const headers = json[0].map((h) => String(h || "").trim());
      const rows = json.slice(1).filter((r) => r.some((c) => c != null && c !== ""));

      // Check for Mapa de Apuracao pattern in Excel
      if (detectMapaApuracao(headers)) {
        // Try to find classification table in second sheet
        let classTable = null;
        if (wb.SheetNames.length > 1) {
          const sheet2 = wb.Sheets[wb.SheetNames[1]];
          const json2 = XLSX.utils.sheet_to_json(sheet2, { header: 1 });
          if (json2.length > 1) classTable = json2;
        }
        handleMapaApuracao([headers, ...rows], classTable, "Excel");
        return;
      }

      importData = { rows, headers, mapping: autoDetectColumns(headers) };
      showFormatBadge("Excel");
      previewImportData();
    } catch (err) {
      alert("Erro ao ler arquivo: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// --- PDF Handler (text + scanned fallback) ---
async function handlePdfUpload(file) {
  try {
    if (typeof pdfjsLib === "undefined") { alert("PDF.js nao carregou. Recarregue a pagina."); return; }
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const allRows = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const textContent = await page.getTextContent();
      const items = textContent.items;

      // Group text items by Y-coordinate with tolerance (items within 3px = same line)
      const rawItems = items.filter((item) => item.str.trim()).map((item) => ({
        x: item.transform[4],
        y: Math.round(item.transform[5]),
        text: item.str.trim(),
      }));

      // Merge nearby Y coordinates into line groups (tolerance of 3px)
      const yTolerance = 3;
      const lineGroups = [];
      const sortedByY = [...rawItems].sort((a, b) => b.y - a.y);
      sortedByY.forEach((item) => {
        const existing = lineGroups.find((g) => Math.abs(g.y - item.y) <= yTolerance);
        if (existing) {
          existing.items.push(item);
        } else {
          lineGroups.push({ y: item.y, items: [item] });
        }
      });

      // Sort each line's items by X position and build row cells
      lineGroups.sort((a, b) => b.y - a.y);
      lineGroups.forEach((group) => {
        const sorted = group.items.sort((a, b) => a.x - b.x);
        // Detect column boundaries: items with X gap > 20px are separate columns
        const cells = [];
        let currentCell = sorted[0] ? sorted[0].text : "";
        let lastX = sorted[0] ? sorted[0].x : 0;
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i].x - lastX;
          if (gap > 20) {
            cells.push(currentCell);
            currentCell = sorted[i].text;
          } else {
            currentCell += " " + sorted[i].text;
          }
          lastX = sorted[i].x;
        }
        if (currentCell) cells.push(currentCell);
        if (cells.length >= 2) allRows.push(cells);
      });
    }

    // If no text extracted, it's a scanned PDF — fallback to OCR
    if (allRows.length < 2) {
      await handleScannedPdfOcr(pdf);
      return;
    }

    // Detect header row
    let headerIdx = 0;
    let maxTextCols = 0;
    allRows.slice(0, 5).forEach((row, i) => {
      const textCols = row.filter((c) => isNaN(parseFloat(String(c).replace(",", ".")))).length;
      if (textCols > maxTextCols) { maxTextCols = textCols; headerIdx = i; }
    });

    const headers = allRows[headerIdx].map((h) => String(h || "").trim());
    const rows = allRows.slice(headerIdx + 1).filter((r) => r.length >= 2);

    // Normalize column count
    const maxCols = Math.max(headers.length, ...rows.map((r) => r.length));
    while (headers.length < maxCols) headers.push("Col" + headers.length);
    rows.forEach((r) => { while (r.length < maxCols) r.push(""); });

    // Check for Mapa pattern
    if (detectMapaApuracao(headers)) {
      // Try to find classification table within PDF rows
      // (rows that have "Ordem"/"Licitante"/"Itens" pattern after main data)
      let classTable = null;
      for (let ri = rows.length - 1; ri >= Math.max(0, rows.length - 20); ri--) {
        const rowNorm = rows[ri].map((c) => normalizedText(c));
        const hasOrdemOrLic = rowNorm.some((c) => /ordem|licitante|classificac/.test(c));
        const hasItens = rowNorm.some((c) => /itens|selecion/.test(c));
        if (hasOrdemOrLic && hasItens) {
          // Found classification header row — extract classification table
          classTable = rows.splice(ri);
          break;
        }
      }
      handleMapaApuracao([headers, ...rows], classTable, "PDF");
      return;
    }

    importData = { rows, headers, mapping: autoDetectColumns(headers) };
    showFormatBadge("PDF");
    previewImportData();
  } catch (err) {
    alert("Erro ao ler PDF: " + err.message);
  }
}

// --- Scanned PDF OCR fallback ---
async function handleScannedPdfOcr(pdf) {
  if (typeof Tesseract === "undefined") {
    alert("Tesseract.js nao carregou. Recarregue a pagina para habilitar OCR.");
    return;
  }

  const ocrProgress = document.getElementById("ocr-progress");
  const ocrPct = document.getElementById("ocr-pct");
  const ocrBar = document.getElementById("ocr-bar");
  ocrProgress.style.display = "block";
  el.modalImport.style.display = "flex";

  try {
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 100);
          ocrPct.textContent = pct + "%";
          ocrBar.value = pct;
        }
      }
    });

    let allText = "";
    const pagesToProcess = Math.min(pdf.numPages, 8);
    for (let p = 1; p <= pagesToProcess; p++) {
      ocrPct.textContent = `Pagina ${p}/${pagesToProcess}...`;
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      const { data: { text } } = await worker.recognize(canvas);
      allText += text + "\n";
    }

    await worker.terminate();
    ocrProgress.style.display = "none";

    const parsed = parseOcrTextToTable(allText);
    if (!parsed) { alert("OCR nao detectou dados tabulares suficientes."); closeImportModal(); return; }

    if (detectMapaApuracao(parsed.headers)) {
      handleMapaApuracao([parsed.headers, ...parsed.rows], null, "PDF (OCR)");
      return;
    }

    importData = { rows: parsed.rows, headers: parsed.headers, mapping: autoDetectColumns(parsed.headers) };
    showFormatBadge("PDF (OCR)");
    previewImportData();
  } catch (err) {
    ocrProgress.style.display = "none";
    alert("Erro no OCR: " + err.message);
  }
}

// --- DOCX Handler (via mammoth.js) ---
async function handleDocxUpload(file) {
  try {
    if (typeof mammoth === "undefined") { alert("mammoth.js nao carregou. Recarregue a pagina."); return; }

    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const parser = new DOMParser();
    const doc = parser.parseFromString(result.value, "text/html");
    const tables = [...doc.querySelectorAll("table")];

    if (tables.length === 0) { alert("Documento DOCX nao contem tabelas."); return; }

    // Extract all tables as arrays
    const parsedTables = tables.map((table) => {
      const rows = [...table.querySelectorAll("tr")];
      return rows.map((tr) =>
        [...tr.querySelectorAll("td,th")].map((cell) => cell.textContent.trim())
      );
    });

    // Check if first table is Mapa de Apuracao
    const firstTable = parsedTables[0];
    if (firstTable.length >= 2 && detectMapaApuracao(firstTable[0])) {
      const classTable = parsedTables.length > 1 ? parsedTables[1] : null;
      handleMapaApuracao(firstTable, classTable, "DOCX");
      return;
    }

    // Standard import from first table
    const headers = firstTable[0];
    const rows = firstTable.slice(1).filter((r) => r.some((c) => c));
    importData = { rows, headers, mapping: autoDetectColumns(headers) };
    showFormatBadge("DOCX");
    previewImportData();
  } catch (err) {
    alert("Erro ao ler DOCX: " + err.message);
  }
}

// --- Image OCR Handler (JPEG/PNG via Tesseract.js) ---
async function handleImageOcr(file) {
  if (typeof Tesseract === "undefined") {
    alert("Tesseract.js nao carregou. Recarregue a pagina para habilitar OCR.");
    return;
  }

  const ocrProgress = document.getElementById("ocr-progress");
  const ocrPct = document.getElementById("ocr-pct");
  const ocrBar = document.getElementById("ocr-bar");
  ocrProgress.style.display = "block";
  el.modalImport.style.display = "flex";

  try {
    const worker = await Tesseract.createWorker("por", 1, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          const pct = Math.round(m.progress * 100);
          ocrPct.textContent = pct + "%";
          ocrBar.value = pct;
        }
      }
    });

    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    ocrProgress.style.display = "none";

    const parsed = parseOcrTextToTable(text);
    if (!parsed) { alert("OCR nao detectou dados tabulares suficientes."); closeImportModal(); return; }

    if (detectMapaApuracao(parsed.headers)) {
      handleMapaApuracao([parsed.headers, ...parsed.rows], null, "Imagem (OCR)");
      return;
    }

    importData = { rows: parsed.rows, headers: parsed.headers, mapping: autoDetectColumns(parsed.headers) };
    showFormatBadge("Imagem (OCR)");
    previewImportData();
  } catch (err) {
    ocrProgress.style.display = "none";
    alert("Erro no OCR: " + err.message);
  }
}

// --- Parse OCR raw text into table structure ---
function parseOcrTextToTable(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l);
  const rows = lines.map((l) => l.split(/\s{2,}|\t|(?<=\d)\s+(?=[A-Z])|(?<=\w)\s{3,}/).map((c) => c.trim()).filter((c) => c));
  const validRows = rows.filter((r) => r.length >= 2);

  if (validRows.length < 2) return null;

  // Header detection: row with most text columns in first 5 rows
  let headerIdx = 0;
  let maxTextCols = 0;
  validRows.slice(0, 5).forEach((row, i) => {
    const textCols = row.filter((c) => isNaN(parseFloat(String(c).replace(",", ".")))).length;
    if (textCols > maxTextCols) { maxTextCols = textCols; headerIdx = i; }
  });

  const headers = validRows[headerIdx];
  const dataRows = validRows.slice(headerIdx + 1);

  // Normalize column count
  const maxCols = Math.max(headers.length, ...dataRows.map((r) => r.length));
  while (headers.length < maxCols) headers.push("Col" + headers.length);
  dataRows.forEach((r) => { while (r.length < maxCols) r.push(""); });

  return { headers, rows: dataRows };
}

// --- Format badge helper ---
function showFormatBadge(format) {
  const badge = document.getElementById("import-format-badge");
  if (badge) { badge.textContent = format; badge.style.display = "inline-block"; }
}

// --- Mapa de Apuracao Detection ---
function detectMapaApuracao(headerRow) {
  if (!headerRow || headerRow.length < 4) return false;
  const norm = headerRow.map((h) => normalizedText(h));
  // Pattern 1: multiple "Licitante" columns
  const licitanteCount = norm.filter((h) => /licitante|proponente/.test(h)).length;
  if (licitanteCount >= 2) return true;
  // Pattern 2: has Item+Qtde+multiple "Valor" columns
  const hasItem = norm.some((h) => /\bitem\b|\bdescri/.test(h));
  const hasQtde = norm.some((h) => /\bqtd|\bquant/.test(h));
  const valorCount = norm.filter((h) => /^valor$/.test(h.trim())).length;
  if (hasItem && hasQtde && valorCount >= 2) return true;
  // Pattern 3: Has Item+Qtde and more than 4 structural columns (extra cols = licitante prices)
  if (hasItem && hasQtde && headerRow.length >= 6) {
    const structCount = norm.filter((h) => /\bitem\b|\bdescri|\bun\b|\buni|\bqtd|\bquant/.test(h)).length;
    if (headerRow.length - structCount >= 2) return true;
  }
  // Pattern 4: file/title context — "mapa" or "apuracao" in any header
  const hasMapaRef = norm.some((h) => /mapa|apuracao|apuração/.test(h));
  if (hasMapaRef && hasItem) return true;
  return false;
}

// --- Mapa de Apuracao Handler ---
function handleMapaApuracao(priceTableRows, classTableRows, format) {
  // priceTableRows: array of arrays, first row = headers (may include sub-header row)
  // classTableRows: array of arrays from Table 2 (classification), or null

  let headers = priceTableRows[0];
  let dataStartIdx = 1;

  // Some maps have a sub-header row (e.g., "Item | Descricao | Un | Qtde | Valor | Valor | Valor")
  // If row[1] looks like a sub-header (all text, no numbers), skip it
  if (priceTableRows.length > 2) {
    const row1 = priceTableRows[1];
    const allText = row1.every((c) => isNaN(parseFloat(String(c).replace(",", "."))));
    if (allText && row1.some((c) => /valor|item|descri/i.test(c))) {
      dataStartIdx = 2;
    }
  }

  const dataRows = priceTableRows.slice(dataStartIdx).filter((r) => r.some((c) => c && String(c).trim()));

  // Identify structural columns
  const normHeaders = headers.map((h) => normalizedText(h));
  let itemCol = normHeaders.findIndex((h) => /^\s*item\s*$/.test(h)); // numeric item number
  let descCol = normHeaders.findIndex((h) => /descri|produto|material/.test(h));
  let unCol = normHeaders.findIndex((h) => /\bun\b|\buni\b|\bunid/.test(h));
  let qtdCol = normHeaders.findIndex((h) => /\bqtd|\bquant/.test(h));

  // If item col is the numeric index and desc is separate, use desc as the name
  // If no desc column, use item column as name
  const nameCol = descCol >= 0 ? descCol : itemCol;

  // Identify licitante columns (all columns that are NOT structural)
  const structCols = new Set([itemCol, descCol, unCol, qtdCol].filter((c) => c >= 0));
  const licitantes = [];
  headers.forEach((h, i) => {
    if (!structCols.has(i) && h && String(h).trim()) {
      // Extract licitante name from header (may contain line breaks / "Licitante 1\nNome")
      let name = String(h).trim().replace(/^licitante\s*\d+\s*/i, "").trim();
      if (!name) name = String(h).trim();
      // Skip sub-labels like "Valor"
      if (/^valor$/i.test(name)) name = "Licitante " + (licitantes.length + 1);
      licitantes.push({ colIdx: i, name });
    }
  });

  // Auto-detect my company from config (nome, nomeFantasia, razaoSocial, CNPJ)
  const empresa = JSON.parse(localStorage.getItem(EMPRESA_STORAGE_KEY) || "{}");
  const searchNames = [empresa.nome, empresa.nomeFantasia, empresa.razaoSocial, empresa.cnpj]
    .filter(Boolean).map((n) => normalizedText(n)).filter((n) => n.length > 2);
  let myCompanyIdx = -1;
  if (searchNames.length > 0) {
    myCompanyIdx = licitantes.findIndex((l) => {
      const ln = normalizedText(l.name);
      return searchNames.some((myName) =>
        ln.includes(myName) || myName.includes(ln) ||
        ln.split(/\s+/).some((w) => w.length > 3 && myName.includes(w)) ||
        myName.split(/\s+/).some((w) => w.length > 3 && ln.includes(w))
      );
    });
  }

  // If auto-detection failed and we have licitantes, prompt user to choose
  if (myCompanyIdx < 0 && licitantes.length > 0) {
    const sel = prompt(
      "Empresa nao detectada automaticamente.\nQual licitante e a sua empresa?\n\n" +
      licitantes.map((l, i) => `${i + 1}. ${l.name}`).join("\n") +
      "\n\nDigite o numero (ou 0 para nenhum):"
    );
    const idx = parseInt(sel, 10) - 1;
    if (idx >= 0 && idx < licitantes.length) {
      myCompanyIdx = idx;
    }
  }

  // Parse classification table (Table 2) to find won items
  let wonItemNumbers = new Set();
  let classificationData = [];
  if (classTableRows && classTableRows.length > 1) {
    const classHeaders = classTableRows[0].map((h) => normalizedText(h));
    const itensSelCol = classHeaders.findIndex((h) => /itens|selecion/.test(h));
    // Prioritize "licitante/empresa/fornecedor" over "ordem"
    let licitanteCol = classHeaders.findIndex((h) => /licitante|empresa|fornecedor/.test(h));
    if (licitanteCol < 0) licitanteCol = classHeaders.findIndex((h) => /ordem/.test(h));
    const nameClassCol = licitanteCol >= 0 ? licitanteCol : 1;

    classTableRows.slice(1).forEach((row) => {
      if (!row || row.every((c) => !c || !String(c).trim())) return;
      const rowName = String(row[nameClassCol] || "").trim();
      const rowItems = itensSelCol >= 0 ? String(row[itensSelCol] || "") : "";
      const itemNums = rowItems.match(/\d+/g);
      classificationData.push({ nome: rowName, itens: itemNums ? itemNums.map(Number) : [] });

      // Match against: my licitante name from price table, searchNames from config,
      // AND cross-reference licitante names from price table headers
      const rowNorm = normalizedText(rowName);
      let isMe = false;

      if (myCompanyIdx >= 0) {
        const myLicName = normalizedText(licitantes[myCompanyIdx].name);
        // Direct match: classification row name matches my licitante column header name
        isMe = rowNorm.includes(myLicName) || myLicName.includes(rowNorm) ||
          myLicName.split(/\s+/).some((w) => w.length > 3 && rowNorm.includes(w)) ||
          rowNorm.split(/\s+/).some((w) => w.length > 3 && myLicName.includes(w));
      }

      // Also try matching via empresa searchNames
      if (!isMe && searchNames.length > 0) {
        isMe = searchNames.some((sn) =>
          rowNorm.includes(sn) || sn.includes(rowNorm) ||
          sn.split(/\s+/).some((w) => w.length > 3 && rowNorm.includes(w)) ||
          rowNorm.split(/\s+/).some((w) => w.length > 3 && sn.includes(w))
        );
      }

      if (isMe && itemNums) {
        itemNums.forEach((n) => wonItemNumbers.add(Number(n)));
      }
    });

    // Cross-reference: if myCompanyIdx is set but no won items found from classification,
    // try matching licitante column header name against classification names word by word
    if (wonItemNumbers.size === 0 && myCompanyIdx >= 0) {
      const myLicName = normalizedText(licitantes[myCompanyIdx].name);
      const myWords = myLicName.split(/\s+/).filter((w) => w.length > 2);
      classificationData.forEach((c) => {
        const cNorm = normalizedText(c.nome);
        const cWords = cNorm.split(/\s+/).filter((w) => w.length > 2);
        // Match if at least 2 words overlap, or any word > 4 chars matches
        const overlap = myWords.filter((w) => cWords.some((cw) => cw.includes(w) || w.includes(cw)));
        if (overlap.length >= 2 || overlap.some((w) => w.length > 4)) {
          c.itens.forEach((n) => wonItemNumbers.add(n));
        }
      });
    }
  }

  // Store enriched import data
  importData = {
    rows: dataRows,
    headers,
    mapping: autoDetectColumns(headers),
    isMapa: true,
    licitantes,
    myCompanyIdx,
    wonItems: wonItemNumbers,
    classificationData,
    nameCol,
    itemCol,
    descCol,
    unCol,
    qtdCol,
    valoresTotal: true, // Mapa values are typically totals
  };

  showFormatBadge("Mapa de Apuracao (" + format + ")");
  previewMapaApuracao();
}

// --- Mapa Preview ---
function previewMapaApuracao() {
  const { rows, headers, licitantes, myCompanyIdx, wonItems, classificationData,
    nameCol, itemCol, qtdCol, unCol } = importData;

  el.importFilename.textContent = el.importFileInput.files[0]
    ? el.importFileInput.files[0].name : "";

  // Show mapa panel
  const mapaPanel = document.getElementById("mapa-apuracao-panel");
  mapaPanel.style.display = "block";

  // Show detected company
  const empresaEl = document.getElementById("mapa-empresa-detectada");
  if (myCompanyIdx >= 0) {
    const wonCount = wonItems.size;
    empresaEl.textContent = licitantes[myCompanyIdx].name +
      (wonCount > 0 ? ` (${wonCount} itens ganhos)` : " (classificacao nao encontrada — importa todos)");
    empresaEl.style.color = "var(--accent)";
  } else {
    empresaEl.textContent = "Nao detectada — clique Alterar";
    empresaEl.style.color = "#f59e0b";
  }

  // Show classification
  const classEl = document.getElementById("mapa-classificacao");
  if (classificationData.length > 0) {
    classEl.innerHTML = "<strong>Classificacao:</strong><br>" +
      classificationData.map((c) => {
        let isMe = false;
        if (myCompanyIdx >= 0) {
          const myLicName = normalizedText(licitantes[myCompanyIdx].name);
          const cNorm = normalizedText(c.nome);
          isMe = cNorm.includes(myLicName) || myLicName.includes(cNorm) ||
            myLicName.split(/\s+/).some((w) => w.length > 3 && cNorm.includes(w)) ||
            cNorm.split(/\s+/).some((w) => w.length > 3 && myLicName.includes(w));
        }
        return `<span style="color:${isMe ? "var(--accent)" : "var(--muted)"}">${isMe ? "★ " : ""}${escapeHtml(c.nome)}: itens ${c.itens.join(", ")}</span>`;
      }).join("<br>");
  } else {
    classEl.innerHTML = '<span style="color:var(--muted)">Tabela de classificacao nao encontrada. Todos os itens serao importados.</span>';
  }

  // Show total toggle (checked by default for Mapa)
  const toggleDiv = document.getElementById("import-total-toggle");
  toggleDiv.style.display = "block";
  const chk = document.getElementById("chk-valores-totais");
  chk.checked = true;

  // Hide standard column mapping for Mapa (we auto-detect)
  el.importMapping.innerHTML = `<p style="font-size:0.78rem;color:var(--muted);">
    ${licitantes.length} licitantes detectados: ${licitantes.map((l) => escapeHtml(l.name)).join(", ")}
  </p>`;

  // Legend
  const legendHtml = `<div class="mapa-legend">
    <span class="leg-won">Itens ganhos (seu preco)</span>
    <span class="leg-lost">Concorrentes</span>
  </div>`;

  // Preview table with all rows
  const previewRows = rows.slice(0, 15);
  const thCols = [];
  if (itemCol >= 0) thCols.push({ idx: itemCol, label: "#" });
  if (nameCol >= 0) thCols.push({ idx: nameCol, label: "Produto" });
  if (unCol >= 0) thCols.push({ idx: unCol, label: "Un" });
  if (qtdCol >= 0) thCols.push({ idx: qtdCol, label: "Qtde" });
  licitantes.forEach((l, li) => {
    thCols.push({ idx: l.colIdx, label: escapeHtml(l.name), isLic: true, licIdx: li });
  });

  el.theadImportPreview.innerHTML = "<tr>" + thCols.map((c) => {
    const cls = c.isLic && c.licIdx === myCompanyIdx ? ' style="color:var(--accent);font-weight:700;"' : "";
    return `<th${cls}>${c.label}</th>`;
  }).join("") + "</tr>";

  el.tbodyImportPreview.innerHTML = legendHtml + previewRows.map((row) => {
    const itemNum = itemCol >= 0 ? parseInt(String(row[itemCol]), 10) : 0;
    const isWon = wonItems.size > 0 ? wonItems.has(itemNum) : false;
    const rowClass = isWon ? "mapa-won-row" : "mapa-competitor-row";

    return `<tr class="${rowClass}">` + thCols.map((c) => {
      let val = escapeHtml(row[c.idx] != null ? row[c.idx] : "");
      if (c.isLic && c.licIdx === myCompanyIdx) val = `<span class="mapa-my-price">${val}</span>`;
      else if (c.isLic) val = `<span class="mapa-competitor-price">${val}</span>`;
      return `<td>${val}</td>`;
    }).join("") + "</tr>";
  }).join("");

  if (rows.length > 15) {
    el.tbodyImportPreview.innerHTML += `<tr><td colspan="${thCols.length}" style="text-align:center;color:var(--muted);font-size:0.78rem;">... +${rows.length - 15} itens</td></tr>`;
  }

  el.importStats.style.display = "none";
  el.modalImport.style.display = "flex";

  // Wire alterar empresa button
  const btnAlterar = document.getElementById("btn-mapa-alterar-empresa");
  btnAlterar.onclick = () => {
    const sel = prompt("Qual licitante e a sua empresa?\n\n" +
      licitantes.map((l, i) => `${i + 1}. ${l.name}`).join("\n") +
      "\n\nDigite o numero:");
    const idx = parseInt(sel, 10) - 1;
    if (idx >= 0 && idx < licitantes.length) {
      importData.myCompanyIdx = idx;
      // Re-parse won items for the new company
      if (classificationData.length > 0) {
        const newWon = new Set();
        classificationData.forEach((c) => {
          const cNorm = normalizedText(c.nome);
          const lNorm = normalizedText(licitantes[idx].name);
          if (lNorm.split(/\s+/).some((w) => w.length > 3 && cNorm.includes(w))) {
            c.itens.forEach((n) => newWon.add(n));
          }
        });
        importData.wonItems = newWon;
      }
      previewMapaApuracao();
    }
  };
}

// --- Auto-detect column mapping ---
function autoDetectColumns(headers) {
  const mapping = { item: -1, preco: -1, unidade: -1, fornecedor: -1, quantidade: -1 };
  const norms = headers.map((h) => normalizedText(h));

  norms.forEach((h, i) => {
    if (mapping.item < 0 && /\b(item|produto|descricao|material|nome|mercadoria)\b/.test(h)) mapping.item = i;
    if (mapping.preco < 0 && /\b(preco|valor|custo|unitario|unit|preco\s*unit|vlr)\b/.test(h)) mapping.preco = i;
    if (mapping.unidade < 0 && /\b(unidade|un\b|und|medida|embalagem|emb)\b/.test(h)) mapping.unidade = i;
    if (mapping.fornecedor < 0 && /\b(fornecedor|fonte|marca|empresa|fabricante)\b/.test(h)) mapping.fornecedor = i;
    if (mapping.quantidade < 0 && /\b(qtd|qtde|quant|quantidade)\b/.test(h)) mapping.quantidade = i;
  });

  if (mapping.item < 0 && headers.length >= 2) {
    for (let i = 0; i < headers.length; i++) {
      if (mapping.preco !== i && mapping.unidade !== i && mapping.fornecedor !== i) {
        mapping.item = i; break;
      }
    }
  }

  if (mapping.preco < 0 && headers.length >= 2) {
    for (let i = headers.length - 1; i >= 0; i--) {
      if (mapping.item !== i && /\d|r\$|valor|preco/.test(norms[i])) {
        mapping.preco = i; break;
      }
    }
  }

  return mapping;
}

// --- Standard preview (non-Mapa) ---
function previewImportData() {
  const { rows, headers, mapping } = importData;

  el.importFilename.textContent = el.importFileInput.files[0]
    ? el.importFileInput.files[0].name : "";

  // Hide mapa-specific UI
  document.getElementById("mapa-apuracao-panel").style.display = "none";

  // Show total toggle if we have a quantity column
  const toggleDiv = document.getElementById("import-total-toggle");
  toggleDiv.style.display = mapping.quantidade >= 0 ? "block" : "none";
  const chk = document.getElementById("chk-valores-totais");
  chk.checked = false;

  // Column mapping dropdowns
  const colOpts = headers.map((h, i) => `<option value="${i}">${escapeHtml(h)}</option>`).join("");
  const noOpt = '<option value="-1">— Ignorar —</option>';

  el.importMapping.innerHTML = ["item", "preco", "unidade", "fornecedor"].map((key) => {
    const labels = { item: "Item / Produto", preco: "Preco / Custo", unidade: "Unidade", fornecedor: "Fornecedor" };
    const sel = mapping[key];
    const opts = noOpt + colOpts;
    return `<label>${labels[key]}
      <select data-map="${key}">${opts.replace(`value="${sel}"`, `value="${sel}" selected`)}</select>
    </label>`;
  }).join("");

  el.importMapping.querySelectorAll("select").forEach((s) => {
    s.addEventListener("change", () => {
      importData.mapping[s.dataset.map] = parseInt(s.value, 10);
    });
  });

  const previewRows = rows.slice(0, 5);
  el.theadImportPreview.innerHTML = "<tr>" + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("") + "</tr>";
  el.tbodyImportPreview.innerHTML = previewRows.map((row) =>
    "<tr>" + headers.map((_, i) => `<td>${escapeHtml(row[i] != null ? row[i] : "")}</td>`).join("") + "</tr>"
  ).join("");

  el.importStats.style.display = "none";
  el.modalImport.style.display = "flex";
}

// --- Close modal ---
function closeImportModal() {
  el.modalImport.style.display = "none";
  document.getElementById("mapa-apuracao-panel").style.display = "none";
  document.getElementById("import-total-toggle").style.display = "none";
  document.getElementById("ocr-progress").style.display = "none";
  document.getElementById("import-format-badge").style.display = "none";
  importData = { rows: [], headers: [], mapping: {} };
}

// --- Parse price from string ---
function parsePriceValue(val) {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[^\d,.\-]/g, "");
  if (!s || s === "-") return 0;
  // Handle "1.234,56" format (Brazilian) — remove dots, replace comma with dot
  const hasDotAndComma = s.includes(".") && s.includes(",");
  if (hasDotAndComma) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  // Handle "1234,56" (comma as decimal)
  if (s.includes(",")) return parseFloat(s.replace(",", ".")) || 0;
  return parseFloat(s) || 0;
}

// --- Merge into Banco de Precos ---
function mergeImportIntoBanco() {
  if (importData.isMapa) {
    mergeMapaIntoBanco();
    return;
  }

  const { rows, mapping } = importData;
  if (mapping.item < 0) { alert("Selecione a coluna de Item / Produto."); return; }

  // Register import file (Story 4.27)
  const importFilename = document.getElementById("import-filename")?.textContent || "import";
  const currentArquivo = registrarArquivo(importFilename, "", "excel", 0);
  const currentArquivoId = currentArquivo.id;
  const sourceConfidence = currentArquivo.confianca;

  const valoresTotal = document.getElementById("chk-valores-totais")?.checked || false;
  let updated = 0, added = 0, converted = 0;
  const todayStr = new Date().toISOString().slice(0, 10);

  rows.forEach((row) => {
    const itemName = String(row[mapping.item] || "").trim();
    if (!itemName || itemName.length < 2) return;
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(itemName)) return;

    let preco = mapping.preco >= 0 ? parsePriceValue(row[mapping.preco]) : 0;
    const unidadeRaw = mapping.unidade >= 0 ? String(row[mapping.unidade] || "").trim() : "";
    const fornecedor = mapping.fornecedor >= 0 ? String(row[mapping.fornecedor] || "").trim() : "";

    // If values are totals, divide by quantity
    if (valoresTotal && mapping.quantidade >= 0 && preco > 0) {
      const qtd = parseFloat(String(row[mapping.quantidade]).replace(/[^\d]/g, "")) || 1;
      if (qtd > 0) preco = Math.round((preco / qtd) * 100) / 100;
    }

    // Unit conversion intelligence
    const conv = parseUnitConversion(unidadeRaw, preco);
    if (conv.convertido) converted++;
    const unidade = conv.unidade;
    preco = conv.preco;

    const normName = normalizedText(itemName);
    const existing = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === normName);

    if (existing) {
      if (preco > 0) existing.custoBase = preco;
      if (unidade) existing.unidade = unidade;
      if (fornecedor) existing.fonte = fornecedor;
      existing.precoReferencia = Math.round(existing.custoBase * (1 + existing.margemPadrao) * 100) / 100;
      existing.ultimaCotacao = todayStr;
      if (preco > 0 && fornecedor) {
        if (!existing.custosFornecedor) existing.custosFornecedor = [];
        existing.custosFornecedor.push({ fornecedor, preco, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence });
        // Detect variation > 20% (Story 4.27)
        if (existing.custosFornecedor.length >= 2) {
          const prev = existing.custosFornecedor[existing.custosFornecedor.length - 2].preco;
          const curr = existing.custosFornecedor[existing.custosFornecedor.length - 1].preco;
          if (prev > 0) {
            const varPct = ((curr - prev) / prev) * 100;
            if (Math.abs(varPct) > 20) {
              console.warn(`[Banco] Variacao ${varPct.toFixed(1)}%: "${existing.item}" (${brl.format(prev)} -> ${brl.format(curr)})`);
            }
          }
        }
      }
      // Link to Item Mestre (Story 4.26)
      if (!existing.mesterId) {
        const mestreMatch = findBestMestre(existing.item);
        if (mestreMatch && mestreMatch.score >= 0.5) {
          existing.mesterId = mestreMatch.mestre.id;
          linkItemToMestre(existing.item, mestreMatch.mestre.id);
        } else {
          const mestre = createMestreFromItem(existing);
          existing.mesterId = mestre.id;
        }
      }
      updated++;
    } else {
      const margemPadrao = 0.30;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      const newItem = {
        id: newId, item: itemName, grupo: "Importado", unidade: unidade || "Unidade",
        custoBase: preco, margemPadrao, precoReferencia: Math.round(preco * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: fornecedor, propostas: [], concorrentes: [],
        custosFornecedor: fornecedor && preco > 0 ? [{ fornecedor, preco, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence }] : [],
      };
      // Link to Item Mestre (Story 4.26)
      const mestreMatch = findBestMestre(newItem.item);
      if (mestreMatch && mestreMatch.score >= 0.8) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
      } else if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
        console.log(`[Mestre] Match sugerido (${(mestreMatch.score*100).toFixed(0)}%): "${newItem.item}" → "${mestreMatch.mestre.nomeCanonico}"`);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }
      bancoPrecos.itens.push(newItem);
      added++;
    }
  });

  // Update arquivo registry with count (Story 4.27)
  currentArquivo.qtdItens = updated + added;
  saveArquivos();

  saveMestres();
  saveBancoLocal(); renderBanco();
  let msg = `${updated} atualizados, ${added} novos.`;
  if (converted > 0) msg += ` ${converted} convertidos (caixa/fardo → unidade).`;
  el.importStats.innerHTML = msg; el.importStats.style.display = "block";
  setTimeout(() => { closeImportModal(); }, 3000);
}

// --- Merge Mapa de Apuracao into Banco ---
function mergeMapaIntoBanco() {
  const { rows, licitantes, myCompanyIdx, wonItems, nameCol, itemCol, qtdCol, unCol } = importData;
  const valoresTotal = document.getElementById("chk-valores-totais")?.checked || importData.valoresTotal;
  const todayStr = new Date().toISOString().slice(0, 10);

  // Register import file (Story 4.27)
  const importFilename = document.getElementById("import-filename")?.textContent || "mapa-import";
  const currentArquivo = registrarArquivo(importFilename, "", "excel", 0);
  const currentArquivoId = currentArquivo.id;
  const sourceConfidence = currentArquivo.confianca;

  let added = 0, updated = 0, concorrentesAdded = 0;
  const importAll = wonItems.size === 0; // If no classification, import all

  rows.forEach((row) => {
    const itemNum = itemCol >= 0 ? parseInt(String(row[itemCol]), 10) : 0;
    const itemName = nameCol >= 0 ? String(row[nameCol] || "").trim() : "";
    if (!itemName || itemName.length < 2) return;
    if (!/[a-zA-ZÀ-ÿ]{2,}/.test(itemName)) return;

    const unidade = unCol >= 0 ? String(row[unCol] || "").trim() : "Unidade";
    const qtd = qtdCol >= 0 ? (parseFloat(String(row[qtdCol]).replace(/[^\d]/g, "")) || 1) : 1;
    const isWon = importAll || wonItems.has(itemNum);

    // Get my price (from my company's column)
    let myPrice = 0;
    if (myCompanyIdx >= 0) {
      const rawPrice = parsePriceValue(row[licitantes[myCompanyIdx].colIdx]);
      myPrice = valoresTotal && qtd > 0 ? Math.round((rawPrice / qtd) * 100) / 100 : rawPrice;
    }

    // Collect ALL licitante prices (for concorrentes)
    const allPrices = licitantes.map((l, li) => {
      const raw = parsePriceValue(row[l.colIdx]);
      const unit = valoresTotal && qtd > 0 && raw > 0 ? Math.round((raw / qtd) * 100) / 100 : raw;
      return { nome: l.name, preco: unit, isMe: li === myCompanyIdx };
    }).filter((p) => p.preco > 0);

    const normName = normalizedText(itemName);
    const existing = bancoPrecos.itens.find((bp) => normalizedText(bp.item) === normName);

    if (existing) {
      // Update with my price if won
      if (isWon && myPrice > 0) {
        existing.custoBase = myPrice;
        existing.precoReferencia = Math.round(myPrice * (1 + existing.margemPadrao) * 100) / 100;
        existing.ultimaCotacao = todayStr;
      }
      // Add competitor prices
      if (!existing.concorrentes) existing.concorrentes = [];
      allPrices.forEach((p) => {
        if (!p.isMe && p.preco > 0) {
          existing.concorrentes.push({ nome: p.nome, preco: p.preco, data: todayStr, edital: "Mapa Import" });
          concorrentesAdded++;
        }
      });
      // Link to Item Mestre (Story 4.26)
      if (!existing.mesterId) {
        const mestreMatch = findBestMestre(existing.item);
        if (mestreMatch && mestreMatch.score >= 0.5) {
          existing.mesterId = mestreMatch.mestre.id;
          linkItemToMestre(existing.item, mestreMatch.mestre.id);
        } else {
          const mestre = createMestreFromItem(existing);
          existing.mesterId = mestre.id;
        }
      }
      updated++;
    } else if (isWon || importAll) {
      // Create new item
      const margemPadrao = 0.30;
      const custoBase = myPrice || 0;
      const newId = "bp-" + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
      const competitorPrices = allPrices.filter((p) => !p.isMe && p.preco > 0)
        .map((p) => ({ nome: p.nome, preco: p.preco, data: todayStr, edital: "Mapa Import" }));
      concorrentesAdded += competitorPrices.length;

      const newItem = {
        id: newId, item: itemName, grupo: "Mapa Apuracao", unidade: unidade || "Unidade",
        custoBase, margemPadrao, precoReferencia: Math.round(custoBase * (1 + margemPadrao) * 100) / 100,
        ultimaCotacao: todayStr, fonte: "Mapa de Apuracao",
        propostas: [], concorrentes: competitorPrices,
        custosFornecedor: myPrice > 0 ? [{ fornecedor: "Meu preco (mapa)", preco: myPrice, data: todayStr, arquivoId: currentArquivoId, descricaoOriginal: itemName, confianca: sourceConfidence }] : [],
      };
      // Link to Item Mestre (Story 4.26)
      const mestreMatch = findBestMestre(newItem.item);
      if (mestreMatch && mestreMatch.score >= 0.5) {
        newItem.mesterId = mestreMatch.mestre.id;
        linkItemToMestre(newItem.item, mestreMatch.mestre.id);
      } else {
        const mestre = createMestreFromItem(newItem);
        newItem.mesterId = mestre.id;
      }
      bancoPrecos.itens.push(newItem);
      added++;
    }
  });

  // Update arquivo registry with count (Story 4.27)
  currentArquivo.qtdItens = updated + added;
  saveArquivos();

  saveMestres();
  saveBancoLocal(); renderBanco();

  const wonCount = wonItems.size || rows.length;
  let msg = `Mapa importado! ${added} novos, ${updated} atualizados.`;
  if (wonItems.size > 0) msg += ` ${wonItems.size} itens ganhos.`;
  msg += ` ${concorrentesAdded} precos de concorrentes registrados.`;
  el.importStats.innerHTML = msg; el.importStats.style.display = "block";
  setTimeout(() => { closeImportModal(); }, 4000);
}
