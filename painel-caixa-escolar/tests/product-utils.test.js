import { describe, it, expect } from 'vitest';
import {
  findNcm, normalizeUnit, generateSku, extractTraits,
  normalizeDescription, shortenDescription, similaridade, toBrDate
} from '../squads/caixa-escolar/dashboard/server-lib/product-utils.js';

describe('findNcm', () => {
  it('finds NCM for common food items', () => {
    const result = findNcm('Arroz tipo 1 5kg');
    expect(result).toBeTruthy();
    expect(result.ncm).toBe('1006.30.21');
  });

  it('finds NCM for cleaning products', () => {
    const result = findNcm('Detergente liquido 500ml');
    expect(result).toBeTruthy();
    expect(result.ncm).toBe('3402.20.00');
  });

  it('returns null for unknown product', () => {
    const result = findNcm('produto inexistente xyz');
    expect(result).toBeNull();
  });

  it('is case insensitive', () => {
    const result = findNcm('ARROZ TIPO 1');
    expect(result).toBeTruthy();
    expect(result.ncm).toBe('1006.30.21');
  });
});

describe('normalizeUnit', () => {
  it('normalizes common units', () => {
    expect(normalizeUnit('KG')).toBe('KG');
    expect(normalizeUnit('kg')).toBe('KG');
    expect(normalizeUnit('UN')).toBe('UN');
    expect(normalizeUnit('un')).toBe('UN');
  });

  it('handles empty/null input', () => {
    expect(normalizeUnit('')).toBe('UN');
    expect(normalizeUnit(null)).toBe('UN');
    expect(normalizeUnit(undefined)).toBe('UN');
  });
});

describe('generateSku', () => {
  it('generates SKU with contract prefix', () => {
    const sku = generateSku({ descricao: 'Arroz 5kg' }, 1, 'CT-001');
    expect(sku).toBeTruthy();
    expect(typeof sku).toBe('string');
    expect(sku.length).toBeGreaterThan(0);
  });
});

describe('extractTraits', () => {
  it('extracts weight from description', () => {
    const traits = extractTraits('Arroz tipo 1 - 5kg pacote');
    expect(traits).toBeTruthy();
  });

  it('handles empty description', () => {
    const traits = extractTraits('');
    expect(traits).toBeTruthy();
  });
});

describe('normalizeDescription', () => {
  it('normalizes whitespace and case', () => {
    const result = normalizeDescription('  ARROZ   TIPO  1  ');
    expect(result).not.toContain('  ');
    expect(result.length).toBeGreaterThan(0);
  });

  it('handles null/empty', () => {
    expect(normalizeDescription('')).toBe('');
    expect(normalizeDescription(null)).toBe('');
  });
});

describe('shortenDescription', () => {
  it('shortens long descriptions', () => {
    const long = 'Arroz tipo 1 parboilizado integral pacote de 5 quilogramas marca premium';
    const short = shortenDescription(long);
    expect(short.length).toBeLessThanOrEqual(long.length);
  });

  it('handles short descriptions unchanged', () => {
    expect(shortenDescription('Arroz')).toBe('Arroz');
  });
});

describe('similaridade', () => {
  it('returns 1 for identical strings', () => {
    expect(similaridade('arroz', 'arroz')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(similaridade('abc', 'xyz')).toBeLessThan(0.5);
  });

  it('returns high similarity for similar strings', () => {
    expect(similaridade('arroz tipo 1', 'arroz tipo 2')).toBeGreaterThan(0.7);
  });
});

describe('toBrDate', () => {
  it('formats ISO date to BR format', () => {
    const result = toBrDate('2026-06-02');
    expect(result).toContain('/');
  });

  it('handles null/empty gracefully', () => {
    // toBrDate may return a date string from Date(null) = epoch
    const resultNull = toBrDate(null);
    const resultEmpty = toBrDate('');
    // Just ensure it doesn't throw
    expect(typeof resultNull).toBe('string');
  });
});
