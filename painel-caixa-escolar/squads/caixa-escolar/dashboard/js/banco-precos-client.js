/**
 * Banco de Preços — Client SDK para Licita-AIX
 * Conecta o painel do fornecedor à API v2 do banco de preços
 *
 * Endpoints:
 *   POST /api/v2/intake         — enviar itens extraídos do SGD
 *   POST /api/v2/calcular-preco — preço sugerido + semáforo
 *   POST /api/v2/propostas      — registrar proposta enviada
 *   PUT  /api/v2/propostas/:id/resultado — registrar ganhou/perdeu
 *   GET  /api/v2/analytics      — métricas do banco
 */

const BancoPrecos = (() => {
  // Config — lida de localStorage ou defaults
  const CONFIG_KEY = "bancoprecos.config";
  const defaults = {
    baseUrl: "https://cotacoes-lariucci.vercel.app",
    apiKey: "",
    enabled: false,
  };

  function getConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
    } catch (_) { return { ...defaults }; }
  }

  function saveConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }

  function isEnabled() {
    const cfg = getConfig();
    return cfg.enabled && cfg.apiKey && cfg.baseUrl;
  }

  async function apiCall(method, path, body) {
    const cfg = getConfig();
    if (!cfg.enabled || !cfg.apiKey) {
      console.warn("[BancoPrecos] Desabilitado ou sem API key");
      return null;
    }

    const url = `${cfg.baseUrl}${path}`;
    const opts = {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": cfg.apiKey,
      },
    };
    if (body) opts.body = JSON.stringify(body);

    try {
      const resp = await fetch(url, opts);
      const data = await resp.json();
      if (!resp.ok) {
        console.error(`[BancoPrecos] ${method} ${path} → ${resp.status}:`, data);
        return null;
      }
      return data;
    } catch (err) {
      console.error(`[BancoPrecos] ${method} ${path} falhou:`, err.message);
      return null;
    }
  }

  // ===== INTAKE: Enviar itens do SGD ao banco =====
  async function enviarItensIntake(orcamentos) {
    if (!isEnabled()) return null;

    const itens = [];
    for (const orc of orcamentos) {
      const escola = orc.escola || orc.schoolName || "";
      const municipio = orc.municipio || orc._municipio || "";
      const grupo = orc.grupo || orc.expenseGroup || "";
      const idSgd = String(orc.id || "");

      for (const item of (orc.itens || [])) {
        itens.push({
          nome: item.nome || item.item || "",
          descricao: item.descricao || item.description || "",
          unidade: item.unidade || item.unit || "UN",
          quantidade: parseFloat(item.quantidade || item.qty || 0),
          grupo_despesa: grupo,
          escola: escola,
          municipio: municipio,
          fonte: "SGD",
          fonte_detalhe: `SGD #${idSgd}`,
          id_orcamento_sgd: idSgd,
        });
      }
    }

    if (itens.length === 0) return null;

    console.log(`[BancoPrecos] Enviando ${itens.length} itens ao intake...`);
    const result = await apiCall("POST", "/api/v2/intake", { itens });
    if (result) {
      console.log(`[BancoPrecos] Intake: ${result.vinculados} vinculados, ${result.pendentes} pendentes, ${result.rejeitados} rejeitados`);
    }
    return result;
  }

  // ===== CALCULAR PREÇO: Sugestão + semáforo =====
  async function calcularPreco(nomeItem, unidade, quantidade, escola, municipio) {
    if (!isEnabled()) return null;

    return apiCall("POST", "/api/v2/calcular-preco", {
      item_nome: nomeItem,
      unidade: unidade || "UN",
      quantidade: quantidade || 1,
      escola: escola || "",
      municipio: municipio || "",
    });
  }

  // ===== CALCULAR LOTE: Preço sugerido para todos os itens =====
  async function calcularLote(itens, escola, municipio) {
    if (!isEnabled()) return [];

    const resultados = [];
    for (const item of itens) {
      const result = await calcularPreco(
        item.nome || item.item,
        item.unidade || item.unit,
        parseFloat(item.quantidade || item.qty || 1),
        escola,
        municipio
      );
      resultados.push({
        ...item,
        _bp: result, // banco de precos response
        _precoSugerido: result?.preco_sugerido || null,
        _semaforo: result?.semaforo || "SEM_DADOS",
        _confianca: result?.confianca || "SEM_DADOS",
        _marcas: result?.marcas_aceitas || [],
      });
    }
    return resultados;
  }

  // ===== REGISTRAR PROPOSTA =====
  async function registrarProposta(idOrcamentoSgd, escola, municipio, grupoDespesa, itens) {
    if (!isEnabled()) return null;

    return apiCall("POST", "/api/v2/propostas", {
      id_orcamento_sgd: String(idOrcamentoSgd),
      escola,
      municipio,
      grupo_despesa: grupoDespesa,
      itens: itens.map(item => ({
        nome_sgd: item.nome || item.item,
        unidade: item.unidade || item.unit || "UN",
        quantidade: parseFloat(item.quantidade || item.qty || 0),
        preco_unitario: parseFloat(item.valorUnitario || item.preco || 0),
        preco_sugerido: item._precoSugerido || null,
        custo_real: item.custoReal || null,
        semaforo: item._semaforo || null,
        confianca: item._confianca || null,
      })),
    });
  }

  // ===== REGISTRAR RESULTADO =====
  async function registrarResultado(propostaId, resultado, motivoRecusa) {
    if (!isEnabled()) return null;

    return apiCall("PUT", `/api/v2/propostas/${propostaId}/resultado`, {
      resultado, // "APROVADA" ou "RECUSADA"
      motivo_recusa: motivoRecusa || null,
    });
  }

  // ===== ANALYTICS =====
  async function getAnalytics() {
    if (!isEnabled()) return null;
    return apiCall("GET", "/api/v2/analytics");
  }

  // ===== SEMÁFORO BADGE HTML =====
  function semaforoBadge(semaforo, confianca) {
    const cores = {
      VERDE: { bg: "#22c55e", text: "white", icon: "●", label: "Competitivo" },
      AMARELO: { bg: "#eab308", text: "black", icon: "●", label: "Arriscado" },
      VERMELHO: { bg: "#ef4444", text: "white", icon: "●", label: "Caro" },
      SEM_DADOS: { bg: "#6b7280", text: "white", icon: "○", label: "Sem dados" },
    };
    const s = cores[semaforo] || cores.SEM_DADOS;
    const conf = confianca === "ALTA" ? "★★★" : confianca === "MEDIA" ? "★★☆" : confianca === "BAIXA" ? "★☆☆" : "☆☆☆";

    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:4px;font-size:11px;background:${s.bg};color:${s.text}" title="${s.label} | Confiança: ${confianca}">${s.icon} ${s.label} ${conf}</span>`;
  }

  // ===== PREÇO SUGERIDO HTML =====
  function precoSugeridoHtml(result) {
    if (!result || !result.preco_sugerido) return "";
    const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
    return `
      <div style="margin-top:4px;padding:4px 8px;background:rgba(34,197,94,0.1);border-left:3px solid #22c55e;border-radius:0 4px 4px 0;font-size:12px">
        ${semaforoBadge(result.semaforo, result.confianca)}
        <strong>${brl.format(result.preco_sugerido)}</strong>
        ${result.fundamentacao?.preco_que_ganha ? `<span style="opacity:0.7;margin-left:8px">Ganhou antes: ${brl.format(result.fundamentacao.preco_que_ganha)}</span>` : ""}
        ${result.marcas_aceitas?.length ? `<span style="opacity:0.7;margin-left:8px">Marcas: ${result.marcas_aceitas.join(", ")}</span>` : ""}
      </div>
    `;
  }

  // ===== SETUP UI (Config panel in Settings) =====
  function renderConfigPanel() {
    const cfg = getConfig();
    return `
      <div class="config-section" style="margin-top:16px;padding:16px;border:1px solid rgba(255,255,255,0.1);border-radius:8px">
        <h4 style="margin:0 0 12px">🔗 Banco de Preços — Integração</h4>
        <label style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <input type="checkbox" id="bp-enabled" ${cfg.enabled ? "checked" : ""}>
          <span>Ativar integração com Banco de Preços</span>
        </label>
        <div style="display:grid;gap:8px">
          <label>
            <span style="font-size:12px;opacity:0.7">URL do Banco de Preços</span>
            <input type="text" id="bp-url" value="${cfg.baseUrl}" placeholder="https://cotacoes-lariucci.vercel.app" style="width:100%;padding:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:inherit">
          </label>
          <label>
            <span style="font-size:12px;opacity:0.7">API Key</span>
            <input type="password" id="bp-apikey" value="${cfg.apiKey}" placeholder="lariucci_xxxxx" style="width:100%;padding:6px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.2);border-radius:4px;color:inherit">
          </label>
          <button onclick="BancoPrecos.testConnection()" style="padding:6px 12px;background:#3b82f6;border:none;border-radius:4px;color:white;cursor:pointer">Testar Conexão</button>
          <div id="bp-test-result" style="font-size:12px;margin-top:4px"></div>
        </div>
      </div>
    `;
  }

  function bindConfigEvents() {
    const elEnabled = document.getElementById("bp-enabled");
    const elUrl = document.getElementById("bp-url");
    const elApiKey = document.getElementById("bp-apikey");

    if (!elEnabled) return;

    const save = () => {
      saveConfig({
        enabled: elEnabled.checked,
        baseUrl: (elUrl?.value || "").trim().replace(/\/$/, ""),
        apiKey: (elApiKey?.value || "").trim(),
      });
    };

    elEnabled.addEventListener("change", save);
    elUrl?.addEventListener("change", save);
    elApiKey?.addEventListener("change", save);
  }

  async function testConnection() {
    const el = document.getElementById("bp-test-result");
    if (!el) return;

    el.innerHTML = "Testando...";

    const result = await getAnalytics();
    if (result) {
      el.innerHTML = `<span style="color:#22c55e">✅ Conectado! ${result.total_itens_mestre} itens, ${result.total_precos} preços, taxa ${result.taxa_aprovacao}%</span>`;
    } else {
      el.innerHTML = `<span style="color:#ef4444">❌ Falhou — verifique URL e API Key</span>`;
    }
  }

  // Public API
  return {
    getConfig,
    saveConfig,
    isEnabled,
    enviarItensIntake,
    calcularPreco,
    calcularLote,
    registrarProposta,
    registrarResultado,
    getAnalytics,
    semaforoBadge,
    precoSugeridoHtml,
    renderConfigPanel,
    bindConfigEvents,
    testConnection,
  };
})();
