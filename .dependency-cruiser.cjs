/**
 * Module boundaries, as data.
 *
 * Spec 16.2: a module may import another module only through its published interface,
 * never its internals, and this is enforced by a linter rather than by discipline. With
 * two people and no review quorum, an unenforced boundary is a boundary that will be
 * gone in six weeks.
 *
 * Paths are matched loosely rather than anchored at the repository root, so the same
 * rules apply to the planted fixture the boundary test runs them against.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-module-internals',
      comment:
        'A module is imported through its index.ts only. Everything under internal/ belongs to the module that owns it.',
      severity: 'error',
      from: { path: '(^|/)modules/([^/]+)/' },
      to: { path: '(^|/)modules/(?!$2/)[^/]+/internal/' },
    },
    {
      name: 'no-worker-into-module-internals',
      comment: 'Workers consume published interfaces, the same as anything else.',
      severity: 'error',
      from: { path: '(^|/)workers/' },
      to: { path: '(^|/)modules/[^/]+/internal/' },
    },
    {
      name: 'no-module-imports-app',
      comment:
        'Apps compose modules. A module that reaches back into an app cannot be extracted, and the published interface is meant to be the extraction seam.',
      severity: 'error',
      from: { path: '(^|/)(modules|packages|workers)/' },
      to: { path: '(^|/)apps/' },
    },
    {
      name: 'no-utils-module',
      comment:
        'There is no utils module and there will not be one. It is where boundaries go to die (spec 16.2). Shared code goes in modules/shared.',
      severity: 'error',
      from: {},
      to: { path: '(^|/)utils(/|$)' },
    },
    {
      name: 'no-shared-depends-on-module',
      comment:
        'shared is a leaf. A shared package that imports a module is a cycle waiting for its second import.',
      severity: 'error',
      from: { path: '(^|/)modules/shared/' },
      to: { path: '(^|/)modules/(?!shared/)[^/]+/' },
    },
    {
      name: 'no-generated-outside-its-package',
      comment:
        'Generated contract types are reached through the package that owns them, so a regeneration is one import surface to check rather than many.',
      severity: 'error',
      from: { pathNot: '(^|/)packages/garment-spec/' },
      to: { path: '(^|/)packages/garment-spec/src/generated/' },
    },
    {
      name: 'no-circular',
      comment: 'A cycle between modules means one of the two boundaries is wrong.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)node_modules/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.base.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'types', 'default'],
      extensions: ['.ts', '.js', '.json'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
