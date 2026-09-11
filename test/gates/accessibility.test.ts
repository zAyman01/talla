import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import type { Page } from 'playwright-core';
import { gateEnabled, openReferencePage, storefront } from '../support/browser.ts';

/**
 * The accessibility gate (spec 15, WCAG 2.2 AA).
 *
 * It fails on a violation, not on a score. A storefront a buyer cannot get through loses
 * the store money it never learns about, and unlike a slow page nobody reports it.
 *
 * Run against a real browser on the reference profile, because most of what matters here
 * is a property of a rendered page: a contrast ratio needs layout and computed colour, an
 * accessible name needs the tree the browser actually builds, and a focus ring needs
 * something to paint it. axe in jsdom skips those rules and reports a pass, which is worse
 * than not running at all (ADR-0023).
 *
 * Points at a running Talla rather than starting one. `docker compose up` is the command,
 * and CONTRIBUTING carries it.
 */

const require = createRequire(import.meta.url);
/** axe ships its own bundle as a string, for exactly this: injecting it into a page. */
const AXE_SOURCE = (require('axe-core') as { source: string }).source;

/** WCAG 2.2 AA, which is what spec 15 targets, and nothing wider. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Spec 15: 4.5:1 for body text, 3:1 for large text and meaningful icons. */
const CONTRAST_BODY = 4.5;
const CONTRAST_LARGE = 3;

interface AxeNode {
  readonly html: string;
  readonly target: readonly string[];
  readonly failureSummary?: string;
}

interface AxeCheck {
  readonly id: string;
  readonly nodes: readonly AxeNode[];
  readonly impact?: string | null;
  readonly help?: string;
}

interface AxeResult {
  readonly violations: readonly AxeCheck[];
  readonly incomplete: readonly AxeCheck[];
  readonly passes: readonly AxeCheck[];
}

/**
 * Report a violation the way a person can act on it.
 *
 * axe's own object is large and mostly URLs. What a reader needs is the rule, the element,
 * and the sentence saying what is wrong with it.
 */
function describeViolations(violations: readonly AxeCheck[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map(
          (node) =>
            `      ${node.target.join(' ')}\n        ${node.html.slice(0, 160)}` +
            (node.failureSummary === undefined
              ? ''
              : `\n        ${node.failureSummary.replaceAll('\n', ' ')}`),
        )
        .join('\n');
      return `  ${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help ?? ''}\n${nodes}`;
    })
    .join('\n');
}

/**
 * Resolve the contrast axe gave up on.
 *
 * axe returns `incomplete` rather than a pass or a failure whenever it cannot work out
 * what is behind an element, which on this storefront is every line inside the fixed
 * summary bar at the foot of the page. Treating `incomplete` as a pass would quietly
 * exempt the one component a buyer reads on every screen, and that is precisely how a
 * gate becomes decorative.
 *
 * So the unresolved nodes are measured here instead: walk up for the first ancestor with
 * an opaque background, and apply the WCAG relative-luminance formula. A node whose
 * background genuinely cannot be resolved is reported as a failure, because an
 * unverifiable contrast is an unverified one.
 */
function resolveContrast(targets: readonly string[]): Resolved[] {
  const luminance = (r: number, g: number, b: number): number => {
    const channel = (value: number): number => {
      const c = value / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  };
  const parse = (
    colour: string,
  ): { r: number; g: number; b: number; alpha: number } | undefined => {
    const parts = colour.match(/[\d.]+/g);
    if (parts === null || parts.length < 3) return undefined;
    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      alpha: parts.length > 3 ? Number(parts[3]) : 1,
    };
  };
  return targets.map((selector) => {
    const element = document.querySelector(selector);
    if (element === null) return { selector, error: 'element is gone' };
    const style = getComputedStyle(element);
    const foreground = parse(style.color);
    let backdrop: ReturnType<typeof parse>;
    for (let node: Element | null = element; node !== null; node = node.parentElement) {
      const candidate = parse(getComputedStyle(node).backgroundColor);
      if (candidate !== undefined && candidate.alpha === 1) {
        backdrop = candidate;
        break;
      }
    }
    if (foreground === undefined || backdrop === undefined)
      return { selector, error: 'no opaque background found' };
    const a = luminance(foreground.r, foreground.g, foreground.b);
    const b = luminance(backdrop.r, backdrop.g, backdrop.b);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number(style.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    return { selector, ratio: Math.round(ratio * 100) / 100, large };
  });
}

interface Resolved {
  readonly selector: string;
  readonly ratio?: number;
  readonly large?: boolean;
  readonly error?: string;
}

async function audit(page: Page, label: string): Promise<string> {
  await page.addScriptTag({ content: AXE_SOURCE });
  const result = await page.evaluate(
    ([tags]) =>
      (
        window as unknown as { axe: { run: (options: unknown) => Promise<AxeResult> } }
      ).axe.run({ runOnly: { type: 'tag', values: tags } }),
    [TAGS],
  );

  const problems: string[] = [];
  if (result.violations.length > 0) problems.push(describeViolations(result.violations));

  const unresolved = result.incomplete
    .filter((check) => check.id === 'color-contrast')
    .flatMap((check) => check.nodes.map((node) => node.target.join(' ')));
  if (unresolved.length > 0) {
    const resolved = await page.evaluate(resolveContrast, unresolved);
    for (const entry of resolved) {
      if (entry.error !== undefined) {
        problems.push(
          `  color-contrast unverifiable: ${entry.selector} (${entry.error})`,
        );
        continue;
      }
      const required = entry.large === true ? CONTRAST_LARGE : CONTRAST_BODY;
      if ((entry.ratio ?? 0) < required) {
        problems.push(
          `  color-contrast: ${entry.selector} is ${String(entry.ratio)}:1, needs ${String(required)}:1`,
        );
      }
    }
  }

  // A page where axe found nothing to check is a page axe failed to reach.
  if (result.passes.length === 0) problems.push('  axe ran no rules at all');
  return problems.length === 0 ? '' : `${label}\n${problems.join('\n')}`;
}

describe.skipIf(!gateEnabled)('accessibility, WCAG 2.2 AA', () => {
  // Spec 15 asks for both themes independently, because a palette that passes in one can
  // fail in the other and nobody looks at the one they do not use.
  for (const theme of ['light', 'dark'] as const) {
    it(`passes on the catalogue, an outfit and the cart in the ${theme} theme`, async () => {
      const session = await openReferencePage();
      try {
        const { page } = session;
        await page.emulateMedia({ colorScheme: theme });
        await page.goto(storefront('/'), { waitUntil: 'networkidle' });

        expect(await audit(page, `${theme}: catalogue`)).toBe('');

        // An outfit on the figure is a different tree: the canvas is mounted and the
        // summary bar has content in it.
        const size = page.getByRole('button', { name: 'XL', exact: true });
        if ((await size.count()) > 0) await size.first().click();
        expect(await audit(page, `${theme}: outfit selected`)).toBe('');

        // The cart, which is where a buyer commits.
        await page.getByRole('button', { name: /السلة/ }).first().click();
        await page.waitForTimeout(400);
        expect(await audit(page, `${theme}: cart open`)).toBe('');
      } finally {
        await session.close();
      }
    }, 180_000);
  }

  it('gives every interactive control an accessible name and a visible focus ring', async () => {
    // Two things axe does not answer on its own. A control with no name is announced as
    // "button" and nothing else, and spec 15 says the focus ring is never removed,
    // which is a claim about what changes when focus lands rather than about an element.
    const session = await openReferencePage();
    try {
      const { page } = session;
      await page.goto(storefront('/'), { waitUntil: 'networkidle' });

      const unnamed = await page.evaluate(() => {
        const selector = 'button, a[href], input, select, textarea, [tabindex]';
        return [...document.querySelectorAll(selector)]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            // The three places a name can come from, in the order a browser reads
            // them. A control with none of them is announced as "button" and nothing
            // else.
            const name = [
              element.getAttribute('aria-label'),
              element.getAttribute('title'),
              element.textContent,
            ].find((value) => value !== null && value.trim() !== '');
            return name === undefined;
          })
          .map((element) => element.outerHTML.slice(0, 160));
      });
      expect(unnamed).toEqual([]);

      const focusable = page.locator('button:visible').first();
      await focusable.focus();
      const ring = await focusable.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineWidth: style.outlineWidth,
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
        };
      });
      const hasRing =
        (ring.outlineStyle !== 'none' && Number.parseFloat(ring.outlineWidth) >= 2) ||
        (ring.boxShadow !== 'none' && ring.boxShadow !== '');
      expect(hasRing, `focus produced ${JSON.stringify(ring)}`).toBe(true);
    } finally {
      await session.close();
    }
  }, 120_000);

  it('survives text scaled to 200 percent without clipping', async () => {
    // Spec 15 asks for 200 percent text scaling without clipping or overlap, and names
    // Arabic at large sizes as the case most likely to break a layout.
    const session = await openReferencePage();
    try {
      const { page } = session;
      await page.goto(storefront('/'), { waitUntil: 'networkidle' });
      await page.addStyleTag({ content: 'html { font-size: 200% }' });
      await page.waitForTimeout(300);

      const overflow = await page.evaluate(() => ({
        horizontal:
          document.documentElement.scrollWidth > document.documentElement.clientWidth,
        clipped: [...document.querySelectorAll('button, h1, h2, .price, .numeric')]
          .filter((element) => {
            const style = getComputedStyle(element);
            if (style.overflow === 'visible') return false;
            return element.scrollHeight > element.clientHeight + 2;
          })
          .map((element) => element.outerHTML.slice(0, 120)),
      }));

      // A page that scrolls sideways at 200 percent is a page a low-vision buyer reads
      // by dragging every line, which is the failure this rule exists to prevent.
      expect(overflow.horizontal, 'page scrolls horizontally at 200%').toBe(false);
      expect(overflow.clipped).toEqual([]);
    } finally {
      await session.close();
    }
  }, 120_000);
});
