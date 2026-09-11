# 0023. One browser driver for every gate that needs a browser

**Status:** Accepted
**Date:** 2026-09-12

## Context

Three of the gates in the roadmap's Stage G need a real browser, and they need it for three
different reasons.

- **Accessibility.** Spec 15 targets WCAG 2.2 AA. Contrast, focus order, accessible names
  and reading direction are properties of a rendered page and a computed accessibility
  tree. jsdom builds neither; it has no layout, so it cannot compute a contrast ratio or
  tell whether a focus ring is visible.
- **Lighthouse.** Spec 11.1 budgets LCP, CLS and the critical path at p75 on a named cheap
  Android over 4G. Lighthouse is the tool the spec names, and it drives Chrome.
- **Golden image.** Spec 16.3 asks for a perceptual diff of the reference mannequin.
  Headless WebGL in Node is not close enough to what a phone does to be worth the false
  confidence.

Left to drift, each gate picks its own driver: a jsdom shim for axe, `chrome-launcher` for
Lighthouse, and something else again for WebGL. That is three browser installs in CI, three
ways to start the application under test, and three places for a version to skew.

A second question comes with the first. Playwright and its peers ship a test runner, and
this repository already has one. Two runners means two config files, two reporters, two
sets of retry semantics, and a permanent question about which one a new test belongs in.

## Decision

**One driver: `playwright-core`, used as a library from the existing Vitest suite.**

- `playwright-core` rather than `playwright`, because the latter downloads browsers in a
  postinstall step. `pnpm-workspace.yaml` allows build scripts for exactly one package and
  says so; the browser download becomes an explicit command instead, run by CI and written
  down in CONTRIBUTING.
- Used as a library. No second test runner, no second config, no second reporter. A
  browser gate is a Vitest file that happens to open a browser.
- Two Chromium builds are installed: the headless shell for accessibility and Lighthouse,
  and full Chromium for the golden image, because the shell has no GPU stack.

**Lighthouse runs under that driver, not beside it.** It attaches over the DevTools
protocol to the Chromium `playwright-core` launched, so the spec's named tool measures the
page without a second browser install.

**With applied throttling, not simulated.** Lighthouse's default replays the dependency
graph and charges every request a full round trip. That is roughly right for one origin
over HTTP/1.1 and badly wrong for the multiplexed, CDN fronted deployment this is going
to: on the compose stack it turned an observed 0.9 s paint into a predicted 3.5 s one,
almost all of it modelled queueing on code split chunks a real connection fetches in
parallel. A gate that fails on a model of a deployment nobody runs teaches people to
ignore it.

**The gates skip themselves when no browser is installed**, the same way the PostgreSQL and
sandbox suites already do, and CONTRIBUTING says how to run them. CI always installs the
browser, so CI always runs them.

## Consequences

A browser in CI is the single largest thing added to the install, and it is paid once
rather than three times. The suite grows a class of test that is slower than everything
else in it by an order of magnitude, which is the price of measuring what a buyer's phone
actually does.

The skip-when-absent rule has a failure mode this repository has already been bitten by:
four suites skipped themselves for months and one of them had rotted into asserting nothing.
The mitigation is the same one applied there. CONTRIBUTING carries the command that runs
everything, and CI runs everything on every pull request, so a gate that stops working
fails within a day rather than at the next audit.

Using Vitest rather than Playwright's runner costs the features that runner provides:
trace viewer, retries, parallel sharding across browsers, and the codegen tooling. None of
those is needed by three gates that each drive one page in one browser. If Talla ever wants
a real cross-browser end-to-end suite, that is the point to revisit this, and the driver
will already be here.

## Alternatives considered

**Puppeteer.** Lighthouse's own integration path, and lighter. It drives Chrome only, which
is fine today and not fine on the day the test matrix in spec 11.1 asks for Safari, which
it does: the matrix names an iPhone. Playwright reaches WebKit with no second driver.

**jsdom plus axe for accessibility only, browsers for the rest.** Cheaper and dishonest.
axe in jsdom silently skips every rule that needs layout, which is most of the ones that
matter here, and reports a pass.

**A browser in a Docker container.** The daemon is already a dependency of the image
worker, so this is not a new one. It is slower per run, it makes local debugging harder,
and the version skew it prevents is already prevented by the lockfile.
