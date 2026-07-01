import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'node:vm';

/**
 * PROVA DA REGRESSÃO — Exclusão de conta a receber não propaga entre navegadores.
 * ============================================================================
 * Sintoma do usuário: excluiu uma conta a receber (com boleto) → não sumiu nos
 * outros navegadores; reapareceu no navegador de origem e sumiu de novo (flicker).
 * "Já tinha sido resolvido: online, tudo igual em qualquer máquina."
 *
 * Hipótese (analyst 2026-07-01): a exclusão é um SOFT-DELETE (UPDATE deleted_at).
 * Mas os guards anti-regressão do realtime (handleEntityChange) só olham PROVA de
 * boleto (_contaTemProva), NÃO olham deleted_at. Uma conta com boleto real tem
 * prova; o UPDATE de soft-delete chega com a conta AINDA carregando o boleto
 * (prova). No guard de UPDATE, se o timestamp não for estritamente maior, o
 * soft-delete é IGNORADO nos outros navegadores → não some. Este teste carrega o
 * handleEntityChange REAL e reproduz o cenário multi-navegador.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const rtSrc = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/gdp-realtime.js'),
  'utf8'
);

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`função ${name} não encontrada`);
  let p = src.indexOf('(', start);
  let pdepth = 0;
  for (; p < src.length; p++) {
    if (src[p] === '(') pdepth++;
    else if (src[p] === ')') { pdepth--; if (pdepth === 0) { p++; break; } }
  }
  let i = src.indexOf('{', p);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

// Simula UM navegador: sandbox isolado com seu próprio localStorage.
function buildBrowser() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const sandbox = {
    localStorage,
    console: { warn() {}, error() {}, log() {} },
    Date, JSON, Array, String, Object, RegExp,
    window: {},
    document: { getElementById: () => null },
    gdpLog() {}, gdpWarn() {},
    getLastLocalSave: () => 0, // sem dirty window (passaram-se >5s) — caminho do "minutos depois"
  };
  const code = [
    "var TABLE_TO_ENTITY = { contas_receber: { lsKey: 'gdp.contas-receber.v1', wrapped: true } };",
    extractFn(rtSrc, 'readLocalItems'),
    extractFn(rtSrc, 'stripSoftDeleted'),
    extractFn(rtSrc, 'writeLocalItems'),
    extractFn(rtSrc, '_nfTemProva'),
    extractFn(rtSrc, '_contaTemProva'),
    extractFn(rtSrc, '_podeSobrescreverRegistro'),
    extractFn(rtSrc, '_tsRobusto'),
    extractFn(rtSrc, '_temProvaDuravelRT'),
    extractFn(rtSrc, 'handleEntityChange'),
    'this.__api = { handleEntityChange, readLocalItems, writeLocalItems };',
  ].join('\n\n');
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  // seed: uma conta a receber com boleto real (prova durável)
  return {
    sb: sandbox,
    seed(items) {
      sandbox.localStorage.setItem(
        'gdp.contas-receber.v1',
        JSON.stringify({ _v: 1, updatedAt: '2026-07-01T00:00:00Z', items })
      );
    },
    contas() {
      return sandbox.__api.readLocalItems('contas_receber');
    },
    apply(type, record, oldRecord) {
      return sandbox.__api.handleEntityChange('contas_receber', type, record, oldRecord);
    },
  };
}

const contaComBoleto = (over = {}) => ({
  id: 'CR-20260701-1618',
  status: 'aberto',
  valor: 500,
  cobranca: { providerChargeId: 'INTER-abc123', linhaDigitavel: '00190...' },
  updated_at: '2026-07-01T10:00:00.000Z',
  ...over,
});

describe('REGRESSÃO: exclusão de conta a receber com boleto não propaga entre navegadores', () => {
  it('SINTOMA 1: soft-delete (UPDATE deleted_at) DEVE sumir a conta no OUTRO navegador', () => {
    const outro = buildBrowser();
    outro.seed([contaComBoleto()]);
    expect(outro.contas().length).toBe(1);

    // Navegador A excluiu → propaga UPDATE com deleted_at setado. O registro ainda
    // carrega o boleto (prova), pois soft-delete não apaga os campos.
    const softDeleted = contaComBoleto({
      deleted_at: '2026-07-01T10:05:00.000Z',
      updated_at: '2026-07-01T10:05:00.000Z',
    });
    outro.apply('UPDATE', softDeleted, null);

    // A conta soft-deletada NÃO pode continuar visível no outro navegador:
    const visiveis = outro.contas().filter((c) => !(c.deleted_at || c.deletedAt));
    expect(
      visiveis.find((c) => c.id === 'CR-20260701-1618'),
      'a conta excluída continuou visível no outro navegador (soft-delete não propagou)'
    ).toBeFalsy();
  });

  it('SINTOMA 1b: soft-delete com MESMO updated_at (eco/empate) — ainda deve sumir', () => {
    // Caso real: o UPDATE de soft-delete chega com updated_at que NÃO é estritamente
    // maior que o local (relógios iguais / campo derivado). O guard exige rTs > lTs.
    const outro = buildBrowser();
    outro.seed([contaComBoleto({ updated_at: '2026-07-01T10:05:00.000Z' })]);
    const softDeleted = contaComBoleto({
      deleted_at: '2026-07-01T10:05:00.000Z',
      updated_at: '2026-07-01T10:05:00.000Z', // EMPATE com o local
    });
    outro.apply('UPDATE', softDeleted, null);
    const visiveis = outro.contas().filter((c) => !(c.deleted_at || c.deletedAt));
    expect(
      visiveis.find((c) => c.id === 'CR-20260701-1618'),
      'empate de timestamp fez o soft-delete ser ignorado → conta não some no outro navegador'
    ).toBeFalsy();
  });
});
