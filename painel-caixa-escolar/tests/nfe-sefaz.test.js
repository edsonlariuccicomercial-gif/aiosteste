import { describe, it, expect } from 'vitest';

// CommonJS module — use require
const nfe = require('../squads/caixa-escolar/dashboard/server-lib/nfe-sefaz-client.js');

describe('validateCrt', () => {
  it('validates Simples Nacional (CRT 1)', () => {
    const result = nfe.validateCrt('1');
    expect(result.valid).toBe(true);
    expect(result.regime).toContain('simples');
  });

  it('validates Lucro Presumido (CRT 3)', () => {
    const result = nfe.validateCrt('3');
    expect(result.valid).toBe(true);
  });

  it('rejects invalid CRT', () => {
    const result = nfe.validateCrt('9');
    expect(result.valid).toBe(false);
  });

  it('handles null/empty', () => {
    const result = nfe.validateCrt('');
    expect(result.valid).toBe(false);
  });
});

describe('validateNfePayload', () => {
  it('rejects empty payload', () => {
    const result = nfe.validateNfePayload({});
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects payload without items', () => {
    const result = nfe.validateNfePayload({
      empresa: { cnpj: '12345678000100' },
      cliente: { nome: 'Test' }
    });
    expect(result.valid).toBe(false);
  });
});

describe('RTC_ALIQUOTAS', () => {
  it('has 2026 pilot rates', () => {
    const rates = nfe.RTC_ALIQUOTAS;
    expect(rates).toBeTruthy();
    const year2026 = rates[2026];
    expect(year2026).toBeTruthy();
    expect(year2026.CBS).toBeGreaterThan(0);
    expect(year2026.IBSUF).toBeGreaterThanOrEqual(0);
  });
});

describe('getSefazConfig', () => {
  it('returns config object', () => {
    const config = nfe.getSefazConfig({ config_fiscal: { ambiente: 'homologacao', serie: '1' } });
    expect(config).toBeTruthy();
    expect(config.ambiente).toBe('homologacao');
  });

  it('handles empty empresa', () => {
    const config = nfe.getSefazConfig({});
    expect(config).toBeTruthy();
  });
});

describe('validateSefazConfig', () => {
  it('validates minimal config', () => {
    const result = nfe.validateSefazConfig({
      ambiente: 'homologacao',
      serie: '1',
      cfop: '5102',
      naturezaOperacao: 'Venda',
      regime: 'simples'
    });
    expect(result).toBeTruthy();
  });
});

describe('getSefazAutorizacaoUrl', () => {
  it('returns URL for MG homologacao', () => {
    const url = nfe.getSefazAutorizacaoUrl('MG', 'homologacao');
    expect(url).toBeTruthy();
    expect(url).toContain('https://');
  });

  it('returns URL for MG producao', () => {
    const url = nfe.getSefazAutorizacaoUrl('MG', 'producao');
    expect(url).toBeTruthy();
    expect(url).toContain('https://');
  });
});

describe('buildIbsCbsXml', () => {
  it('builds XML for 2026 pilot year with CRT 3', () => {
    const item = { valorTotal: 1000, ibsCbsCST: '00', ibsCbsClassTrib: '0000000' };
    const emitente = { crt: '3' };
    const xml = nfe.buildIbsCbsXml(item, emitente, 2026);
    expect(xml).toBeTruthy();
    expect(typeof xml).toBe('string');
    expect(xml).toContain('CBS');
  });

  it('returns empty for CRT 1 (Simples) without forceIbsCbs', () => {
    const item = { valorTotal: 1000 };
    const emitente = { crt: '1' };
    const xml = nfe.buildIbsCbsXml(item, emitente, 2026);
    expect(xml).toBe('');
  });

  it('returns empty for unknown year', () => {
    const item = { valorTotal: 1000 };
    const emitente = { crt: '3' };
    const xml = nfe.buildIbsCbsXml(item, emitente, 2099);
    expect(xml).toBe('');
  });
});
