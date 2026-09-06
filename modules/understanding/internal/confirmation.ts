import type { GarmentSpec } from '@talla/garment-spec';

const editable = new Set([
  'category',
  'block_id',
  'block_version',
  'fabric',
  'sizes_available',
  'attributes',
  'attributes.sleeve_length',
  'attributes.neckline',
  'attributes.hem',
  'attributes.closure',
  'attributes.rise',
  'attributes.leg_shape',
  'style',
  'style.formality',
  'style.season',
  'style.dominant_colors',
  'style.pattern_busy',
  'style.volume',
  'style.slot',
]);

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Invalid confirmation path');
  return value as Record<string, unknown>;
}

function copyField(source: GarmentSpec, target: GarmentSpec, path: string): void {
  if (!editable.has(path)) throw new Error('Unsupported confirmation field');
  const [parent, child] = path.split('.');
  if (!parent) throw new Error('Invalid confirmation path');
  const from = record(source);
  const to = record(target);
  if (child) {
    const fromParent = record(from[parent]);
    const toParent = record(to[parent]);
    if (!Object.hasOwn(fromParent, child)) Reflect.deleteProperty(toParent, child);
    else toParent[child] = structuredClone(fromParent[child]);
  } else to[parent] = structuredClone(from[parent]);
}

export function confirmFields(spec: GarmentSpec, fields: readonly string[]): GarmentSpec {
  for (const path of fields)
    if (!editable.has(path)) throw new Error('Unsupported confirmation field');
  return {
    ...structuredClone(spec),
    confirmed_by_store: true,
    confirmed_fields: [...new Set([...spec.confirmed_fields, ...fields])].sort(),
  };
}

export function preserveConfirmations(
  next: GarmentSpec,
  previous?: GarmentSpec,
): GarmentSpec {
  const result = structuredClone(next);
  if (!previous) return result;
  if (previous.id !== next.id || previous.tenant_id !== next.tenant_id)
    throw new Error('Garment identity mismatch');
  for (const path of previous.confirmed_fields) {
    copyField(previous, result, path);
    // Preserve provenance for a whole confirmed group as well as individual fields.
    for (const [key, value] of Object.entries(previous.confidence)) {
      if (key === path || key.startsWith(`${path}.`)) result.confidence[key] = value;
    }
  }
  result.confirmed_fields = [...previous.confirmed_fields];
  result.confirmed_by_store = previous.confirmed_by_store;
  return result;
}
