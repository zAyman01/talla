/**
 * The schema lives in docs, not in this package, because it is a documented contract
 * first and a build input second (ADR-0015). One place resolves it, so a move is one
 * edit rather than a hunt.
 */
export const schemaPath = new URL(
  '../../../docs/architecture/garment-spec.schema.json',
  import.meta.url,
);

export const generatedTypesPath = new URL('./generated/garment-spec.ts', import.meta.url);
