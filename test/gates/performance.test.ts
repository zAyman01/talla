import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright-core';
import lighthouse from 'lighthouse';
import { gateEnabled, storefront } from '../support/browser.ts';

/**
 * The performance gate (spec 11.1).
 *
 * Budgets, not a score. A Lighthouse performance score is a weighted average that can
 * stay green while the one metric a buyer feels doubles, and it moves when Lighthouse
 * changes its weights. The numbers below come from the spec's table and nowhere else.
 *
 * **What this is.** A regression gate on a fixed, simulated profile, run against the
 * production images serving a seeded store. It answers "did this commit make the page
 * slower than the last one" reproducibly.
 *
 * **What it is not.** The Phase 0 device gate. Spec 11.1 budgets p75 on a real Samsung
 * Galaxy A16 over real 4G, and no number produced on a build machine over loopback is
 * that. Green here means the page did not regress under a throttle; it does not mean the
 * page is fast on the phone it is for.
 *
 * **TTFD is deliberately absent.** Time to first garment dressed is the budget that
 * matters most, and asserting it today would measure the parametric stopgap of ADR-0018
 * against a budget written for real published assets. It arrives with E2.
 */

/** Spec 11.1, the metrics a lab run can honestly produce. */
const LCP_BUDGET_MS = 2500;
const CLS_BUDGET = 0.1;

/**
 * Throttling derived from the reference device (ADR-0012, Samsung Galaxy A16).
 *
 * **Applied, not simulated**, and the difference mattered. Lighthouse's default Lantern
 * simulation replays the dependency graph and charges every request a full round trip,
 * which is roughly right for a page served over HTTP/1.1 from one origin and badly wrong
 * for the multiplexed, CDN fronted deployment this is going to. On the compose stack it
 * turned an observed 0.9 s paint into a predicted 3.5 s one, almost all of it modelled
 * queueing on code split chunks that a real connection fetches in parallel.
 *
 * DevTools throttling rate limits the browser for real. It is noisier, and it measures
 * what happened rather than what a model expected.
 */
const REFERENCE_THROTTLING = {
  rttMs: 150,
  throughputKbps: 1_638.4,
  requestLatencyMs: 562.5,
  downloadThroughputKbps: 1_474.56,
  uploadThroughputKbps: 675,
  // Four times slower than the build machine, which is roughly where a mid range Android
  // sits against a developer laptop.
  cpuSlowdownMultiplier: 4,
};

interface Audit {
  readonly numericValue?: number;
  readonly displayValue?: string;
}

describe.skipIf(!gateEnabled)('performance budgets, spec 11.1', () => {
  it('meets the LCP and CLS budgets on the throttled reference profile', async () => {
    // Lighthouse drives Chrome over the DevTools protocol, so it attaches to the same
    // browser build every other gate uses rather than downloading a second one
    // (ADR-0023).
    const browser = await chromium.launch({ args: ['--remote-debugging-port=9222'] });
    try {
      const run = await lighthouse(
        storefront('/'),
        {
          port: 9222,
          output: 'json',
          logLevel: 'error',
          onlyCategories: ['performance'],
          formFactor: 'mobile',
          screenEmulation: {
            mobile: true,
            width: 360,
            height: 780,
            deviceScaleFactor: 3,
            disabled: false,
          },
          throttlingMethod: 'devtools',
          throttling: REFERENCE_THROTTLING,
        },
        undefined,
      );
      if (run === undefined) throw new Error('Lighthouse produced no report');

      const audits = run.lhr.audits as unknown as Record<string, Audit | undefined>;
      const lcp = audits['largest-contentful-paint']?.numericValue;
      const cls = audits['cumulative-layout-shift']?.numericValue;

      // A missing metric is a failed run reported as a pass, which is the shape of
      // gate this repository has already been bitten by once.
      expect(lcp, 'Lighthouse reported no LCP').toBeTypeOf('number');
      expect(cls, 'Lighthouse reported no CLS').toBeTypeOf('number');

      expect(
        lcp,
        `LCP ${String(Math.round(lcp ?? 0))} ms, budget ${String(LCP_BUDGET_MS)} ms`,
      ).toBeLessThanOrEqual(LCP_BUDGET_MS);
      expect(cls, `CLS ${String(cls)}, budget ${String(CLS_BUDGET)}`).toBeLessThanOrEqual(
        CLS_BUDGET,
      );
    } finally {
      await browser.close();
    }
  }, 300_000);
});
