'use strict';

const { MetricsCollector, createEmptyMetrics } = require('./metrics-collector');

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSeedData(options = {}) {
  const days = Number.isInteger(options.days) ? options.days : 30;
  const runsPerDay = Number.isInteger(options.runsPerDay) ? options.runsPerDay : 8;
  const weekendReduction = options.weekendReduction !== false;

  const metrics = createEmptyMetrics(30);
  const now = Date.now();
  const msPerDay = 24 * 60 * 60 * 1000;

  for (let d = days - 1; d >= 0; d -= 1) {
    const dayDate = new Date(now - d * msPerDay);
    const weekday = dayDate.getDay();
    const isWeekend = weekday === 0 || weekday === 6;
    const dailyRuns = isWeekend && weekendReduction
      ? Math.max(1, Math.floor(runsPerDay * 0.4))
      : runsPerDay;

    for (let i = 0; i < dailyRuns; i += 1) {
      const layer = [1, 2, 3][randomInt(0, 2)];
      const passChance = layer === 1 ? 0.92 : layer === 2 ? 0.86 : 0.94;
      const passed = Math.random() < passChance;
      const findingsCount = layer === 2 ? randomInt(0, 6) : randomInt(0, 2);

      const run = {
        timestamp: new Date(dayDate.getTime() + randomInt(0, msPerDay - 1)).toISOString(),
        layer,
        passed,
        durationMs: layer === 1 ? randomInt(500, 8000) : layer === 2 ? randomInt(1000, 25000) : randomInt(200, 5000),
        findingsCount,
        metadata: {
          storyId: `ST-${randomInt(1, 40)}`,
          branchName: `feature/story-${randomInt(1, 40)}`,
          triggeredBy: 'seed',
        },
        coderabbit: null,
        quinn: null,
      };

      if (layer === 2) {
        const critical = randomInt(0, 1);
        const high = randomInt(0, 2);
        const medium = randomInt(0, 3);
        const low = randomInt(0, 4);
        run.coderabbit = {
          findingsCount: critical + high + medium + low,
          severityBreakdown: { critical, high, medium, low },
        };
        run.quinn = {
          findingsCount: randomInt(0, 3),
          topCategories: ['security', 'performance', 'maintainability'].slice(0, randomInt(1, 3)),
        };
      }

      metrics.history.push(run);
    }
  }

  metrics.history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  return metrics;
}

async function seedMetrics(options = {}) {
  const collector = new MetricsCollector();
  const metrics = generateSeedData(options);
  const normalized = await collector._read();
  normalized.history = metrics.history;
  normalized.retentionDays = metrics.retentionDays;
  collector._recalculate(normalized);
  await collector._write(normalized);
  return normalized;
}

module.exports = {
  seedMetrics,
  generateSeedData,
};

