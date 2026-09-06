import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { errorCatalog, toWireError, type ErrorCode } from '../src/index.ts';

const codes = Object.keys(errorCatalog) as ErrorCode[];
const userFacing = codes.filter((code) => errorCatalog[code].audience !== 'internal');

describe('error catalog', () => {
  it('gives every user-facing code a message and a fix action in both languages', () => {
    for (const code of userFacing) {
      const entry = errorCatalog[code];
      expect(entry.message?.ar, `${code} has no Arabic message`).toBeTruthy();
      expect(entry.message?.en, `${code} has no English message`).toBeTruthy();
      expect(entry.fixAction?.ar, `${code} has no Arabic fix action`).toBeTruthy();
      expect(entry.fixAction?.en, `${code} has no English fix action`).toBeTruthy();
    }
  });

  it('contains no em-dash in anything a user sees', () => {
    // CLAUDE.md rule 6. An em-dash in Arabic copy reads as a translation artefact, and
    // the primary market notices immediately.
    for (const code of userFacing) {
      const entry = errorCatalog[code];
      const strings = [
        entry.message?.ar,
        entry.message?.en,
        entry.fixAction?.ar,
        entry.fixAction?.en,
      ];
      for (const value of strings) {
        expect(value ?? '', `${code} contains an em-dash`).not.toContain('—');
      }
    }
  });

  it('gives internal codes a note instead of copy', () => {
    for (const code of codes.filter((c) => errorCatalog[c].audience === 'internal')) {
      const entry = errorCatalog[code];
      expect(entry.message, `${code} is internal but carries user copy`).toBeUndefined();
      expect(entry.note, `${code} is internal with no note for the trace`).toBeTruthy();
    }
  });

  it('covers every code named in the taxonomy document', async () => {
    const document = await readFile(
      new URL('../../../docs/architecture/error-taxonomy.md', import.meta.url),
      'utf8',
    );
    const documented = new Set(
      [...document.matchAll(/`([A-Z]+_[A-Z_]+)`/g)].map((match) => match[1]),
    );
    for (const code of documented) {
      expect(codes, `${String(code)} is documented but not in the catalog`).toContain(
        code,
      );
    }
  });
});

describe('toWireError', () => {
  it('emits exactly the documented shape', () => {
    const wire = toWireError('INGEST_BACK_PHOTO_MISSING', 'trace-123');
    expect(Object.keys(wire).sort()).toEqual([
      'code',
      'fix_action',
      'http_status',
      'retryable',
      'trace_id',
      'user_message',
    ]);
    expect(wire.code).toBe('INGEST_BACK_PHOTO_MISSING');
    expect(wire.http_status).toBe(422);
    expect(wire.user_message.ar).toBe('صورة الخلف مفقودة.');
    expect(wire.trace_id).toBe('trace-123');
  });

  it('collapses an internal code to INTERNAL_ERROR and keeps the trace ID', () => {
    const wire = toWireError('SOLVE_NON_CONVERGENT', 'trace-456');
    expect(wire.code).toBe('INTERNAL_ERROR');
    expect(wire.http_status).toBe(500);
    expect(wire.trace_id).toBe('trace-456');
    expect(JSON.stringify(wire)).not.toContain('SOLVE_NON_CONVERGENT');
  });

  it('never leaks the budget failure reason to a buyer', () => {
    const wire = toWireError('ASSET_OVER_BUDGET', 'trace-789');
    expect(wire.code).toBe('INTERNAL_ERROR');
  });
});
