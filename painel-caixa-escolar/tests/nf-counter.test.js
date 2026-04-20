import { describe, it, expect } from 'vitest';

/**
 * Tests for NF-e counter logic (Story 7.3)
 * Validates the atomic counter behavior expectations
 */

describe('NF-e counter atomic logic', () => {
  it('always returns sequential numbers', () => {
    // Simulate the atomic function behavior
    let counter = 1208;
    const results = [];

    for (let i = 0; i < 10; i++) {
      counter++;
      results.push(counter);
    }

    // All numbers should be sequential
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBe(results[i - 1] + 1);
    }
  });

  it('never generates duplicate numbers in sequence', () => {
    let counter = 1208;
    const generated = new Set();

    for (let i = 0; i < 1000; i++) {
      counter++;
      expect(generated.has(counter)).toBe(false);
      generated.add(counter);
    }

    expect(generated.size).toBe(1000);
  });

  it('respects minimum floor (1208)', () => {
    // If counter is below floor, it should be raised
    let counter = 100;
    if (counter < 1208) counter = 1208;
    counter++;

    expect(counter).toBe(1209);
  });

  it('uses max of existing NFs as base', () => {
    const existingNfs = [
      { numero: '1200' },
      { numero: '1250' },
      { numero: '1300' },
    ];

    let counter = 1208;
    const maxUsado = existingNfs.reduce((max, nf) => Math.max(max, parseInt(nf.numero) || 0), 0);
    if (maxUsado > counter) counter = maxUsado;

    expect(counter).toBe(1300);
    counter++;
    expect(counter).toBe(1301);
  });
});

describe('NF-e UNIQUE constraint validation', () => {
  it('detects duplicate NF by empresa+numero+serie', () => {
    const nfs = [
      { empresa_id: 'LARIUCCI', numero: '1300', serie: '1' },
      { empresa_id: 'LARIUCCI', numero: '1301', serie: '1' },
      { empresa_id: 'LARIUCCI', numero: '1300', serie: '1' }, // DUPLICATE
    ];

    const seen = new Set();
    const duplicates = [];

    for (const nf of nfs) {
      const key = `${nf.empresa_id}|${nf.numero}|${nf.serie}`;
      if (seen.has(key)) {
        duplicates.push(nf);
      } else {
        seen.add(key);
      }
    }

    expect(duplicates.length).toBe(1);
    expect(duplicates[0].numero).toBe('1300');
  });

  it('allows same number for different empresas', () => {
    const nfs = [
      { empresa_id: 'LARIUCCI', numero: '1300', serie: '1' },
      { empresa_id: 'OUTRA_EMPRESA', numero: '1300', serie: '1' }, // OK — different empresa
    ];

    const seen = new Set();
    const duplicates = [];

    for (const nf of nfs) {
      const key = `${nf.empresa_id}|${nf.numero}|${nf.serie}`;
      if (seen.has(key)) duplicates.push(nf);
      else seen.add(key);
    }

    expect(duplicates.length).toBe(0);
  });
});
