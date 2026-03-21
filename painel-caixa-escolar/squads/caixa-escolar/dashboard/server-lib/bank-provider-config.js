const ALLOWED_PROVIDERS = Object.freeze({
  asaas: {
    label: "Asaas",
    defaultBaseUrls: {
      sandbox: "https://sandbox.asaas.com/api/v3",
      producao: "https://api.asaas.com/v3"
    },
    envPrefix: "GDP_BANK_ASAAS",
    auth: {
      required: ["apiKey"],
      env: {
        apiKey: ["GDP_BANK_ASAAS_API_KEY", "ASAAS_API_KEY"],
        webhookSecret: ["GDP_BANK_ASAAS_WEBHOOK_SECRET", "ASAAS_WEBHOOK_SECRET"]
      }
    }
  },
  efi: {
    label: "Efi/Gerencianet",
    defaultBaseUrls: {
      sandbox: "https://pix-h.api.efipay.com.br",
      producao: "https://pix.api.efipay.com.br"
    },
    envPrefix: "GDP_BANK_EFI",
    auth: {
      required: ["clientId", "clientSecret"],
      env: {
        clientId: ["GDP_BANK_EFI_CLIENT_ID", "EFI_CLIENT_ID"],
        clientSecret: ["GDP_BANK_EFI_CLIENT_SECRET", "EFI_CLIENT_SECRET"]
      }
    }
  },
  inter: {
    label: "Banco Inter",
    defaultBaseUrls: {
      sandbox: "https://cdpj-sandbox.partners.bancointer.com.br",
      producao: "https://cdpj.partners.bancointer.com.br"
    },
    envPrefix: "GDP_BANK_INTER",
    auth: {
      required: ["clientId", "clientSecret"],
      env: {
        clientId: ["GDP_BANK_INTER_CLIENT_ID", "INTER_CLIENT_ID"],
        clientSecret: ["GDP_BANK_INTER_CLIENT_SECRET", "INTER_CLIENT_SECRET"]
      }
    }
  },
  bb: {
    label: "Banco do Brasil",
    defaultBaseUrls: {
      sandbox: "https://api.hm.bb.com.br",
      producao: "https://api.bb.com.br"
    },
    envPrefix: "GDP_BANK_BB",
    auth: {
      required: ["clientId", "clientSecret"],
      env: {
        clientId: ["GDP_BANK_BB_CLIENT_ID", "BB_CLIENT_ID"],
        clientSecret: ["GDP_BANK_BB_CLIENT_SECRET", "BB_CLIENT_SECRET"]
      }
    }
  }
});

function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAmbiente(value) {
  return String(value || "sandbox").trim().toLowerCase() === "producao" ? "producao" : "sandbox";
}

function pickEnvValue(keys = []) {
  for (const key of keys) {
    const value = process.env[key];
    if (String(value || "").trim()) return String(value).trim();
  }
  return "";
}

function maskSecret(value = "") {
  if (!value) return "";
  if (value.length <= 6) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function getProviderSpec(provider) {
  return ALLOWED_PROVIDERS[normalizeProvider(provider)] || null;
}

function getDefaultProvider() {
  const configured = normalizeProvider(process.env.GDP_BANK_PROVIDER || process.env.GDP_BANK_DEFAULT_PROVIDER);
  if (configured && ALLOWED_PROVIDERS[configured]) return configured;
  return "asaas";
}

function resolveProviderRuntimeConfig(provider, ambiente) {
  const providerKey = normalizeProvider(provider);
  const spec = getProviderSpec(providerKey);
  const envBaseUrl = pickEnvValue([`${spec?.envPrefix || "GDP_BANK"}_BASE_URL`]);
  const baseUrl = envBaseUrl || spec?.defaultBaseUrls?.[ambiente] || "";

  const authEnv = {};
  const auth = {};
  for (const [field, keys] of Object.entries(spec?.auth?.env || {})) {
    const value = pickEnvValue(keys);
    authEnv[field] = value ? keys.find((key) => String(process.env[key] || "").trim()) || "" : "";
    auth[field] = value;
  }

  return {
    provider: providerKey,
    spec,
    ambiente,
    baseUrl,
    source: {
      provider: spec ? "allowlisted" : "unsupported",
      baseUrl: envBaseUrl ? "env" : (spec ? "catalog" : "none"),
      auth: Object.fromEntries(Object.entries(authEnv).map(([field, key]) => [field, key || ""]))
    },
    auth
  };
}

function buildBankProviderDiagnostic(config = {}) {
  const requestedProvider = normalizeProvider(config.provider);
  const requestedAmbiente = normalizeAmbiente(config.ambiente);
  const provider = requestedProvider || getDefaultProvider();
  const spec = getProviderSpec(provider);
  const runtime = resolveProviderRuntimeConfig(provider, requestedAmbiente);
  const requestedValues = {
    baseUrl: String(config.baseUrl || "").trim(),
    apiKey: String(config.apiKey || "").trim(),
    clientId: String(config.clientId || "").trim(),
    clientSecret: String(config.clientSecret || "").trim(),
    webhookUrl: String(config.webhookUrl || "").trim(),
    webhookSecret: String(config.webhookSecret || "").trim(),
    carteira: String(config.carteira || "").trim(),
    contaId: String(config.contaId || "").trim()
  };

  const checks = [];
  const pushCheck = (label, ok, detail) => {
    checks.push({ label, ok: Boolean(ok), detail: detail || "" });
  };

  const providerAllowed = Boolean(spec);
  pushCheck(
    "Provider allowlisted",
    providerAllowed,
    providerAllowed ? `${provider} (${spec.label})` : requestedProvider || "Provider ausente"
  );

  if (!providerAllowed) {
    pushCheck("Server provider config", false, "Use one of: asaas, efi, inter, bb");
    return {
      provider: requestedProvider,
      providerLabel: requestedProvider || "undefined",
      ambiente: requestedAmbiente,
      baseUrl: "",
      ready: false,
      checks,
      nextSteps: [
        "Selecione um provider da allowlist",
        "Use Asaas primeiro se voce so precisa de um caminho de diagnostico seguro",
        "Remova URLs customizadas do formulario; o diagnostico agora resolve no servidor"
      ],
      probe: {
        attempted: false,
        reachable: false,
        reason: "Remote probing disabled for unsupported providers"
      },
      resolvedFrom: {
        provider: "request",
        baseUrl: "none",
        auth: "none"
      },
      ignoredRequestValues: Object.fromEntries(
        Object.entries(requestedValues).filter(([, value]) => Boolean(value))
      )
    };
  }

  const authRequired = spec.auth?.required || [];
  const authReady = authRequired.every((field) => Boolean(runtime.auth[field]));
  const baseUrlReady = Boolean(runtime.baseUrl);
  const hasServerProvider = Boolean(provider);

  pushCheck("Server provider config", hasServerProvider, `${spec.label} via ${runtime.source.baseUrl === "env" ? "env" : "catalogo do provider"}`);
  pushCheck("Base URL resolvida no servidor", baseUrlReady, runtime.baseUrl || "Base URL indisponivel");

  if (provider === "asaas") {
    pushCheck(
      "Asaas API key no servidor",
      authReady,
      authReady ? maskSecret(runtime.auth.apiKey) : "Configure GDP_BANK_ASAAS_API_KEY ou ASAAS_API_KEY"
    );
  } else {
    pushCheck(
      "Credenciais no servidor",
      authReady,
      authReady ? "Credenciais encontradas em variaveis de ambiente" : `Configure ${authRequired.map((field) => `${spec.envPrefix}_${field.toUpperCase()}`).join(" / ")}`
    );
  }

  if (requestedValues.baseUrl) {
    pushCheck("Base URL informada pelo cliente", true, "Ignorada para diagnostico; a origem e o servidor");
  }
  if (requestedValues.apiKey || requestedValues.clientId || requestedValues.clientSecret) {
    pushCheck("Credenciais informadas pelo cliente", true, "Ignoradas para diagnostico; a origem e o servidor");
  }

  if (requestedValues.contaId) {
    pushCheck("Conta vinculada", true, "Apenas informativa para o diagnostico");
  }
  if (requestedValues.webhookUrl || requestedValues.webhookSecret) {
    pushCheck("Webhook informado pelo cliente", true, "Ignorado no diagnostico do servidor");
  }
  if (requestedValues.carteira) {
    pushCheck("Carteira/convenio informado pelo cliente", true, "Apenas informativo");
  }

  const ready = provider === "asaas" && providerAllowed && baseUrlReady && authReady;
  const providerLabel = spec.label;
  const requestWasIgnored = Boolean(requestedValues.baseUrl || requestedValues.apiKey || requestedValues.clientId || requestedValues.clientSecret);

  return {
    provider,
    providerLabel,
    ambiente: requestedAmbiente,
    baseUrl: runtime.baseUrl,
    ready,
    checks,
    nextSteps: ready
      ? [
          `${providerLabel} esta resolvido por configuracao do servidor`,
          "Mantenha credenciais live em variaveis de ambiente e fora do formulario do navegador",
          "Use um teste controlado de integracao antes de habilitar trafego de producao"
        ]
      : provider === "asaas"
        ? [
            "Defina GDP_BANK_ASAAS_API_KEY ou ASAAS_API_KEY no servidor",
            "Mantenha o formulario do navegador vazio para valores sensiveis; ele nao e autoritativo",
            "Rode o diagnostico novamente apos publicar o ambiente"
          ]
        : [
            `Configure credenciais do ${providerLabel} no servidor`,
            "Nao confie em URLs ou segredos informados pelo navegador para readiness",
            "O caminho de readiness seguro esta pronto primeiro para Asaas"
          ],
    probe: {
      attempted: false,
      reachable: null,
      reason: "Remote probing disabled; diagnostic now uses allowlisted, server-resolved provider config"
    },
    resolvedFrom: {
      provider: runtime.source.provider,
      baseUrl: runtime.source.baseUrl,
      auth: runtime.source.auth
    },
    ignoredRequestValues: requestWasIgnored
      ? Object.fromEntries(
          Object.entries(requestedValues).filter(([, value]) => Boolean(value))
        )
      : {}
  };
}

export {
  ALLOWED_PROVIDERS,
  buildBankProviderDiagnostic,
  getDefaultProvider,
  getProviderSpec,
  normalizeAmbiente,
  normalizeProvider,
  resolveProviderRuntimeConfig
};
