import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import vm from 'node:vm';

/**
 * PROVA DA REGRESSÃO (não é réplica — carrega as FUNÇÕES REAIS de gdp-core.js)
 * ============================================================================
 * Hipótese de causa raiz (analyst 2026-07-01):
 *   saveNotasFiscais(changedId) grava a LISTA INTEIRA da RAM no localStorage
 *   (gdp-core.js:2110-2114), mesmo chamado por-id. O changedId só filtra o push
 *   ao Supabase, NUNCA o cache local. Consequência: se OUTRA nota da RAM está
 *   com estado stale (rebaixada por um fluxo concorrente), esse estado stale é
 *   REGRAVADO por cima da prova durável no disco. Depois reloadFromLocalSilent()
 *   reidrata a RAM inteira a partir desse disco → a nota autorizada regride a
 *   pendente e a prova (chave+protocolo) some.
 *
 * Este teste extrai as funções REAIS do arquivo e as executa num sandbox com
 * localStorage mockado. Se a hipótese estiver certa, o teste FALHA hoje.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const coreSrc = readFileSync(
  resolve(__dirname, '../squads/caixa-escolar/dashboard/js/gdp-core.js'),
  'utf8'
);

// --- Extrai o corpo EXATO de uma função de nível superior do arquivo real ---
function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`função ${name} não encontrada`);
  // varre chaves balanceadas a partir do primeiro '{'
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(start, i);
}

function buildSandbox() {
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const sandbox = {
    localStorage,
    console: { warn() {}, error() {}, log() {} },
    Date,
    JSON,
    Array,
    // globals que as funções tocam — mockados como no boot pós-load
    window: {},
    _lastLocalSave: {},
    _lastLocalSaveOrigin: {},
    _gdpBootInProgress: false,
    _pendingBootSaves: { add() {}, size: 0 },
    gdpLog() {},
    gdpWarn() {},
    cloudSave: () => Promise.resolve(),
    schedulCloudSync() {},
    _pushNetworkSave() {}, // isola: só nos importa o cache LOCAL
    _LS_TO_TABLE: {},
    INVOICES_KEY: 'gdp.notas-fiscais.v1',
    notasFiscais: [],
    // gdpApi por-id: registra o que seria enviado ao Supabase (não afeta o disco local)
    _supabaseSaves: [],
  };
  sandbox.window.gdpApi = {
    notas_fiscais: {
      save: (nf) => { sandbox._supabaseSaves.push(JSON.parse(JSON.stringify(nf))); return Promise.resolve(); },
    },
  };
  sandbox.window._nfOpHasInFlight = () => false;

  const code = [
    'function unwrapData(raw){ return Array.isArray(raw) ? raw : (raw && raw.items ? raw.items : []); }',
    extractFn(coreSrc, 'saveWrappedArray'),
    extractFn(coreSrc, '_hydrateWithMemFallback'),
    extractFn(coreSrc, 'reloadFromLocalSilent'),
    extractFn(coreSrc, '_nfListaLeve'),
    extractFn(coreSrc, 'saveNotasFiscais'),
    // stubs para variáveis referenciadas por reloadFromLocalSilent que não testamos
    'var contratos=[],pedidos=[],contasReceber=[],contasPagar=[],contratosExcluidos=[];',
    'var CONTRACTS_KEY="c",ORDERS_KEY="o",RECEIVABLES_KEY="r",PAYABLES_KEY="p",CONTRACTS_DELETED_KEY="cd";',
    'function applyDeletedContractsFilter(x){return x||[];}',
    // fallbacks: _ultraLightNf e _stripNfHeavy são usados só no caminho de quota — não deve rodar
    'var _stripNfHeavy=function(nf){return nf;};',
    'var _ultraLightNf=function(nf){return nf;};',
    // expõe pro teste
    'this.__api={ saveNotasFiscais, reloadFromLocalSilent, get notas(){return notasFiscais;}, set notas(v){notasFiscais=v;} };',
  ].join('\n\n');

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox;
}

const CHAVE = '31' + '0'.repeat(42);      // 44 dígitos
const PROT = '135250000012345';

function notaAutorizada(id, numero) {
  return {
    id, numero, status: 'autorizada', valor: 100,
    tipoNota: 'nfe_real',
    sefaz: { status: 'autorizada', cStat: '100', chaveAcesso: CHAVE, protocolo: PROT },
    updated_at: '2026-07-01T10:00:00.000Z',
  };
}
function notaPendente(id, numero) {
  return {
    id, numero, status: 'em_preparo', valor: 100, tipoNota: 'nfe_real',
    sefaz: null, updated_at: '2026-07-01T09:00:00.000Z',
  };
}

describe('REGRESSÃO: NF autorizada regride a pendente e perde a prova', () => {
  let sb;
  beforeEach(() => { sb = buildSandbox(); });

  it('save por-id da nota B NÃO deve rebaixar a prova durável da nota A no disco', () => {
    // Cenário: A acabou de ser autorizada (prova na RAM). Um fluxo concorrente
    // (ex.: retransmissão/echo) deixou B stale como em_preparo na RAM. O usuário
    // salva SÓ a nota B (changedId = B). O save por-id NÃO deveria tocar a nota A.
    const A = notaAutorizada('NF-A', '1001');
    const B = notaPendente('NF-B', '1002');
    sb.__api.notas = [A, B];

    // grava o estado bom no disco primeiro (A autorizada)
    sb.__api.saveNotasFiscais('NF-A');

    // agora um save por-id de B (B continua pendente — legítimo)
    sb.__api.saveNotasFiscais('NF-B');

    // reidrata a RAM a partir do disco (o que o realtime/scheduleRender faz)
    sb.__api.reloadFromLocalSilent();

    const aDepois = sb.__api.notas.find((n) => n.id === 'NF-A');
    // A prova durável de A DEVE sobreviver a um save por-id de OUTRA nota:
    expect(aDepois, 'nota A sumiu do disco').toBeTruthy();
    expect(aDepois.status, 'nota A regrediu de autorizada').toBe('autorizada');
    expect(String(aDepois.chaveAcesso || (aDepois.sefaz && aDepois.sefaz.chaveAcesso) || '').length)
      .toBe(44);
  });

  it('a nota autorizada A não pode regredir quando a RAM tem uma cópia stale de A e salva-se B', () => {
    // Este é o vetor exato do bug: A está autorizada no disco, mas a RAM ganhou
    // uma cópia STALE de A (autorizada→em_preparo por um echo/reload parcial).
    // Um saveNotasFiscais('NF-B') grava a LISTA INTEIRA da RAM → carimba o A stale
    // por cima do A bom no disco. reload traz A pendente. Prova some.
    const Abom = notaAutorizada('NF-A', '1001');
    sb.__api.notas = [Abom, notaPendente('NF-B', '1002')];
    sb.__api.saveNotasFiscais('NF-A'); // disco fica com A autorizada

    // RAM regride A para stale (simula echo antigo aplicado à RAM antes do reload)
    const Astale = notaPendente('NF-A', '1001');
    sb.__api.notas = [Astale, notaPendente('NF-B', '1002')];

    // usuário salva SÓ B — não deveria afetar A no disco
    sb.__api.saveNotasFiscais('NF-B');

    sb.__api.reloadFromLocalSilent();
    const aFinal = sb.__api.notas.find((n) => n.id === 'NF-A');
    expect(aFinal.status, 'save por-id de B carimbou A stale por cima da prova no disco')
      .toBe('autorizada');
  });
});
