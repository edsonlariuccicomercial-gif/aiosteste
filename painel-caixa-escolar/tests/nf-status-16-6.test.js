import { describe, it, expect } from 'vitest';

/**
 * Story 16.6 — Status "autorizada" só com Protocolo + Chave reais da SEFAZ
 *
 * Valida o invariante de determinação de status pós-transmissão, replicando a
 * lógica pura de transmitirHomologacaoNota (gdp-notas-fiscais.js L1336-1340),
 * que depende de DOM no browser.
 *
 * Invariante: "autorizada" SOMENTE se cStat ∈ {100,150} E prot E chNFe preenchidos.
 */

// --- réplica da lógica de status (Story 16.6) ---
function determinarStatus(parsed) {
  const _cStat = String(parsed?.cStat || "");
  const _temProvaSefaz = !!(parsed?.prot) && !!(parsed?.chNFe);
  const _cStatSucesso = (_cStat === "100" || _cStat === "150");
  const _isAutorizado = _temProvaSefaz && _cStatSucesso;
  let _sefazStatus;
  if (_isAutorizado) {
    _sefazStatus = "autorizada";
  } else if (_cStat && !_cStatSucesso) {
    _sefazStatus = "rejeitada";
  } else {
    _sefazStatus = "transmissao_realizada";
  }
  return { status: _sefazStatus, isAutorizado: _isAutorizado };
}

// --- réplica de canDeleteNotaFiscal (gdp-notas-fiscais.js L249) ---
function canDeleteNotaFiscal(nf) {
  if (!nf) return false;
  const isReal = (nf.tipoNota || "manual_externa") === "nfe_real";
  return !(isReal && ["autorizada", "cancelada", "cancelamento_solicitado"].includes(String(nf.status || "")));
}

describe('Story 16.6 — autorizada exige prova SEFAZ (cStat + prot + chNFe)', () => {
  const chaveValida = "31".padEnd(44, "0");
  const protValido = "135250000012345";

  it('AC1: cStat 100 SEM protocolo/chave → NÃO autorizada (transmissao_realizada)', () => {
    const r = determinarStatus({ cStat: "100", prot: "", chNFe: "" });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("transmissao_realizada");
  });

  it('AC1: cStat 100 com chave mas SEM protocolo → NÃO autorizada', () => {
    const r = determinarStatus({ cStat: "100", prot: "", chNFe: chaveValida });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("transmissao_realizada");
  });

  it('AC2: cStat 100 COM protocolo E chave → autorizada', () => {
    const r = determinarStatus({ cStat: "100", prot: protValido, chNFe: chaveValida });
    expect(r.isAutorizado).toBe(true);
    expect(r.status).toBe("autorizada");
  });

  it('AC3: cStat de rejeição (539 duplicidade) → rejeitada', () => {
    const r = determinarStatus({ cStat: "539", prot: "", chNFe: "" });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("rejeitada");
  });

  it('AC3: cStat de rejeição (110) → rejeitada mesmo com prot/chave residuais', () => {
    const r = determinarStatus({ cStat: "110", prot: protValido, chNFe: chaveValida });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("rejeitada");
  });

  it('AC4: cStat 150 (fora de prazo) COM prot+chave → autorizada', () => {
    const r = determinarStatus({ cStat: "150", prot: protValido, chNFe: chaveValida });
    expect(r.isAutorizado).toBe(true);
    expect(r.status).toBe("autorizada");
  });

  it('AC4: cStat 150 SEM prot/chave → NÃO autorizada', () => {
    const r = determinarStatus({ cStat: "150", prot: "", chNFe: "" });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("transmissao_realizada");
  });

  it('sem cStat (resposta vazia) → transmissao_realizada (não autorizada, não rejeitada)', () => {
    const r = determinarStatus({ cStat: "", prot: "", chNFe: "" });
    expect(r.isAutorizado).toBe(false);
    expect(r.status).toBe("transmissao_realizada");
  });
});

describe('Story 16.6 — exclusão (AC5/AC6)', () => {
  it('AC5: nota não-autorizada (transmissao_realizada) é EXCLUÍVEL', () => {
    const nf = { tipoNota: "nfe_real", status: "transmissao_realizada" };
    expect(canDeleteNotaFiscal(nf)).toBe(true);
  });

  it('AC5: nota rejeitada é EXCLUÍVEL', () => {
    const nf = { tipoNota: "nfe_real", status: "rejeitada" };
    expect(canDeleteNotaFiscal(nf)).toBe(true);
  });

  it('AC6: nota realmente autorizada continua BLOQUEADA para exclusão', () => {
    const nf = { tipoNota: "nfe_real", status: "autorizada" };
    expect(canDeleteNotaFiscal(nf)).toBe(false);
  });

  it('AC6: fantasma do bug antigo (autorizada inválida) seguiria bloqueado — por isso a correção é na ORIGEM', () => {
    // Demonstra por que corrigir só a exclusão não bastaria: uma vez gravada
    // "autorizada", fica bloqueada. A Story 16.6 impede que nasça autorizada.
    const fantasma = { tipoNota: "nfe_real", status: "autorizada" };
    expect(canDeleteNotaFiscal(fantasma)).toBe(false);
    // Com a correção 16.6, esse registro nasceria "transmissao_realizada" → excluível:
    const corrigido = determinarStatus({ cStat: "100", prot: "", chNFe: "" });
    expect(canDeleteNotaFiscal({ tipoNota: "nfe_real", status: corrigido.status })).toBe(true);
  });
});
