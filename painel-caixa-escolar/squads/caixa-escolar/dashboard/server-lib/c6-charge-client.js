// Cliente de cobrança do C6 Bank — STUB.
//
// O C6 oferece API de cobrança (boleto + Pix) e consulta de DDA, mas o acesso à API exige
// homologação/liberação comercial por CNPJ (ver ADR-epic20, risco R6). Enquanto as credenciais
// reais não são liberadas, este client mantém a MESMA assinatura de inter/asaas-charge-client
// (createCharge/syncCharge) e falha de forma explícita — sem bloquear o provider Inter.
//
// Quando a API for liberada: implementar OAuth + mTLS análogo ao inter-charge-client.js,
// retornando o mesmo formato `normalized`.

import { resolveProviderRuntimeConfig } from "./bank-provider-config.js";

function assertC6Configured({ provider = "c6", ambiente = "sandbox" } = {}) {
  const runtime = resolveProviderRuntimeConfig(provider, ambiente);
  const ready = runtime.provider === "c6"
    && runtime.auth.clientId && runtime.auth.clientSecret
    && runtime.auth.certPem && runtime.auth.keyPem;
  if (!ready) {
    throw new Error(
      "C6 ainda nao habilitado: aguardando liberacao/homologacao da API e credenciais "
      + "(GDP_BANK_C6_CLIENT_ID / _CLIENT_SECRET / _CERT_PEM / _KEY_PEM). Use o provider 'inter' para emissao real."
    );
  }
  return runtime;
}

async function createC6Charge(params = {}) {
  // Mantém o contrato; quando credenciais existirem, implementar a chamada real aqui.
  assertC6Configured(params);
  throw new Error("Emissao C6 nao implementada: API liberada mas client real pendente. Ver ADR-epic20.");
}

async function syncC6Charge(params = {}) {
  assertC6Configured(params);
  throw new Error("Sincronizacao C6 nao implementada: API liberada mas client real pendente. Ver ADR-epic20.");
}

export { createC6Charge, syncC6Charge };
