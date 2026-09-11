import { chromium } from 'playwright-core';
import type { Browser, BrowserContext, Page } from 'playwright-core';

/**
 * The browser the Stage G gates share (ADR-0023).
 *
 * One driver, used as a library from the existing test runner, so a gate is a test file
 * that happens to open a browser rather than a second suite with its own config.
 *
 * The gates point at a running Talla rather than starting one, because what is worth
 * measuring is the production build serving a seeded store. `docker compose up` produces
 * exactly that, and CONTRIBUTING says so. A gate with nothing to point at skips, the same
 * way the PostgreSQL and sandbox suites do.
 */

/** The store the seed creates, on the parent domain the example environment configures. */
const DEFAULT_URL = 'http://nasij.localhost:3000';

export const gateUrl = process.env['TALLA_GATE_URL'];
export const gateEnabled = gateUrl !== undefined && gateUrl !== '';

export function storefront(path = '/'): string {
  return new URL(path, gateUrl ?? DEFAULT_URL).href;
}

/**
 * The reference device, as far as a desktop browser can imitate one.
 *
 * Spec 11.1 names the Samsung Galaxy A16 (ADR-0012) and says every budget means "on that
 * phone". A viewport and a device pixel ratio are not a Mali GPU, and this is not
 * pretending otherwise: it is the part of the reference profile that can be reproduced
 * deterministically in CI. The parts that cannot are the Phase 0 device gate's, on the
 * real handset.
 */
export const REFERENCE_DEVICE = {
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
} as const;

export interface BrowserSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  close(): Promise<void>;
}

/**
 * Open a page on the reference profile.
 *
 * `--allow-running-insecure-content` and its neighbours are deliberately absent: a gate
 * that relaxes the browser is a gate measuring a browser no buyer has.
 */
export async function openReferencePage(
  args: readonly string[] = [],
): Promise<BrowserSession> {
  const browser = await chromium.launch({ args: [...args] });
  const context = await browser.newContext({
    ...REFERENCE_DEVICE,
    // The storefront is Arabic first and right to left. A gate running in an English
    // locale measures a page no buyer sees, and direction is one of the things spec 15
    // asks to be declared correctly.
    locale: 'ar-EG',
  });
  const page = await context.newPage();
  return {
    browser,
    context,
    page,
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
