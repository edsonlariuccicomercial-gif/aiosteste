'use strict';

const fs = require('fs').promises;
const path = require('path');

const DEFAULT_RETENTION_DAYS = 30;

function createEmptyMetrics(retentionDays = DEFAULT_RETENTION_DAYS) {
  return {
    version: '1.0.0',
    lastUpdated: null,
    retentionDays,
    layers: {
      layer1: { totalRuns: 0, passRate: 0, avgTimeMs: 0, lastRun: null },
      layer2: {
        totalRuns: 0,
        passRate: 0,
        avgTimeMs: 0,
        lastRun: null,
        autoCatchRate: 0,
        coderabbit: {
          active: false,
          findingsCount: 0,
          severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 },
        },
        quinn: { findingsCount: 0, topCategories: [] },
      },
      layer3: { totalRuns: 0, passRate: 0, avgTimeMs: 0, lastRun: null },
    },
    trends: {
      passRates: [],
      autoCatchRate: [],
    },
    history: [],
  };
}

function numberOrZero(value) {
  return Number.isFinite(value) ? value : 0;
}

class MetricsCollector {
  constructor(options = {}) {
    this.retentionDays = Number.isInteger(options.retentionDays)
      ? options.retentionDays
      : DEFAULT_RETENTION_DAYS;

    this.metricsPath = options.metricsPath || path.join(process.cwd(), '.aios', 'data', 'quality-metrics.json');
  }

  async _ensureDir() {
    await fs.mkdir(path.dirname(this.metricsPath), { recursive: true });
  }

  async _read() {
    try {
      const raw = await fs.readFile(this.metricsPath, 'utf8');
      const parsed = JSON.parse(raw);
      return this._normalize(parsed);
    } catch (_error) {
      return createEmptyMetrics(this.retentionDays);
    }
  }

  async _write(metrics) {
    await this._ensureDir();
    metrics.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
  }

  _normalize(metrics) {
    const base = createEmptyMetrics(this.retentionDays);
    const merged = {
      ...base,
      ...metrics,
      retentionDays: Number.isInteger(metrics?.retentionDays) ? metrics.retentionDays : this.retentionDays,
      layers: {
        ...base.layers,
        ...(metrics?.layers || {}),
        layer1: { ...base.layers.layer1, ...(metrics?.layers?.layer1 || {}) },
        layer2: {
          ...base.layers.layer2,
          ...(metrics?.layers?.layer2 || {}),
          coderabbit: {
            ...base.layers.layer2.coderabbit,
            ...(metrics?.layers?.layer2?.coderabbit || {}),
            severityBreakdown: {
              ...base.layers.layer2.coderabbit.severityBreakdown,
              ...(metrics?.layers?.layer2?.coderabbit?.severityBreakdown || {}),
            },
          },
          quinn: { ...base.layers.layer2.quinn, ...(metrics?.layers?.layer2?.quinn || {}) },
        },
        layer3: { ...base.layers.layer3, ...(metrics?.layers?.layer3 || {}) },
      },
      trends: { ...base.trends, ...(metrics?.trends || {}) },
      history: Array.isArray(metrics?.history) ? metrics.history : [],
    };
    return merged;
  }

  _recalculate(metrics) {
    const byLayer = { 1: [], 2: [], 3: [] };
    for (const run of metrics.history) {
      if (byLayer[run.layer]) byLayer[run.layer].push(run);
    }

    for (const layerNum of [1, 2, 3]) {
      const runs = byLayer[layerNum];
      const key = `layer${layerNum}`;
      const totalRuns = runs.length;
      const passCount = runs.filter((r) => r.passed).length;
      const avgTimeMs = totalRuns > 0
        ? Math.round(runs.reduce((sum, r) => sum + numberOrZero(r.durationMs), 0) / totalRuns)
        : 0;

      metrics.layers[key].totalRuns = totalRuns;
      metrics.layers[key].passRate = totalRuns > 0 ? passCount / totalRuns : 0;
      metrics.layers[key].avgTimeMs = avgTimeMs;
      metrics.layers[key].lastRun = totalRuns > 0 ? runs[runs.length - 1].timestamp : null;
    }

    const layer2Runs = byLayer[2];
    const l2 = metrics.layers.layer2;
    const layer2Findings = layer2Runs.reduce((acc, r) => acc + numberOrZero(r.findingsCount), 0);
    const layer2Failed = layer2Runs.filter((r) => !r.passed).length;
    l2.autoCatchRate = layer2Findings > 0 ? Math.min(1, layer2Failed / layer2Findings) : 0;

    const cr = {
      active: false,
      findingsCount: 0,
      severityBreakdown: { critical: 0, high: 0, medium: 0, low: 0 },
    };
    const quinn = { findingsCount: 0, topCategories: [] };
    const categoryCount = new Map();

    for (const run of layer2Runs) {
      if (run.coderabbit) {
        cr.active = true;
        cr.findingsCount += numberOrZero(run.coderabbit.findingsCount);
        const sb = run.coderabbit.severityBreakdown || {};
        cr.severityBreakdown.critical += numberOrZero(sb.critical);
        cr.severityBreakdown.high += numberOrZero(sb.high);
        cr.severityBreakdown.medium += numberOrZero(sb.medium);
        cr.severityBreakdown.low += numberOrZero(sb.low);
      }

      if (run.quinn) {
        quinn.findingsCount += numberOrZero(run.quinn.findingsCount);
        for (const cat of (run.quinn.topCategories || [])) {
          const value = categoryCount.get(cat) || 0;
          categoryCount.set(cat, value + 1);
        }
      }
    }

    quinn.topCategories = [...categoryCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    l2.coderabbit = cr;
    l2.quinn = quinn;

    metrics.trends = {
      passRates: [1, 2, 3].map((layerNum) => {
        const layer = metrics.layers[`layer${layerNum}`];
        return { layer: layerNum, passRate: layer.passRate, totalRuns: layer.totalRuns };
      }),
      autoCatchRate: [{ layer: 2, value: l2.autoCatchRate }],
    };
  }

  _makeRun(layer, result = {}) {
    return {
      timestamp: new Date().toISOString(),
      layer,
      passed: !!result.passed,
      durationMs: numberOrZero(result.durationMs),
      findingsCount: numberOrZero(result.findingsCount),
      metadata: result.metadata || {},
      coderabbit: result.coderabbit || null,
      quinn: result.quinn || null,
    };
  }

  async getMetrics() {
    const metrics = await this._read();
    this._recalculate(metrics);
    return metrics;
  }

  async recordRun(layer, result) {
    if (![1, 2, 3].includes(layer)) {
      throw new Error(`Invalid layer: ${layer}`);
    }

    const metrics = await this._read();
    const run = this._makeRun(layer, result);
    metrics.history.push(run);
    metrics.retentionDays = this.retentionDays;
    this._recalculate(metrics);
    await this._write(metrics);
    return run;
  }

  async recordPRReview(result) {
    return this.recordRun(2, result);
  }

  async cleanup() {
    const metrics = await this._read();
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const originalLength = metrics.history.length;
    metrics.history = metrics.history.filter((entry) => {
      const ts = new Date(entry.timestamp).getTime();
      return Number.isFinite(ts) && ts > cutoff;
    });
    this._recalculate(metrics);
    await this._write(metrics);
    return originalLength - metrics.history.length;
  }

  async export(format = 'json') {
    const metrics = await this.getMetrics();
    if (format === 'json') {
      return JSON.stringify(metrics, null, 2);
    }

    if (format === 'csv') {
      const header = [
        'timestamp',
        'layer',
        'passed',
        'durationMs',
        'findingsCount',
        'storyId',
        'branchName',
        'commitHash',
      ];

      const lines = metrics.history.map((r) => ([
        r.timestamp,
        r.layer,
        r.passed,
        numberOrZero(r.durationMs),
        numberOrZero(r.findingsCount),
        r.metadata?.storyId || '',
        r.metadata?.branchName || '',
        r.metadata?.commitHash || '',
      ]).join(','));

      return [header.join(','), ...lines].join('\n');
    }

    throw new Error(`Unsupported export format: ${format}`);
  }
}

module.exports = {
  MetricsCollector,
  createEmptyMetrics,
};

