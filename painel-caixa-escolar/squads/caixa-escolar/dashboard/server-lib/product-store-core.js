// ─── Módulo Compartilhado: Product Store Core ───
// Schema canônico único de produtos (SSoT) + normalização de campos + consolidação.
// Lógica PURA: sem window/fetch/DOM/localStorage — importável e testável (vitest).
//
// Referências: ADR-002 e docs/architecture/SCHEMA-product-store.md.
// A persistência (localStorage/Supabase) fica no wrapper de browser (product-store.js, Fase 3).
//
// Reusa normalizeProductName de radar-matcher-core para dedup consistente com o matcher.
import { normalizeProductName } from './radar-matcher-core.js';

// Bases de origem (precedência: mais rica → mais pobre)
export const SOURCE = {
  SSOT: 'gdp.produtos.v1',
  BANCO: 'caixaescolar.banco.v1',
  INTEL: 'intel.central-produtos.v2',
  ESTOQUE: 'gdp.estoque-intel.produtos.v1',
};

// Ordem de precedência no merge — o primeiro vence em conflito de escalar.
export const MERGE_ORDER = [SOURCE.SSOT, SOURCE.BANCO, SOURCE.INTEL, SOURCE.ESTOQUE];

// Campos de array que sofrem UNIÃO (nunca sobrescrita) no enriquecimento.
const ARRAY_FIELDS = ['custosFornecedor', 'concorrentes', 'propostas', 'historicoResultados'];

/**
 * Produto canônico com todos os campos do schema unificado (defaults seguros).
 * @returns {object}
 */
export function emptyProduct() {
  return {
    id: null,
    sku: '',
    descricao: '',
    ncm: '',
    unidade: 'UN',
    marca: '',
    grupo: '',
    custoBase: null,
    precoReferencia: null,
    margemAlvo: null,
    ultimaCotacao: null,
    custosFornecedor: [],
    concorrentes: [],
    propostas: [],
    historicoResultados: [],
    precoReferenciaHistorico: null,
    taxaConversao: null,
    produto_critico: false,
    embalagem_descricao: '',
    origem: '',
    classificacao_kraljic: '',
    ativo: true,
    fonte: '',
    criadoEm: null,
    atualizadoEm: null,
  };
}

function firstDefined(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Gera um ID estável quando ausente. `seed` torna determinístico em testes (sem Date/random).
 */
export function generateId(seed) {
  const s = String(seed == null ? '' : seed);
  return 'PROD-' + (s || 'x').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12).padEnd(4, '0');
}

/**
 * Mapeia um item de QUALQUER base para o schema canônico, resolvendo aliases.
 * NÃO inventa dados — só renomeia/reconcilia campos existentes.
 * @param {object} raw   item bruto da base de origem
 * @param {string} source  uma das SOURCE.*
 * @param {object} [opts]  { now?: string, idSeed?: string|number }
 */
export function toCanonical(raw, source, opts = {}) {
  const p = emptyProduct();
  const r = raw || {};
  const now = opts.now || null;

  p.descricao = String(firstDefined(r.descricao, r.nome, r.item) || '').trim();
  p.sku = String(firstDefined(r.sku) || '').trim();
  p.ncm = String(firstDefined(r.ncm) || '').trim();
  p.unidade = String(firstDefined(r.unidade, r.unidade_base) || 'UN').trim() || 'UN';
  p.marca = String(firstDefined(r.marca) || '').trim();
  p.grupo = String(firstDefined(r.grupo, r.categoria) || '').trim();

  const custo = firstDefined(r.custoBase, r.preco_custo);
  p.custoBase = (custo != null && custo !== '') ? Number(custo) : null;
  const ref = firstDefined(r.precoReferencia, r.preco_referencia);
  p.precoReferencia = (ref != null && ref !== '') ? Number(ref) : null;
  const margem = firstDefined(r.margemAlvo, r.margemPadrao);
  p.margemAlvo = (margem != null && margem !== '') ? Number(margem) : null;
  p.ultimaCotacao = firstDefined(r.ultimaCotacao) || null;

  ARRAY_FIELDS.forEach((f) => { p[f] = Array.isArray(r[f]) ? r[f] : []; });
  p.precoReferenciaHistorico = firstDefined(r.precoReferenciaHistorico) ?? null;
  p.taxaConversao = firstDefined(r.taxaConversao) ?? null;
  p.produto_critico = r.produto_critico === true;
  p.embalagem_descricao = String(firstDefined(r.embalagem_descricao) || '').trim();
  p.origem = String(firstDefined(r.origem) || '').trim();
  p.classificacao_kraljic = String(firstDefined(r.classificacao_kraljic) || '').trim();
  p.ativo = r.ativo !== false;

  p.fonte = String(firstDefined(r.fonte) || ('migracao_' + source)).trim();
  p.criadoEm = firstDefined(r.criadoEm) || now;
  p.atualizadoEm = firstDefined(r.atualizadoEm) || now;

  // id: preserva se válido, senão gera a partir de sku/descricao (resolve os 28 ids nulos)
  p.id = firstDefined(r.id) || generateId(opts.idSeed != null ? opts.idSeed : (p.sku || p.descricao));
  return p;
}

/**
 * Chave de deduplicação: sku (estável) OU nome normalizado (fallback).
 * @returns {string} '' se não houver chave possível
 */
export function dedupeKey(canonical) {
  if (canonical.sku) return 'sku:' + canonical.sku.toLowerCase();
  const norm = normalizeProductName(canonical.descricao);
  return norm ? 'name:' + norm : '';
}

// União de arrays por igualdade estrutural (JSON), preservando ordem do primeiro.
function unionArrays(a = [], b = []) {
  const seen = new Set(a.map((x) => JSON.stringify(x)));
  const out = a.slice();
  for (const x of b) {
    const k = JSON.stringify(x);
    if (!seen.has(k)) { seen.add(k); out.push(x); }
  }
  return out;
}

/**
 * Enriquece `base` com dados de `extra` SEM destruir o que já existe.
 * Escalares: só preenchem campos vazios da base (base vence conflito).
 * Arrays: união. Retorna a base mutada (e também a devolve).
 */
export function enrich(base, extra) {
  for (const key of Object.keys(base)) {
    if (ARRAY_FIELDS.includes(key)) {
      base[key] = unionArrays(base[key], extra[key]);
      continue;
    }
    const empty = base[key] === null || base[key] === '' || base[key] === undefined;
    const extraHas = extra[key] !== null && extra[key] !== '' && extra[key] !== undefined;
    // não rebaixar flags/booleans nem sobrescrever valores já presentes
    if (empty && extraHas) base[key] = extra[key];
  }
  return base;
}

/**
 * Consolida várias bases numa única coleção canônica (SSoT).
 * Lógica pura — recebe os arrays já carregados, devolve { itens, stats }.
 *
 * @param {Object<string, Array>} bases  mapa SOURCE → array de itens brutos
 * @param {object} [opts]  { now?: string }
 * @returns {{ itens: object[], stats: object }}
 */
export function mergeIntoSSoT(bases = {}, opts = {}) {
  const now = opts.now || null;
  const products = [];        // canônicos únicos
  const bySku = new Map();    // sku:<x>  → produto
  const byName = new Map();   // name:<x> → produto
  const stats = { porFonte: {}, novos: 0, enriquecidos: 0, semChave: 0 };

  // Localiza um produto já indexado que case por SKU OU por nome normalizado.
  // Isso garante que um item COM sku e outro SEM sku mas de mesmo nome sejam mesclados.
  function findExisting(canon) {
    const skuKey = canon.sku ? 'sku:' + canon.sku.toLowerCase() : '';
    if (skuKey && bySku.has(skuKey)) return bySku.get(skuKey);
    const norm = normalizeProductName(canon.descricao);
    const nameKey = norm ? 'name:' + norm : '';
    if (nameKey && byName.has(nameKey)) return byName.get(nameKey);
    return null;
  }

  function indexProduct(p) {
    if (p.sku) bySku.set('sku:' + p.sku.toLowerCase(), p);
    const norm = normalizeProductName(p.descricao);
    if (norm) byName.set('name:' + norm, p);
  }

  for (const source of MERGE_ORDER) {
    const arr = Array.isArray(bases[source]) ? bases[source] : [];
    stats.porFonte[source] = arr.length;
    arr.forEach((raw, i) => {
      const canon = toCanonical(raw, source, { now, idSeed: (raw && (raw.sku || raw.id)) || source + i });
      if (!dedupeKey(canon)) { stats.semChave++; return; }
      const existing = findExisting(canon);
      if (existing) {
        enrich(existing, canon);
        // se o existente não tinha sku e o novo tem, passa a indexar por sku também
        if (!existing.sku && canon.sku) { existing.sku = canon.sku; }
        indexProduct(existing);
        stats.enriquecidos++;
      } else {
        products.push(canon);
        indexProduct(canon);
        stats.novos++;
      }
    });
  }

  return { itens: products, stats };
}

/**
 * Valida a coleção consolidada (gate pós-migração — ADR-002 §5).
 * @returns {{ ok: boolean, errors: string[], counts: object }}
 */
export function validateSSoT(itens, opts = {}) {
  const minCount = opts.minCount != null ? opts.minCount : 270;
  const errors = [];
  const list = Array.isArray(itens) ? itens : [];

  const nullId = list.filter((p) => !p.id).length;
  const noDesc = list.filter((p) => !p.descricao || !String(p.descricao).trim()).length;
  const skus = list.map((p) => p.sku).filter(Boolean);
  const dupSku = skus.length - new Set(skus.map((s) => s.toLowerCase())).size;

  if (list.length < minCount) errors.push(`count ${list.length} < mínimo ${minCount}`);
  if (nullId > 0) errors.push(`${nullId} produto(s) com id nulo`);
  if (dupSku > 0) errors.push(`${dupSku} sku(s) duplicado(s)`);
  if (noDesc > 0) errors.push(`${noDesc} produto(s) sem descrição`);

  return { ok: errors.length === 0, errors, counts: { total: list.length, nullId, dupSku, noDesc } };
}
