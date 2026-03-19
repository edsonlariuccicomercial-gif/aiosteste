const DEFAULT_AMBIENTE = process.env.NFE_SEFAZ_AMBIENTE || "homologacao";

function getSefazConfig() {
  return {
    ambiente: DEFAULT_AMBIENTE,
    uf: process.env.NFE_SEFAZ_UF || "MG",
    cnpjEmitente: process.env.NFE_EMITENTE_CNPJ || "",
    razaoSocial: process.env.NFE_EMITENTE_RAZAO || "",
    nomeFantasia: process.env.NFE_EMITENTE_FANTASIA || "",
    ie: process.env.NFE_EMITENTE_IE || "",
    crt: process.env.NFE_EMITENTE_CRT || "3",
    certificadoBase64: process.env.NFE_CERT_BASE64 || "",
    certificadoSenha: process.env.NFE_CERT_PASSWORD || "",
    seriePadrao: process.env.NFE_SERIE_PADRAO || "1"
  };
}

function validateSefazConfig(config) {
  const missing = [];
  if (!config.cnpjEmitente) missing.push("NFE_EMITENTE_CNPJ");
  if (!config.razaoSocial) missing.push("NFE_EMITENTE_RAZAO");
  if (!config.ie) missing.push("NFE_EMITENTE_IE");
  if (!config.certificadoBase64) missing.push("NFE_CERT_BASE64");
  if (!config.certificadoSenha) missing.push("NFE_CERT_PASSWORD");
  return missing;
}

function sanitizeDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function buildNfePayloadFromPedido(pedido, overrides = {}) {
  const cfg = getSefazConfig();
  const cliente = pedido?.cliente || {};
  const itens = Array.isArray(pedido?.itens) ? pedido.itens : [];
  return {
    ambiente: cfg.ambiente,
    emitente: {
      cnpj: sanitizeDigits(cfg.cnpjEmitente),
      razaoSocial: cfg.razaoSocial,
      nomeFantasia: cfg.nomeFantasia,
      ie: cfg.ie,
      crt: cfg.crt,
      uf: cfg.uf
    },
    destinatario: {
      nome: cliente.nome || pedido?.escola || "",
      cnpj: sanitizeDigits(cliente.cnpj),
      ie: cliente.ie || "ISENTO",
      email: cliente.email || "",
      telefone: sanitizeDigits(cliente.telefone),
      endereco: {
        logradouro: cliente.logradouro || "",
        numero: cliente.numero || "S/N",
        complemento: cliente.complemento || "",
        bairro: cliente.bairro || "",
        cep: sanitizeDigits(cliente.cep),
        cidade: cliente.cidade || "",
        uf: cliente.uf || "MG"
      }
    },
    identificacao: {
      pedidoId: pedido?.id || "",
      contratoId: pedido?.contratoId || "",
      naturezaOperacao: overrides.naturezaOperacao || "VENDA DE MERCADORIA",
      serie: overrides.serie || cfg.seriePadrao,
      numero: overrides.numero || null
    },
    itens: itens.map((item, idx) => ({
      itemNum: item.itemNum || idx + 1,
      codigo: item.sku || item.codigoBarras || `ITEM-${idx + 1}`,
      descricao: item.descricao || `Item ${idx + 1}`,
      ncm: sanitizeDigits(item.ncm),
      cfop: item.cfop || overrides.cfop || "5102",
      unidade: item.unidade || "UN",
      quantidade: Number(item.qtd || 0),
      valorUnitario: Number(item.precoUnitario || 0),
      valorTotal: Number((Number(item.qtd || 0) * Number(item.precoUnitario || 0)).toFixed(2))
    })),
    totais: {
      valorProdutos: Number(pedido?.valor || 0),
      valorNota: Number(pedido?.valor || 0)
    }
  };
}

async function emitirNfeDireta(payload) {
  const cfg = getSefazConfig();
  const missing = validateSefazConfig(cfg);
  if (missing.length) {
    return {
      ok: false,
      mode: "config_missing",
      error: `Configuracao NF-e incompleta: ${missing.join(", ")}`
    };
  }

  return {
    ok: false,
    mode: "not_implemented",
    ambiente: cfg.ambiente,
    message: "Transmissao direta para a SEFAZ ainda nao implementada neste endpoint.",
    nextSteps: [
      "Gerar XML NF-e conforme schema vigente",
      "Assinar XML com certificado A1",
      "Transmitir via webservice NF-e autorizacao",
      "Persistir recibo, protocolo e XML autorizado"
    ],
    preview: payload
  };
}

module.exports = {
  getSefazConfig,
  validateSefazConfig,
  buildNfePayloadFromPedido,
  emitirNfeDireta
};
