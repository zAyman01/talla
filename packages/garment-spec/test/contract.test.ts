import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateGarmentSpec, schemaId } from '../src/validate.ts';

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'),
  );
}

describe('validateGarmentSpec', () => {
  it('accepts a complete spec', () => {
    const result = validateGarmentSpec(fixture('valid-tee.json'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.category).toBe('tee');
      expect(result.value.style.slot).toBe('top');
    }
  });

  it('rejects a spec missing a required object and names the field', () => {
    const result = validateGarmentSpec(fixture('invalid-missing-color-profile.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('color_profile');
    }
  });

  it('rejects an unknown field rather than ignoring it', () => {
    // Price never travels in a GarmentSpec: it lives in commerce and is server
    // authoritative (spec 12.5). additionalProperties: false is what enforces that.
    const result = validateGarmentSpec(fixture('invalid-unknown-field.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('price_egp');
    }
  });

  it('rejects a malformed spec_version', () => {
    const result = validateGarmentSpec(fixture('invalid-spec-version.json'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toContain('/spec_version');
    }
  });

  it('rejects values that are not objects at all', () => {
    expect(validateGarmentSpec(null).ok).toBe(false);
    expect(validateGarmentSpec('a string').ok).toBe(false);
    expect(validateGarmentSpec(42).ok).toBe(false);
  });

  it('reports which contract version it validated against', () => {
    expect(schemaId).toBe('https://talla.app/schemas/garment-spec/v1.json');
  });
});
