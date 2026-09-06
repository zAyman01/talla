import { readFile } from 'node:fs/promises';
import { compile } from 'json-schema-to-typescript';
import { schemaPath } from './paths.ts';

const BANNER = `/**
 * Generated file. Do not edit.
 *
 * Source: docs/architecture/garment-spec.schema.json
 * Regenerate: pnpm --filter @talla/garment-spec generate
 *
 * GarmentSpec is the seam of the whole system (spec section 7). A field cannot drift
 * because no one hand-writes the type. A hand-edit here fails the drift test in CI.
 */
`;

/**
 * Produce the TypeScript source for the current schema without writing it, so the
 * generator and the drift test share one code path and cannot disagree.
 */
export async function renderTypes(): Promise<string> {
  const schema: unknown = JSON.parse(await readFile(schemaPath, 'utf8'));
  const body = await compile(schema as Parameters<typeof compile>[0], 'GarmentSpec', {
    bannerComment: '',
    additionalProperties: false,
    style: { singleQuote: true, printWidth: 90 },
  });
  return `${BANNER}\n${body}`;
}
