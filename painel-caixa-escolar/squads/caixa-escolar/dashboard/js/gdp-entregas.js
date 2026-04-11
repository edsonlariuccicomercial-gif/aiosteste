// ===== ENTREGAS =====
async function carregarEntregasServidor() {
  try {
    const resp = await fetch("/api/sync-entregas");
    const data = await resp.json();
    if (data.ok && data.provas && data.provas.length > 0) {
      // Merge servidor com local
      for (const sp of data.provas) {
        const idx = provasEntrega.findIndex(p => p.pedidoId === sp.pedidoId);
        if (idx >= 0) {
          provasEntrega[idx] = sp;
        } else {
          provasEntrega.push(sp);
        }
      }
      localStorage.setItem(PROOFS_KEY, JSON.stringify(provasEntrega));
      schedulCloudSync();
    }
  } catch (_) {}
}

function renderEntregas() {
  // Re-read proofs from localStorage
  try { provasEntrega = JSON.parse(localStorage.getItem(PROOFS_KEY)) || []; } catch(_) { provasEntrega = []; }
  // Tambem buscar do servidor (async)
  carregarEntregasServidor().then(() => _renderEntregasUI());
  _renderEntregasUI();
}

function buildEntregasOperacionais() {
  const rows = provasEntrega.map((item, idx) => ({
    ...item,
    __source: "prova",
    __idx: idx
  }));
  const provaIds = new Set(provasEntrega.map((item) => item.pedidoId));
  estoqueIntelPedidos.forEach((pedido) => {
    if (provaIds.has(pedido.id)) return;
    const reservaStatus = getEstoqueIntelReservaStatus(pedido.id);
    if (reservaStatus.key !== "reservada") return;
    rows.push({
      pedidoId: pedido.id,
      escola: pedido.cliente || "Demanda do Estoque Intel",
      dataEntrega: pedido.data_prevista || pedido.data || new Date().toISOString(),
      recebedor: "-",
      foto: "",
      assinatura: "",
      obs: "Entrega operacional criada a partir de demanda/reserva aberta.",
      statusEntrega: "pendente",
      __source: "demanda",
      __idx: -1
    });
  });
  return rows.sort((a, b) => String(b.dataEntrega || "").localeCompare(String(a.dataEntrega || "")));
}

function normalizeEntregaStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "pendente";
  if (status === "concluido" || status === "concluído") return "concluido";
  if (status === "entregue") return "entregue";
  if (status === "pendente") return "pendente";
  return status;
}

function garantirProvaEntregaOperacional(row, statusEntrega = "concluido") {
  if (!row?.pedidoId) return null;
  let idx = provasEntrega.findIndex((item) => item.pedidoId === row.pedidoId);
  if (idx >= 0) {
    provasEntrega[idx] = {
      ...provasEntrega[idx],
      escola: provasEntrega[idx].escola || row.escola || "",
      dataEntrega: provasEntrega[idx].dataEntrega || row.dataEntrega || new Date().toISOString(),
      recebedor: provasEntrega[idx].recebedor || row.recebedor || "-",
      obs: provasEntrega[idx].obs || row.obs || "",
      statusEntrega: normalizeEntregaStatus(statusEntrega)
    };
  } else {
    provasEntrega.push({
      pedidoId: row.pedidoId,
      escola: row.escola || "",
      dataEntrega: row.dataEntrega || new Date().toISOString(),
      recebedor: row.recebedor || "-",
      foto: row.foto || "",
      assinatura: row.assinatura || "",
      obs: row.obs || "Entrega operacional criada a partir da demanda do Estoque Intel.",
      statusEntrega: normalizeEntregaStatus(statusEntrega)
    });
    idx = provasEntrega.length - 1;
  }
  localStorage.setItem(PROOFS_KEY, JSON.stringify(provasEntrega));
  schedulCloudSync();
  return idx;
}

function _renderEntregasUI() {
  const entregasOperacionais = buildEntregasOperacionais();
  const entregasPendentesDemanda = entregasOperacionais.filter((item) => item.__source === "demanda");
  const countEl = document.getElementById("tab-count-entregas");
  if (countEl) countEl.textContent = entregasOperacionais.length;

  const tbody = document.getElementById("entregas-tbody");
  const empty = document.getElementById("entregas-empty");
  const operacionaisBox = document.getElementById("entregas-operacionais-box");
  const busca = (document.getElementById("busca-entrega")?.value || "").toLowerCase();
  const filtroData = document.getElementById("filtro-data-entrega")?.value || "";
  const filtroStatus = document.getElementById("filtro-status-entrega")?.value || "";
  if (operacionaisBox) {
    if (entregasPendentesDemanda.length) {
      operacionaisBox.classList.remove("hidden");
      operacionaisBox.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
          <div>
            <div style="font-size:.85rem;font-weight:700">Demandas prontas para entrega</div>
            <div style="font-size:.78rem;color:var(--mut)">Estas linhas vieram do Estoque Intel e ainda nao possuem comprovante do app.</div>
          </div>
          <span class="badge badge-blue">${entregasPendentesDemanda.length}</span>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem">
          ${entregasPendentesDemanda.slice(0, 6).map((item) => `<button class="btn btn-outline btn-sm" onclick="concluirEntregaPorPedidoId('${esc(item.pedidoId)}')">${esc(item.pedidoId)} | ${esc(item.escola || "-")}</button>`).join("")}
        </div>
      `;
    } else {
      operacionaisBox.classList.add("hidden");
      operacionaisBox.innerHTML = "";
    }
  }

  let filtered = entregasOperacionais;
  if (busca) {
    filtered = filtered.filter(p =>
      (p.pedidoId || "").toLowerCase().includes(busca) ||
      (p.escola || "").toLowerCase().includes(busca) ||
      (p.recebedor || "").toLowerCase().includes(busca)
    );
  }
  if (filtroData) {
    filtered = filtered.filter(p => {
      if (!p.dataEntrega) return false;
      const d = new Date(p.dataEntrega).toISOString().split("T")[0];
      return d === filtroData;
    });
  }
  if (filtroStatus) {
    filtered = filtered.filter(p => normalizeEntregaStatus(p.statusEntrega) === filtroStatus);
  }
  entregasOperacionaisRender = filtered;

  if (filtered.length === 0) {
    tbody.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  tbody.innerHTML = filtered.map((p, idx) => {
    const dataFmt = p.dataEntrega ? new Date(p.dataEntrega).toLocaleString("pt-BR") : "-";
    const temFoto = p.foto ? '<span style="color:var(--green);font-weight:700">Sim</span>' : '<span style="color:var(--dim)">Nao</span>';
    const temAssinatura = p.assinatura ? '<span style="color:var(--green);font-weight:700">Sim</span>' : '<span style="color:var(--dim)">Nao</span>';
    const status = normalizeEntregaStatus(p.statusEntrega);
    const statusBadge = status === "concluido" ? "badge-green" : "badge-yellow";
    const reservaStatus = getEstoqueIntelReservaStatus(p.pedidoId);
    const reservaResumo = getEntregaReservaResumo(p.pedidoId);
    const baixaIcone = reservaStatus.key === "baixada"
      ? `<span title="Baixa do estoque concluida" style="display:inline-flex;align-items:center;justify-content:center;width:1.3rem;height:1.3rem;border-radius:999px;background:rgba(34,197,94,.16);color:#22c55e;font-weight:900;margin-left:.35rem">✓</span>`
      : "";
    return `<tr>
      <td><strong>${esc(p.pedidoId || "")}</strong></td>
      <td>${esc(p.escola || "")}</td>
      <td>${dataFmt}</td>
      <td>${esc(p.recebedor || "")}</td>
      <td style="text-align:center">${temFoto}</td>
      <td style="text-align:center">${temAssinatura}</td>
      <td><span class="badge ${statusBadge}">${status}</span></td>
      <td><span class="badge ${reservaStatus.badgeClass}">${esc(reservaStatus.label)}</span>${baixaIcone ? `<br>${baixaIcone}<span style="font-size:.72rem;color:#22c55e;margin-left:.3rem;font-weight:700">Baixa feita</span>` : ""}<br><span style="font-size:.72rem;color:var(--mut)">Qtd base: ${Number(reservaResumo.totalBase || 0)}</span></td>
      <td style="max-width:240px"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(reservaResumo.produtosResumo || "-")}</div><div style="font-size:.72rem;color:var(--mut);margin-top:.2rem">${esc(p.obs || "-")}</div></td>
      <td class="nowrap">
        <button class="btn btn-outline btn-sm" onclick="verComprovante(${idx})" style="border:1px solid var(--bdr);background:transparent;color:var(--blue);border-radius:6px;cursor:pointer;padding:.3rem .6rem;font-size:.75rem">Ver</button>
        ${(status === "concluido" || status === "entregue" || reservaStatus.key === "baixada") ? `<span style="color:var(--mut);font-size:.75rem;font-weight:600;margin-left:.3rem">${status === "entregue" ? "Entregue" : status === "concluido" ? "Concluida" : ""}</span><button class="btn btn-outline btn-sm" onclick="reverterEntrega(${idx})" style="padding:.3rem .6rem;font-size:.75rem;margin-left:.3rem;border-color:rgba(245,158,11,.5);color:#f59e0b" title="Reverter baixa manual">↩️ Reverter</button>` : `<button class="btn btn-sm btn-green" onclick="concluirEntrega(${idx})" style="padding:.3rem .6rem;font-size:.75rem;margin-left:.3rem">Concluir</button>`}
        ${reservaStatus.key !== "baixada" ? `<button class="btn btn-outline btn-sm" onclick="baixarReservaEntregaManual(${idx})" style="padding:.3rem .6rem;font-size:.75rem;margin-left:.3rem">Baixar Estoque</button>` : ""}
        <button onclick="excluirEntrega(${idx})" title="Excluir entrega" style="background:rgba(239,68,68,.15);color:var(--red);border:none;border-radius:6px;padding:.3rem .55rem;font-size:.82rem;font-weight:700;cursor:pointer;margin-left:.3rem">🗑️</button>
      </td>
    </tr>`;
  }).join("");
}

function reverterEntrega(idx) {
  const p = entregasOperacionaisRender[idx];
  if (!p) return;
  if (!confirm(`Reverter baixa de ${p.pedidoId}?\n\nA entrega, reserva do estoque e pedido serão revertidos.`)) return;
  const pid = p.pedidoId;
  const provaIdx = provasEntrega.findIndex(pr => pr.pedidoId === pid);
  if (provaIdx >= 0) provasEntrega[provaIdx].statusEntrega = "pendente";
  localStorage.setItem(PROOFS_KEY, JSON.stringify(provasEntrega));
  const movsBefore = estoqueIntelMovimentacoes.length;
  estoqueIntelMovimentacoes = estoqueIntelMovimentacoes.filter(mov => {
    if (mov.referencia_id === pid && (mov.origem === "entrega_concluida" || mov.origem_sistema === "gdp_entrega")) return false;
    if (mov.id && mov.id.startsWith("ENT-MOV-") && mov.id.includes(pid)) return false;
    return true;
  });
  if (estoqueIntelMovimentacoes.length !== movsBefore) saveEstoqueIntelMovimentacoes();
  const demanda = estoqueIntelPedidos.find(d => d.id === pid);
  if (demanda && demanda.status !== "reservada") { demanda.status = "reservada"; saveEstoqueIntelPedidos(); saveEstoqueIntelPedidoItens(); }
  const pedido = pedidos.find(pp => pp.id === pid);
  if (pedido && (pedido.status === "entregue" || pedido.status === "faturado" || pedido.status === "concluido")) { pedido.status = "em_aberto"; savePedidos(); }
  schedulCloudSync();
  renderEntregas();
  if (typeof renderEstoque === "function") renderEstoque();
  if (typeof renderPedidos === "function") renderPedidos();
  showToast(`Entrega ${pid} totalmente revertida: baixa desfeita, reserva e pedido restaurados.`);
}

function verComprovante(idx) {
  const p = entregasOperacionaisRender[idx];
  if (!p) return;

  document.getElementById("modal-comprovante-titulo").textContent = "Comprovante — " + (p.pedidoId || "");
  const dataFmt = p.dataEntrega ? new Date(p.dataEntrega).toLocaleString("pt-BR") : "-";
  const reservaStatus = getEstoqueIntelReservaStatus(p.pedidoId);
  const reservaResumo = getEntregaReservaResumo(p.pedidoId);

  let html = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem">
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Escola</div>
        <div style="font-weight:700">${esc(p.escola || "-")}</div>
      </div>
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Data da Entrega</div>
        <div style="font-weight:700">${dataFmt}</div>
      </div>
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Recebedor</div>
        <div style="font-weight:700">${esc(p.recebedor || "-")}</div>
      </div>
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Observacoes</div>
        <div>${esc(p.obs || "Nenhuma")}</div>
      </div>
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Status da Reserva</div>
        <div><span class="badge ${reservaStatus.badgeClass}">${esc(reservaStatus.label)}</span></div>
      </div>
      <div>
        <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.3rem">Detalhe da Reserva</div>
        <div>${esc(reservaResumo.produtosResumo || "-")}<br><span style="font-size:.82rem;color:var(--mut)">Qtd base total: ${Number(reservaResumo.totalBase || 0)}</span></div>
      </div>
    </div>
  `;

  if (p.foto) {
    html += `<div style="margin-bottom:1.5rem">
      <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.5rem">Foto da Entrega</div>
      <img src="${p.foto}" style="width:100%;max-height:400px;object-fit:contain;border-radius:10px;border:1px solid var(--bdr);background:var(--s1)" alt="Foto da entrega">
    </div>`;
  } else {
    html += `<div style="margin-bottom:1.5rem;padding:2rem;text-align:center;color:var(--dim);background:var(--s1);border-radius:10px;border:1px solid var(--bdr)">Sem foto registrada</div>`;
  }

  if (p.assinatura) {
    html += `<div style="margin-bottom:1rem">
      <div style="font-size:.72rem;color:var(--mut);text-transform:uppercase;margin-bottom:.5rem">Assinatura do Recebedor</div>
      <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:.5rem;text-align:center">
        <img src="${p.assinatura}" style="max-width:100%;max-height:200px" alt="Assinatura">
      </div>
    </div>`;
  }

  document.getElementById("modal-comprovante-body").innerHTML = html;
  document.getElementById("modal-comprovante").classList.remove("hidden");
  document.getElementById("modal-comprovante").style.display = "flex";
}

function fecharComprovante() {
  document.getElementById("modal-comprovante").classList.add("hidden");
  document.getElementById("modal-comprovante").style.display = "none";
}

function concluirEntregaPorPedidoId(pedidoId) {
  const idx = entregasOperacionaisRender.findIndex((item) => item.pedidoId === pedidoId);
  if (idx < 0) {
    showToast("Entrega operacional nao encontrada para esse pedido.", 3500);
    return;
  }
  concluirEntrega(idx);
}

function concluirEntrega(idx) {
  const p = entregasOperacionaisRender[idx];
  if (!p) return;
  const baixaEstoque = aplicarBaixaEntregaAoEstoqueIntel(p.pedidoId);
  garantirProvaEntregaOperacional(p, "concluido");
  p.statusEntrega = "concluido";
  _renderEntregasUI();
  if (typeof renderEstoque === "function") renderEstoque();
  if (baixaEstoque.ok && baixaEstoque.motivo === "baixa_realizada") {
    showToast(`Entrega "${p.pedidoId || ""}" concluida e reserva baixada no Estoque Intel.`);
    return;
  }
  if (baixaEstoque.ok && baixaEstoque.motivo === "ja_baixada") {
    showToast(`Entrega "${p.pedidoId || ""}" ja estava concluida no Estoque Intel.`);
    return;
  }
  showToast(`Entrega "${p.pedidoId || ""}" concluida.`);
}

function baixarReservaEntregaManual(idx) {
  const p = entregasOperacionaisRender[idx];
  if (!p?.pedidoId) return;
  const reservaStatus = getEstoqueIntelReservaStatus(p.pedidoId);
  if (reservaStatus.key === "baixada") {
    showToast(`Pedido "${p.pedidoId}" ja teve a reserva baixada no Estoque Intel.`, 3500);
    return;
  }
  if (!confirm(`Baixar manualmente a reserva do pedido ${p.pedidoId} no Estoque Intel?\n\nIsso vai retirar a reserva comprometida e dar baixa fisica dos itens vinculados.`)) return;
  const baixaEstoque = aplicarBaixaEntregaAoEstoqueIntel(p.pedidoId);
  if (typeof renderEstoque === "function") renderEstoque();
  if (baixaEstoque.ok && baixaEstoque.motivo === "baixa_realizada") {
    garantirProvaEntregaOperacional(p, "concluido");
    _renderEntregasUI();
    showToast(`Reserva do pedido "${p.pedidoId}" baixada manualmente no Estoque Intel.`, 4000);
    return;
  }
  if (baixaEstoque.ok && baixaEstoque.motivo === "ja_baixada") {
    garantirProvaEntregaOperacional(p, "concluido");
    _renderEntregasUI();
    showToast(`Pedido "${p.pedidoId}" ja estava baixado no Estoque Intel.`, 3500);
    return;
  }
  const motivoLabel = baixaEstoque.motivo === "demanda_nao_encontrada"
    ? "nao existe demanda/reserva vinculada para esse pedido"
    : baixaEstoque.motivo === "itens_nao_encontrados"
      ? "a demanda existe, mas esta sem itens vinculados"
      : "o pedido nao foi encontrado";
  showToast(`Nao foi possivel baixar a reserva: ${motivoLabel}.`, 4500);
}

function excluirEntrega(idx) {
  const p = entregasOperacionaisRender[idx];
  if (!p) return;
  if (!confirm(`Excluir entrega "${p.pedidoId || ""}" — ${p.escola || ""}?`)) return;
  const provaIdx = provasEntrega.findIndex((item) => item.pedidoId === p.pedidoId);
  if (provaIdx < 0) {
    showToast("Essa linha veio de uma demanda aberta. Para ela sumir daqui, encerre ou baixe a reserva.", 4500);
    return;
  }
  provasEntrega.splice(provaIdx, 1);
  localStorage.setItem(PROOFS_KEY, JSON.stringify(provasEntrega));
  schedulCloudSync();
  _renderEntregasUI();
  showToast("Entrega excluída");
}

// ===== TINY ERP — CADASTRO DE PRODUTOS =====
const TINY_NCM_MAP = [
  { keywords: ["embalagem", "plastica", "freezer"], ncm: "3923.29.90" },
  { keywords: ["isqueiro", "gas"], ncm: "9613.10.00" },
  { keywords: ["sabao", "barra"], ncm: "3401.19.00" },
  { keywords: ["vassoura", "nylon", "piacava"], ncm: "9603.10.00" },
  { keywords: ["cloro", "gel"], ncm: "2828.90.11" },
  { keywords: ["lixeira", "plastica", "pedal"], ncm: "3924.90.00" },
  { keywords: ["escova", "alimentos", "legumes"], ncm: "9603.90.00" },
  { keywords: ["rodo", "magico", "refil"], ncm: "9603.90.00" },
  { keywords: ["mangueira", "jardim"], ncm: "3917.39.00" },
  { keywords: ["detergente"], ncm: "3402.20.00" },
  { keywords: ["agua", "sanitaria"], ncm: "2828.90.11" },
  { keywords: ["esponja"], ncm: "3926.90.90" },
  { keywords: ["pano", "chao"], ncm: "6307.10.00" },
  { keywords: ["desinfetante"], ncm: "3808.94.19" },
  { keywords: ["luva", "latex", "borracha"], ncm: "4015.19.00" },
  { keywords: ["papel", "higienico"], ncm: "4818.10.00" },
  { keywords: ["papel", "toalha"], ncm: "4818.20.00" },
  { keywords: ["saco", "lixo"], ncm: "3923.29.90" },
  { keywords: ["balde"], ncm: "3924.10.00" },
  { keywords: ["alcool"], ncm: "2207.10.90" },
  { keywords: ["sabonete"], ncm: "3401.11.90" },
  { keywords: ["cera", "piso"], ncm: "3405.40.00" },
  { keywords: ["amaciante"], ncm: "3809.91.90" },
  { keywords: ["limpador", "multiuso"], ncm: "3402.20.00" },
  { keywords: ["inseticida"], ncm: "3808.91.99" },
  { keywords: ["ventilador"], ncm: "8414.51.90" },
  { keywords: ["bebedouro"], ncm: "8418.69.99" },
  { keywords: ["cadeira", "escolar"], ncm: "9401.80.00" },
  { keywords: ["mesa", "escolar"], ncm: "9403.70.00" },
  { keywords: ["quadro", "branco", "lousa"], ncm: "9610.00.00" },
  { keywords: ["caneta", "pilot", "marcador"], ncm: "9608.20.00" },
  { keywords: ["apagador"], ncm: "9603.90.00" },
  { keywords: ["lampada", "led"], ncm: "8539.50.00" },
  { keywords: ["tomada", "extensao", "filtro", "linha"], ncm: "8536.69.90" },
  { keywords: ["cadeado"], ncm: "8301.10.00" },
  { keywords: ["toner", "cartucho", "impressora"], ncm: "8443.99.33" },
  { keywords: ["resma", "sulfite", "a4"], ncm: "4802.56.10" },
  { keywords: ["grampeador"], ncm: "8472.90.29" },
  { keywords: ["tesoura"], ncm: "8213.00.00" },
  { keywords: ["cola", "branca", "bastao"], ncm: "3506.10.90" },
  { keywords: ["fita", "adesiva", "durex", "crepe"], ncm: "3919.10.00" },
  { keywords: ["clips", "clipe"], ncm: "7319.90.00" },
  { keywords: ["borracha", "apagar"], ncm: "4016.92.00" },
  { keywords: ["lapis"], ncm: "9609.10.00" },
  { keywords: ["caneta", "esferografica"], ncm: "9608.10.00" },
  { keywords: ["envelope"], ncm: "4817.10.00" },
  { keywords: ["pasta", "arquivo"], ncm: "4819.60.00" },
  { keywords: ["copo", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["guardanapo"], ncm: "4818.30.00" },
  { keywords: ["panela", "caldeira"], ncm: "7323.93.00" },
  { keywords: ["tinta", "acrilica", "parede"], ncm: "3209.10.00" },
  { keywords: ["vassoura", "gari"], ncm: "9603.10.00" },
  { keywords: ["pa", "lixo"], ncm: "7323.99.00" },
  { keywords: ["dispenser", "sabonete", "papel"], ncm: "3924.90.00" },
  // ─── Alimentícios ───
  { keywords: ["acucar", "cristal", "refinado"], ncm: "1701.14.00" },
  { keywords: ["biscoito", "bolacha", "cream cracker"], ncm: "1905.31.00" },
  { keywords: ["cacau", "chocolate", "achocolatado"], ncm: "1805.00.00" },
  { keywords: ["extrato", "tomate", "molho"], ncm: "2002.90.00" },
  { keywords: ["feijao", "carioca", "preto"], ncm: "0713.33.19" },
  { keywords: ["polvilho", "amido", "mandioca"], ncm: "1108.14.00" },
  { keywords: ["sal", "refinado", "iodado"], ncm: "2501.00.20" },
  { keywords: ["pao", "frances", "forma"], ncm: "1905.90.10" },
  { keywords: ["rosca", "rosquinha"], ncm: "1905.90.90" },
  { keywords: ["arroz"], ncm: "1006.30.21" },
  { keywords: ["macarrao", "espaguete", "massa"], ncm: "1902.19.00" },
  { keywords: ["oleo", "soja", "vegetal"], ncm: "1507.90.11" },
  { keywords: ["cafe", "torrado", "moido"], ncm: "0901.21.00" },
  { keywords: ["leite", "integral", "desnatado"], ncm: "0401.10.10" },
  { keywords: ["farinha", "trigo"], ncm: "1101.00.10" },
  { keywords: ["margarina", "manteiga"], ncm: "1517.10.00" },
  { keywords: ["vinagre"], ncm: "2209.00.00" },
  { keywords: ["fuba", "milho", "quirera"], ncm: "1102.20.00" },
  { keywords: ["sardinha", "atum", "conserva"], ncm: "1604.13.10" },
  { keywords: ["suco", "refresco", "nectar"], ncm: "2009.89.90" },
  // ─── Hortifruti ───
  { keywords: ["alface"], ncm: "0705.11.00" },
  { keywords: ["tomate"], ncm: "0702.00.00" },
  { keywords: ["cebola"], ncm: "0703.10.19" },
  { keywords: ["cebolinha"], ncm: "0703.90.00" },
  { keywords: ["couve"], ncm: "0704.90.00" },
  { keywords: ["repolho"], ncm: "0704.90.00" },
  { keywords: ["batata"], ncm: "0701.90.00" },
  { keywords: ["cenoura"], ncm: "0706.10.00" },
  { keywords: ["beterraba"], ncm: "0706.90.00" },
  { keywords: ["chuchu"], ncm: "0709.99.00" },
  { keywords: ["abobora", "abobrinha", "moranga"], ncm: "0709.93.00" },
  { keywords: ["pimentao"], ncm: "0709.60.00" },
  { keywords: ["quiabo"], ncm: "0709.99.00" },
  { keywords: ["jilo"], ncm: "0709.99.00" },
  { keywords: ["mandioca", "aipim"], ncm: "0714.10.00" },
  { keywords: ["inhame", "cara"], ncm: "0714.40.00" },
  { keywords: ["banana"], ncm: "0803.10.00" },
  { keywords: ["laranja"], ncm: "0805.10.00" },
  { keywords: ["limao"], ncm: "0805.50.00" },
  { keywords: ["maca", "maça"], ncm: "0808.10.00" },
  { keywords: ["mamao"], ncm: "0807.20.00" },
  { keywords: ["melancia"], ncm: "0807.11.00" },
  { keywords: ["abacaxi"], ncm: "0804.30.00" },
  { keywords: ["manga"], ncm: "0804.50.20" },
  { keywords: ["alho"], ncm: "0703.20.10" },
  { keywords: ["cheiro", "verde", "salsa", "coentro"], ncm: "0709.99.00" },
  { keywords: ["milho", "espiga"], ncm: "0710.40.00" },
  // ─── Carnes e Proteínas ───
  { keywords: ["frango", "coxa", "sobrecoxa", "peito", "asa"], ncm: "0207.14.00" },
  { keywords: ["carne", "bovina", "acem", "patinho", "musculo"], ncm: "0201.30.00" },
  { keywords: ["carne", "suina", "porco", "lombo", "costela"], ncm: "0203.29.00" },
  { keywords: ["linguica", "calabresa"], ncm: "1601.00.00" },
  { keywords: ["salsicha"], ncm: "1601.00.00" },
  { keywords: ["ovo", "ovos", "galinha"], ncm: "0407.21.00" },
  { keywords: ["peixe", "tilapia", "merluza", "pescada"], ncm: "0304.89.00" },
  // ─── Laticínios ───
  { keywords: ["queijo", "mussarela", "prato"], ncm: "0406.10.10" },
  { keywords: ["requeijao"], ncm: "0406.10.90" },
  { keywords: ["iogurte"], ncm: "0403.10.00" },
  { keywords: ["creme", "leite"], ncm: "0401.40.10" },
  { keywords: ["leite", "condensado"], ncm: "0402.99.00" },
  { keywords: ["leite", "po"], ncm: "0402.21.10" },
  // ─── Temperos e Condimentos ───
  { keywords: ["colorau", "colorific", "urucum"], ncm: "0910.91.00" },
  { keywords: ["pimenta", "reino"], ncm: "0904.12.00" },
  { keywords: ["oregano"], ncm: "1211.90.90" },
  { keywords: ["louro"], ncm: "0910.99.00" },
  { keywords: ["cominho"], ncm: "0909.31.00" },
  { keywords: ["caldo", "galinha", "tempero"], ncm: "2104.10.11" },
  { keywords: ["mostarda"], ncm: "2103.30.21" },
  { keywords: ["maionese"], ncm: "2103.90.11" },
  { keywords: ["catchup", "ketchup"], ncm: "2103.20.10" },
  // ─── Grãos e Cereais ───
  { keywords: ["aveia"], ncm: "1104.12.00" },
  { keywords: ["granola"], ncm: "1904.20.00" },
  { keywords: ["ervilha"], ncm: "2005.40.00" },
  { keywords: ["milho", "conserva", "lata"], ncm: "2005.80.00" },
  { keywords: ["lentilha"], ncm: "0713.40.10" },
  { keywords: ["soja", "proteina"], ncm: "2106.10.00" },
  // ─── Descartáveis ───
  { keywords: ["prato", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["talher", "garfo", "faca", "colher", "descartavel"], ncm: "3924.10.00" },
  { keywords: ["marmitex", "marmita", "quentinha"], ncm: "7612.90.19" },
  { keywords: ["filme", "pvc", "plastico"], ncm: "3920.43.00" },
  { keywords: ["papel", "aluminio"], ncm: "7607.11.90" },
  // ─── Higiene Pessoal ───
  { keywords: ["shampoo", "xampu"], ncm: "3305.10.00" },
  { keywords: ["creme", "dental", "dentifricio"], ncm: "3306.10.00" },
  { keywords: ["escova", "dental", "dente"], ncm: "9603.21.00" },
  { keywords: ["fralda", "descartavel"], ncm: "9619.00.00" },
  { keywords: ["absorvente"], ncm: "9619.00.00" },
];

let _ncmDebounceAdd, _ncmDebounceEdit;
function sugerirNcmAdd() {
  clearTimeout(_ncmDebounceAdd);
  _ncmDebounceAdd = setTimeout(() => {
    const desc = (document.getElementById("ai-descricao")?.value || "").trim();
    const ncmField = document.getElementById("ai-ncm");
    const hint = document.getElementById("ai-ncm-hint");
    if (!desc || !ncmField) return;
    const match = findNcmLocal(desc);
    if (match && !ncmField.value) {
      ncmField.value = match.ncm;
      if (hint) hint.textContent = "Sugerido automaticamente";
    } else if (!match && hint) {
      hint.textContent = "";
    }
  }, 400);
}
function sugerirNcmEdit() {
  clearTimeout(_ncmDebounceEdit);
  _ncmDebounceEdit = setTimeout(() => {
    const desc = (document.getElementById("ei-descricao")?.value || "").trim();
    const ncmField = document.getElementById("ei-ncm");
    const hint = document.getElementById("ei-ncm-hint");
    if (!desc || !ncmField) return;
    const match = findNcmLocal(desc);
    if (match) {
      if (!ncmField.value) ncmField.value = match.ncm;
      if (hint) hint.textContent = "Sugestão: " + match.ncm;
    } else if (hint) {
      hint.textContent = "";
    }
  }, 400);
}

function findNcmLocal(description) {
  const lower = (description || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let best = null, bestScore = 0;
  for (const entry of TINY_NCM_MAP) {
    const score = entry.keywords.filter(kw => lower.includes(kw)).length;
    if (score > bestScore) { bestScore = score; best = entry; }
  }
  return best;
}

function getBaseUrl() {
  // Vercel API routes use /api/ prefix
  if (location.hostname.includes("vercel.app")) return "/api";
  return "/api"; // Works with both Vercel and local dev
}

function salvarNcmItem(contratoId, itemIdx, value) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  c.itens[itemIdx].ncm = value.trim();
  enrichContratoItemMetadata(c, c.itens[itemIdx], itemIdx);
  saveContratos();
  syncContratoItemToPedidos(contratoId, c.itens[itemIdx]);
}

function buscarNcmItem(contratoId, itemIdx) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c || !c.itens[itemIdx]) return;
  const item = c.itens[itemIdx];
  const ncm = findNcmLocal(item.descricao);
  const inputEl = document.getElementById(`ncm-${contratoId}-${itemIdx}`);
  if (ncm) {
    item.ncm = ncm.ncm;
    enrichContratoItemMetadata(c, item, itemIdx);
    if (inputEl) inputEl.value = ncm.ncm;
    saveContratos();
    syncContratoItemToPedidos(contratoId, item);
    showToast(`NCM ${ncm.ncm} encontrado para "${item.descricao.slice(0,30)}"`);
  } else {
    showToast(`Nenhum NCM encontrado para "${item.descricao.slice(0,30)}"`, 3000);
  }
}

function preencherNcmTodos(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  let filled = 0, notFound = 0;
  c.itens.forEach((item, idx) => {
    if (item.ncm && item.ncm.length > 3) return; // skip already filled
    const ncm = findNcmLocal(item.descricao);
    if (ncm) {
      item.ncm = ncm.ncm;
      enrichContratoItemMetadata(c, item, idx);
      const inputEl = document.getElementById(`ncm-${contratoId}-${idx}`);
      if (inputEl) inputEl.value = ncm.ncm;
      syncContratoItemToPedidos(contratoId, item);
      filled++;
    } else {
      notFound++;
    }
  });
  saveContratos();
  showToast(`NCM preenchido: ${filled} itens. ${notFound > 0 ? notFound + ' sem NCM encontrado.' : ''}`, 4000);
}

function autoPreencherNcm(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return { filled: 0, pending: 0 };
  loadBancoProdutos();
  const bp = bancoProdutos.itens || [];
  let filled = 0, pending = 0;
  c.itens.forEach((item, idx) => {
    if (item.ncm && item.ncm.length >= 8) return;
    // Camada 1: mapa local expandido
    const local = findNcmLocal(item.descricao);
    if (local) { item.ncm = local.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
    // Camada 2: Banco de Produtos (cache)
    const descNorm = (item.descricao || '').toUpperCase().trim();
    const bpMatch = bp.find(p => (p.descricao || '').toUpperCase().trim() === descNorm && p.ncm && p.ncm.length >= 8);
    if (!bpMatch) {
      const words = descNorm.split(/\s+/).slice(0, 3).join(' ');
      if (words.length > 5) {
        const fuzzy = bp.find(p => (p.descricao || '').toUpperCase().trim().startsWith(words) && p.ncm && p.ncm.length >= 8);
        if (fuzzy) { item.ncm = fuzzy.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
      }
    }
    if (bpMatch) { item.ncm = bpMatch.ncm; enrichContratoItemMetadata(c, item, idx); syncContratoItemToPedidos(contratoId, item); filled++; return; }
    pending++;
  });
  if (filled > 0) saveContratos();
  return { filled, pending };
}

async function classificarNcmIA(contratoId) {
  const c = contratos.find(x => x.id === contratoId);
  if (!c) return;
  const semNcm = c.itens.filter(i => !i.ncm || i.ncm.length < 8);
  if (semNcm.length === 0) { showToast("Todos os itens ja tem NCM!"); return; }
  showToast(`Classificando ${semNcm.length} itens com IA...`, 3000);

  for (let start = 0; start < semNcm.length; start += 20) {
    const batch = semNcm.slice(start, start + 20);
    try {
      const resp = await fetch("/api/ai-ncm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: batch.map(i => ({ descricao: i.descricao })) })
      });
      const data = await resp.json();
      if (data.success && data.results) {
        data.results.forEach((r, idx) => {
          if (r.ncm && batch[idx]) {
            batch[idx].ncm = r.ncm;
            const realIdx = c.itens.findIndex((item) => item === batch[idx]);
            enrichContratoItemMetadata(c, batch[idx], realIdx >= 0 ? realIdx : idx);
            syncContratoItemToPedidos(contratoId, batch[idx]);
            adicionarAoBancoProdutos({ ...batch[idx], ncm: r.ncm });
          }
        });
      }
    } catch(err) {
      showToast("Erro na classificacao IA: " + err.message, 4000);
    }
  }
  saveContratos();
  abrirContrato(contratoId);
  const classified = semNcm.filter(i => i.ncm && i.ncm.length >= 8).length;
  showToast(`IA classificou ${classified}/${semNcm.length} itens!`, 4000);
}
