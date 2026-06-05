import { describe, it, expect } from 'vitest';
import {
  normalizeProductName,
  tokenSimilarity,
  tokenCoverage,
  matchRegexRules,
  matchProduct,
  parseBrMoney,
  extractReferencePrice,
  extractReferenceBrands,
  normalizeBrand,
  isBrandCompliant,
  MATCH_STATUS,
  MATCH_LAYER,
  SYNONYMS,
  TOKEN_THRESHOLD,
} from '../squads/caixa-escolar/dashboard/server-lib/radar-matcher-core.js';

describe('normalizeProductName', () => {
  it('lowercases, strips accents and noise words', () => {
    expect(normalizeProductName('ARROZ Tipo 1 Branco')).toBe('arroz branco');
  });

  it('removes brand names', () => {
    expect(normalizeProductName('Arroz Camil 5kg')).toBe('arroz 5kg');
  });

  it('keeps weight/volume tokens but drops standalone numbers', () => {
    // "5" sozinho é descartado; "5kg" é mantido. "caixa" não é ruído → permanece.
    expect(normalizeProductName('Feijao 5 kg')).toBe('feijao kg');
    expect(normalizeProductName('Leite 1l 900')).toBe('leite 1l');
  });

  it('applies spelling synonyms to a canonical form', () => {
    expect(normalizeProductName('Mucarela')).toBe('mussarela');
    expect(normalizeProductName('Muzzarela fatiada')).toBe('mussarela fatiada');
    expect(normalizeProductName('Feijao carioquinha')).toBe('feijao carioca');
  });

  it('returns empty string when only noise/brand remains', () => {
    expect(normalizeProductName('tipo de marca')).toBe('');
    expect(normalizeProductName('')).toBe('');
    expect(normalizeProductName(null)).toBe('');
  });

  it('has no identity synonyms (key never equals value)', () => {
    Object.entries(SYNONYMS).forEach(([k, v]) => {
      expect(k).not.toBe(v);
    });
  });
});

describe('tokenSimilarity', () => {
  it('returns 1 for identical normalized names', () => {
    expect(tokenSimilarity('Arroz Branco', 'arroz branco')).toBe(1);
  });

  it('ignores brand differences (brands are stripped)', () => {
    expect(tokenSimilarity('Arroz Camil tipo 1', 'Arroz Urbano tipo 1')).toBe(1);
  });

  it('returns 0 for completely different products', () => {
    expect(tokenSimilarity('arroz integral', 'detergente neutro')).toBe(0);
  });

  it('returns a partial score for partial overlap', () => {
    const sc = tokenSimilarity('feijao carioca premium', 'feijao preto premium');
    expect(sc).toBeGreaterThan(0);
    expect(sc).toBeLessThan(1);
  });

  it('returns 0 when either side has no comparable tokens', () => {
    expect(tokenSimilarity('de da do', 'arroz')).toBe(0);
  });
});

describe('parseBrMoney', () => {
  it('parses thousands + decimals', () => {
    expect(parseBrMoney('3.800,00')).toBe(3800);
    expect(parseBrMoney('1.234,56')).toBeCloseTo(1234.56);
  });
  it('parses decimals without thousands', () => {
    expect(parseBrMoney('121,25')).toBeCloseTo(121.25);
    expect(parseBrMoney('96,23')).toBeCloseTo(96.23);
    expect(parseBrMoney('50')).toBe(50);
  });
  it('parses integer thousands without decimals', () => {
    expect(parseBrMoney('1.234')).toBe(1234);
  });
  it('returns null for garbage/empty', () => {
    expect(parseBrMoney('')).toBeNull();
    expect(parseBrMoney(null)).toBeNull();
    expect(parseBrMoney('abc')).toBeNull();
  });
});

describe('extractReferencePrice', () => {
  it('extracts "Preço de Referência: R$ 50,00"', () => {
    const r = extractReferencePrice('Recarga de extintores. Preço de Referência: R$ 50,00');
    expect(r).toBeTruthy();
    expect(r.valor).toBe(50);
  });

  it('extracts "Valor de referência: R$ 3.800,00"', () => {
    const r = extractReferencePrice('Fogão industrial. Valor de referência: R$ 3.800,00 Prazo: 90 dias');
    expect(r.valor).toBe(3800);
  });

  it('extracts "Valor de referência: R$121,25" (no space after R$)', () => {
    const r = extractReferencePrice('Canela po. Valor de referência: R$121,25.');
    expect(r.valor).toBeCloseTo(121.25);
  });

  it('extracts "PREÇOS DE REFERENCIA R$ 96,23" (uppercase, no colon)', () => {
    const r = extractReferencePrice('Serviços. PREÇOS DE REFERENCIA R$ 96,23 (noventa e seis reais)');
    expect(r.valor).toBeCloseTo(96.23);
  });

  it('the Vassoura example yields R$ 20,00', () => {
    const desc = 'Vassoura multiuso nylon, cabo de plastico. marcas: Condor, Avanço, Bettanin (PREÇO DE REFERÊNCIA: R$20,00)';
    expect(extractReferencePrice(desc).valor).toBe(20);
  });

  it('does NOT treat "prazo máximo de 2 horas" as a price', () => {
    const r = extractReferencePrice('entrega no prazo máximo de 2 (duas) horas após a solicitação');
    expect(r).toBeNull();
  });

  it('returns null when there is no price at all', () => {
    expect(extractReferencePrice('Conforme especificação do edital, sem valor.')).toBeNull();
  });

  it('falls back to a single isolated R$ value', () => {
    const r = extractReferencePrice('Produto X custa R$ 12,50 conforme tabela.');
    expect(r.valor).toBeCloseTo(12.5);
  });

  it('does not guess when multiple unrelated R$ values exist without keyword', () => {
    const r = extractReferencePrice('Multa de R$ 100,00 e taxa de R$ 30,00 aplicáveis.');
    expect(r).toBeNull();
  });
});

describe('extractReferenceBrands', () => {
  it('parses "Marcas: Pachá, Anchieta ou Pereira"', () => {
    const r = extractReferenceBrands('Amendoim torrado. Marcas: Pachá, Anchieta ou Pereira.');
    expect(r).toBeTruthy();
    expect(r.marcas).toEqual(['Pachá', 'Anchieta', 'Pereira']);
  });

  it('parses singular "Marca: Yoki ou Pachá"', () => {
    expect(extractReferenceBrands('Milho. Marca: Yoki ou Pachá.').marcas).toEqual(['Yoki', 'Pachá']);
  });

  it('keeps multi-word brands ("Klin Mega")', () => {
    expect(extractReferenceBrands('Água sanitária. Marcas: Rajjalim, Triex ou Klin Mega.').marcas)
      .toEqual(['Rajjalim', 'Triex', 'Klin Mega']);
  });

  it('parses the Vassoura brands', () => {
    const desc = 'Vassoura nylon. marcas: Condor, Avanço, Bettanin (PREÇO DE REFERÊNCIA: R$20,00)';
    expect(extractReferenceBrands(desc).marcas).toEqual(['Condor', 'Avanço', 'Bettanin']);
  });

  it('returns null when no brand list present', () => {
    expect(extractReferenceBrands('Conforme especificação técnica do edital.')).toBeNull();
  });
});

describe('isBrandCompliant', () => {
  const exigidas = ['Condor', 'Avanço', 'Bettanin'];
  it('accepts an exact required brand', () => {
    expect(isBrandCompliant('Condor', exigidas)).toBe(true);
  });
  it('accepts case/accent-insensitive match', () => {
    expect(isBrandCompliant('AVANCO', exigidas)).toBe(true);
  });
  it('accepts partial containment ("Bettanin Profissional")', () => {
    expect(isBrandCompliant('Bettanin Profissional', exigidas)).toBe(true);
  });
  it('rejects a brand outside the list (would inabilitate)', () => {
    expect(isBrandCompliant('Tupy', exigidas)).toBe(false);
  });
  it('rejects empty brand when a list is required', () => {
    expect(isBrandCompliant('', exigidas)).toBe(false);
  });
  it('passes when there is no brand requirement', () => {
    expect(isBrandCompliant('Qualquer', [])).toBe(true);
    expect(isBrandCompliant('', null)).toBe(true);
  });
});

describe('tokenCoverage', () => {
  it('returns 1 when the full item covers all of the short ref name', () => {
    // banco curto coberto pela descrição completa do estado
    const ref = 'Vassoura nylon';
    const full = 'Vassoura multiuso nylon cabo de plastico fixado taco corpo cerdas macias sinteticas';
    expect(tokenCoverage(ref, full)).toBe(1);
  });

  it('is asymmetric — extra descriptive tokens on the item do not lower coverage', () => {
    expect(tokenCoverage('arroz branco', 'arroz branco tipo 1 longo fino premium importado')).toBe(1);
  });

  it('returns partial coverage when ref has tokens the item lacks', () => {
    const c = tokenCoverage('vassoura piacava grande', 'vassoura nylon pequena');
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(1);
  });

  it('returns 0 when nothing overlaps', () => {
    expect(tokenCoverage('detergente neutro', 'arroz integral')).toBe(0);
  });
});

describe('matchRegexRules', () => {
  const produtos = [
    { id: 'P1', item: 'Arroz tipo 1 pacote 5kg' },
    { id: 'P2', item: 'Detergente liquido neutro 500ml' },
    { id: 'P3', item: 'Caderno espiral 96 folhas' },
  ];

  it('matches a food item to its product and category', () => {
    const r = matchRegexRules('Arroz tipo 1', produtos);
    expect(r).toBeTruthy();
    expect(r.categoria).toBe('Alimentos');
    expect(r.produto_id).toBe('P1');
  });

  it('matches a cleaning item category', () => {
    const r = matchRegexRules('Detergente liquido', produtos);
    expect(r.categoria).toBe('Limpeza');
    expect(r.produto_id).toBe('P2');
  });

  it('returns category-only when regex hits but no product exists', () => {
    const r = matchRegexRules('Lapis preto HB', produtos);
    expect(r).toBeTruthy();
    expect(r.categoria).toBe('Material Escolar');
    expect(r.produto_id).toBeNull();
  });

  it('returns null when nothing matches', () => {
    expect(matchRegexRules('produto desconhecido xyz', produtos)).toBeNull();
  });
});

describe('matchProduct — layered engine', () => {
  const produtos = [
    { id: 'SKU-ARROZ', item: 'Arroz tipo 1 5kg', custoBase: 20 },
    { id: 'SKU-FEIJAO', item: 'Feijao carioca 1kg', custoBase: 8 },
  ];

  it('N1: confirmed cache entry → confirmado, score 1.0', () => {
    const cache = {
      'arroz 5kg': { sku: 'SKU-ARROZ', nome_banco: 'Arroz tipo 1 5kg', confirmado: true },
    };
    const r = matchProduct('Arroz tipo 1 5kg', { cache, produtos });
    expect(r.status).toBe(MATCH_STATUS.CONFIRMADO);
    expect(r.matchLayer).toBe(MATCH_LAYER.N1);
    expect(r.score).toBe(1.0);
    expect(r.sku).toBe('SKU-ARROZ');
  });

  it('N1: unconfirmed cache entry → sugestao (still exact key), score 1.0', () => {
    const cache = {
      'arroz 5kg': { sku: 'SKU-ARROZ', nome_banco: 'Arroz tipo 1 5kg', confirmado: false },
    };
    const r = matchProduct('Arroz tipo 1 5kg', { cache, produtos });
    expect(r.status).toBe(MATCH_STATUS.SUGESTAO);
    expect(r.matchLayer).toBe(MATCH_LAYER.N1);
    expect(r.score).toBe(1.0);
  });

  it('N2: token similarity against banco → sugestao with score >= threshold', () => {
    // "Arroz tipo 1 5kg" vs banco "Arroz tipo 1 5kg": tokens {arroz,5kg} idênticos após
    // remover ruído ("tipo","1") → Jaccard 1.0, mas como a chave normalizada é igual e
    // não há entrada de cache, cai em N2 contra o banco com score alto.
    const r = matchProduct('Arroz tipo 1 marca camil 5kg', { cache: {}, produtos });
    expect(r.status).toBe(MATCH_STATUS.SUGESTAO);
    expect(r.matchLayer).toBe(MATCH_LAYER.N2);
    expect(r.score).toBeGreaterThanOrEqual(TOKEN_THRESHOLD);
    expect(r.sku).toBe('SKU-ARROZ');
  });

  it('N2 via coverage: extra descriptive tokens no longer break the match', () => {
    // "saco" é um token extra ausente no banco. Antes (só Jaccard 2/3 ≈ 0.66) dava sem_match.
    // Agora a cobertura assimétrica resgata: banco "arroz 5kg" totalmente coberto pelo item.
    const r = matchProduct('Arroz tipo 1 saco 5kg', { cache: {}, produtos });
    expect(r.matchLayer).toBe(MATCH_LAYER.N2);
    expect(r.sku).toBe('SKU-ARROZ');
  });

  it('N4: genuinely different products do not match even with coverage', () => {
    // Sem tokens em comum suficientes → nem Jaccard nem cobertura salvam.
    const r = matchProduct('Caderno espiral 96 folhas', { cache: {}, produtos });
    expect(r.matchLayer).not.toBe(MATCH_LAYER.N2);
  });

  it('N3: regex fallback → sugestao, score 0.65, with categoria', () => {
    // nome não casa por token (sem overlap forte) mas casa por regex de categoria
    const produtosRegex = [{ id: 'SKU-CAFE', item: 'Cafe torrado e moido 500g' }];
    const r = matchProduct('Cafe torrado premium', { cache: {}, produtos: produtosRegex });
    expect(r.matchLayer).toBe(MATCH_LAYER.N3);
    expect(r.status).toBe(MATCH_STATUS.SUGESTAO);
    expect(r.score).toBe(0.65);
    expect(r.categoriaSugerida).toBe('Alimentos');
  });

  it('N2 via coverage: short banco name matched by the full SGD description (caso Vassoura)', () => {
    // Cenário real: banco tem "Vassoura nylon" (nome curto); o item SGD chega com a
    // descrição completa do estado. Sem cobertura, o Jaccard despencaria e daria sem_match.
    const bancoVassoura = [{ id: 'SKU-VAS', item: 'Vassoura nylon', custoBase: 12 }];
    const itemSgd = 'Vassoura multiuso nylon, cabo de plastico fixado ao taco e ao corpo com revestimento contendo cerdas macias e sinteticas';
    const r = matchProduct(itemSgd, { cache: {}, produtos: bancoVassoura });
    expect(r.status).toBe(MATCH_STATUS.SUGESTAO);
    expect(r.matchLayer).toBe(MATCH_LAYER.N2);
    expect(r.sku).toBe('SKU-VAS');
    expect(r.score).toBeGreaterThanOrEqual(0.8);
  });

  it('coverage does NOT over-match a single-token banco name', () => {
    // "Sal" (1 token) não deve casar com qualquer item que contenha "sal" por cobertura.
    const banco = [{ id: 'SKU-SAL', item: 'Sal' }];
    const r = matchProduct('Salgadinho de milho sabor queijo pacote 50g', { cache: {}, produtos: banco });
    expect(r.matchLayer).not.toBe(MATCH_LAYER.N2);
  });

  it('N4: no match → sem_match, score 0', () => {
    const r = matchProduct('Produto totalmente desconhecido zzz', { cache: {}, produtos });
    expect(r.status).toBe(MATCH_STATUS.SEM_MATCH);
    expect(r.matchLayer).toBe(MATCH_LAYER.N4);
    expect(r.score).toBe(0);
    expect(r.sku).toBeNull();
  });

  it('N4: empty/garbage input → sem_match without throwing', () => {
    expect(matchProduct('', {}).status).toBe(MATCH_STATUS.SEM_MATCH);
    expect(matchProduct('tipo de marca', { cache: {}, produtos }).status).toBe(MATCH_STATUS.SEM_MATCH);
  });

  it('precedence: N1 wins over N2 when both could match', () => {
    const cache = {
      'arroz 5kg': { sku: 'SKU-CONFIRMED', nome_banco: 'Arroz confirmado', confirmado: true },
    };
    const r = matchProduct('Arroz tipo 1 5kg', { cache, produtos });
    expect(r.matchLayer).toBe(MATCH_LAYER.N1);
    expect(r.sku).toBe('SKU-CONFIRMED');
  });
});
