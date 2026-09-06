import { readFileSync } from 'node:fs';
import Ajv2020, { type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { schemaPath } from './paths.ts';
import type { GarmentSpec } from './generated/garment-spec.ts';

export type { GarmentSpec } from './generated/garment-spec.ts';

export type ValidationResult =
  { ok: true; value: GarmentSpec } | { ok: false; errors: string[] };

/**
 * The validator is compiled from the same file the types are generated from, so the
 * runtime check and the compile-time type cannot disagree. Spec section 7 calls this
 * enforcement point 1.
 */
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const schema: unknown = JSON.parse(readFileSync(schemaPath, 'utf8'));
const validate: ValidateFunction = ajv.compile(schema as object);

function describe(error: ErrorObject): string {
  const path = error.instancePath === '' ? '(root)' : error.instancePath;
  const params = error.params as {
    additionalProperty?: string;
    missingProperty?: string;
    allowedValues?: readonly unknown[];
  };
  // Ajv keeps the offending field name in params rather than in the message, and a
  // rejection that does not name the field costs somebody an afternoon.
  const subject =
    params.additionalProperty ??
    params.missingProperty ??
    params.allowedValues?.join(', ');
  const detail = subject === undefined ? '' : `: ${subject}`;
  return `${path} ${error.message ?? 'is invalid'}${detail}`;
}

/** Validate an untrusted value against the frozen contract. */
export function validateGarmentSpec(value: unknown): ValidationResult {
  if (validate(value)) {
    return { ok: true, value: value as GarmentSpec };
  }
  const errors = (validate.errors ?? []).map(describe);
  return { ok: false, errors };
}

/** The schema's own version, for callers that record which contract they read. */
export const schemaId: string = (schema as { $id: string }).$id;
