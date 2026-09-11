import { describe, expect, it } from 'vitest';
import { conceal } from '@talla/sensitive';
import { createLogger, redact, timed } from '../src/index.ts';
import type { Logger } from '../src/index.ts';

function capture(policy: 'throw' | 'report' = 'report'): {
  logger: Logger;
  lines: string[];
} {
  const lines: string[] = [];
  const logger = createLogger({
    sink: (line) => lines.push(line),
    now: () => new Date('2026-09-11T09:00:00.000Z'),
    policy,
  });
  return { logger, lines };
}

describe('the type is the real defence', () => {
  it('does not compile a concealed value at a log site', () => {
    const { logger } = capture();
    const phone = conceal('+201000000000');

    expect(() => {
      // @ts-expect-error a Sensitive is an object, and a log field is a primitive. This
      // line failing to compile is the whole point of ADR-0020; if the error above ever
      // becomes unused, the wrapper has stopped protecting anything.
      logger.info('order.placed', { phone });
      // The throw proves the second layer. `@ts-expect-error` suppresses the type error
      // but still emits the call, so both layers are exercised by this one line.
    }).toThrow(/field phone carries a concealed value/);
  });

  it('refuses a concealed value that arrives through a cast', () => {
    const { logger } = capture();
    // The runtime guard behind the type, for a value that came in through `any`.
    const smuggled = { phone: conceal('+201000000000') } as unknown as Record<
      string,
      string
    >;

    expect(() => {
      logger.info('order.placed', smuggled);
    }).toThrow(/field phone carries a concealed value/);
  });
});

describe('log lines', () => {
  it('writes one JSON object per line with the level and event', () => {
    const { logger, lines } = capture();
    logger.info('order.placed', { orderId: 'a1b2', total: 17500 });

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toEqual({
      level: 'info',
      event: 'order.placed',
      at: '2026-09-11T09:00:00.000Z',
      orderId: 'a1b2',
      total: 17500,
    });
  });

  it('carries bound fields onto every line from a child', () => {
    const { logger, lines } = capture();
    const request = logger.child({ traceId: 'trace-1', tenantId: 'tenant-9' });

    request.info('catalog.read', { garments: 12 });
    request.warn('stock.low', { garmentId: 'g1' });

    for (const line of lines) {
      const record = JSON.parse(line) as Record<string, unknown>;
      expect(record['traceId']).toBe('trace-1');
      expect(record['tenantId']).toBe('tenant-9');
    }
    expect(lines).toHaveLength(2);
  });

  it('does not let a child leak its bindings back to the parent', () => {
    const { logger, lines } = capture();
    logger.child({ traceId: 'trace-1' }).info('a');
    logger.info('b');

    const second = JSON.parse(lines[1] ?? '{}') as Record<string, unknown>;
    expect(second['traceId']).toBeUndefined();
  });
});

describe('the redactor', () => {
  it('catches a phone number typed into a free text field', () => {
    // This is the hole the type system cannot close: a legitimate string field carrying
    // a number somebody typed into a delivery note.
    expect(redact('{"note":"call me on +201000000000"}')).toEqual({
      line: '{"note":"call me on [redacted]"}',
      redacted: true,
    });
  });

  it('catches a number written without a country code or with separators', () => {
    for (const written of ['01000000000', '010 000 0000', '(010) 000-0000']) {
      expect(redact(`{"note":"${written}"}`).redacted, written).toBe(true);
    }
  });

  it('does not mistake a digit-heavy uuid for a phone number', () => {
    // A trace id whose first two groups are all digits is twelve digits with a
    // separator. Counting alone cannot tell it from a phone number, so the scanner has
    // to recognise the shape. This failed about one run in a few hundred before.
    for (const id of [
      '12345678-1234-4123-8123-123456789012',
      '00000000-0000-4000-8000-000000000000',
      '7054ce3a-ac0c-40a1-89f2-0ef81aaa2d49',
    ]) {
      expect(redact(`{"traceId":"${id}"}`).redacted, id).toBe(false);
    }
  });

  it('leaves a timestamp alone whether or not it carries a time', () => {
    for (const at of ['2026-09-11', '2026-09-11T09:00:10.000Z', '2026-09-11T09:00:10']) {
      expect(redact(`{"at":"${at}"}`).redacted, at).toBe(false);
    }
  });

  it('still catches a phone number sitting next to an identifier', () => {
    const line =
      '{"traceId":"12345678-1234-4123-8123-123456789012","note":"call +201000000000"}';
    const result = redact(line);
    expect(result.redacted).toBe(true);
    expect(result.line).toContain('12345678-1234-4123-8123-123456789012');
    expect(result.line).not.toContain('201000000000');
  });

  it('leaves ordinary log content alone', () => {
    for (const line of [
      '{"event":"order.placed","total":17500,"durationMs":42}',
      '{"reference":"A1B2C3D4E5F6"}',
      '{"traceId":"9c037b57-b6a9-42a2-bc6b-898a06676bc1"}',
    ]) {
      expect(redact(line), line).toEqual({ line, redacted: false });
    }
  });

  it('throws under the test policy, because a hit means a hole upstream', () => {
    const { logger } = capture('throw');

    expect(() => {
      logger.info('order.placed', { note: 'ring +201000000000 on arrival' });
    }).toThrow(/contained phone-shaped text/);
  });

  it('redacts and reports under the production policy rather than failing the request', () => {
    const { logger, lines } = capture('report');
    logger.info('order.placed', { note: 'ring +201000000000 on arrival' });

    expect(lines).toHaveLength(2);
    const report = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(report['event']).toBe('observability.redaction');
    expect(report['redactedEvent']).toBe('order.placed');
    // The report must not be the leak it is reporting.
    expect(lines[0]).not.toContain('201000000000');
    expect(lines[1]).not.toContain('201000000000');
    expect(lines[1]).toContain('[redacted]');
  });
});

describe('a complete buyer record', () => {
  it('produces no phone digits when logged the way the code is meant to log it', () => {
    const { logger, lines } = capture('throw');
    const buyer = {
      name: conceal('ليلى'),
      phone: conceal('+201000000000'),
      address: conceal('12 شارع الجمهورية، القاهرة'),
    };

    // What a real call site is allowed to say about an order: identifiers and outcomes.
    logger.child({ traceId: 'trace-1' }).info('order.placed', {
      orderId: 'a1b2',
      reference: 'A1B2C3D4E5F6',
      total: 17500,
    });

    const written = lines.join('\n');
    expect(written).not.toContain('201000000000');
    expect(written).not.toContain('ليلى');
    expect(written).not.toContain('الجمهورية');
    // And the buyer object is still intact for the code that legitimately needs it.
    expect(JSON.stringify(buyer)).not.toContain('201000000000');
  });
});

describe('timed', () => {
  it('records a duration and an outcome on success', async () => {
    const { logger, lines } = capture();
    const result = await timed(logger, 'catalog.read', () => Promise.resolve(7), {
      tenantId: 't1',
    });

    expect(result).toBe(7);
    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record['outcome']).toBe('ok');
    expect(record['tenantId']).toBe('t1');
    expect(typeof record['durationMs']).toBe('number');
  });

  it('logs the error class, never its message, and rethrows', async () => {
    const { logger, lines } = capture();
    class StockError extends Error {
      override name = 'StockError';
    }

    await expect(
      timed(logger, 'order.place', () =>
        Promise.reject(new StockError('buyer +201000000000 at 12 شارع')),
      ),
    ).rejects.toThrow(StockError);

    const record = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(record['outcome']).toBe('failed');
    expect(record['errorName']).toBe('StockError');
    // An exception message is the most common way an address reaches a log line.
    expect(lines[0]).not.toContain('201000000000');
    expect(lines[0]).not.toContain('شارع');
  });
});
