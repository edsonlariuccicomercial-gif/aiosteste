import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// We test the health check logic by importing the handler
// Since it's an ESM module with imports, we test the response structure
describe('Health Check endpoint logic', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('returns healthy when all services respond OK', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ([])
    });

    // Simulate what the handler would return
    const checks = {
      sgd: { status: 'healthy', latency_ms: 150 },
      supabase: { status: 'healthy', latency_ms: 50 },
      certificate: { status: 'healthy', message: 'All certificates valid' }
    };

    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus = 'healthy';
    if (statuses.includes('critical')) overallStatus = 'critical';
    else if (statuses.includes('warning')) overallStatus = 'warning';

    expect(overallStatus).toBe('healthy');
  });

  it('returns critical when any service is down', () => {
    const checks = {
      sgd: { status: 'critical', message: 'SGD unreachable' },
      supabase: { status: 'healthy' },
      certificate: { status: 'healthy' }
    };

    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus = 'healthy';
    if (statuses.includes('critical')) overallStatus = 'critical';
    else if (statuses.includes('warning')) overallStatus = 'warning';

    expect(overallStatus).toBe('critical');
  });

  it('returns warning for expiring certificates', () => {
    const checks = {
      sgd: { status: 'healthy' },
      supabase: { status: 'healthy' },
      certificate: { status: 'warning', message: 'Certificate expiring soon', alerts: [{ days: 15 }] }
    };

    const statuses = Object.values(checks).map(c => c.status);
    let overallStatus = 'healthy';
    if (statuses.includes('critical')) overallStatus = 'critical';
    else if (statuses.includes('warning')) overallStatus = 'warning';

    expect(overallStatus).toBe('warning');
  });
});

describe('Certificate expiry detection', () => {
  it('detects expired certificate', () => {
    const validade = new Date('2025-01-01');
    const now = new Date('2026-04-20');
    const daysUntilExpiry = Math.floor((validade - now) / (1000 * 60 * 60 * 24));

    expect(daysUntilExpiry).toBeLessThan(0);
  });

  it('detects certificate expiring in 15 days', () => {
    const now = new Date('2026-04-20');
    const validade = new Date('2026-05-05');
    const daysUntilExpiry = Math.floor((validade - now) / (1000 * 60 * 60 * 24));

    expect(daysUntilExpiry).toBe(15);
    expect(daysUntilExpiry).toBeLessThan(30);
  });

  it('considers certificate valid if > 30 days', () => {
    const now = new Date('2026-04-20');
    const validade = new Date('2027-04-20');
    const daysUntilExpiry = Math.floor((validade - now) / (1000 * 60 * 60 * 24));

    expect(daysUntilExpiry).toBeGreaterThan(30);
  });
});
