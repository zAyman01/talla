import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/index.ts';
import { reveal } from '@talla/sensitive';

/** A distinct, valid 32 byte key per seed. */
const key = (seed: number): string => Buffer.alloc(32, seed).toString('base64');

const PASSWORD = 'sup3rs3cr3tpassw0rd';

const valid = (): Record<string, string> => ({
  NODE_ENV: 'test',
  TALLA_DATABASE_URL: `postgresql://talla_app:${PASSWORD}@db.internal:5432/talla`,
  TALLA_MIGRATION_DATABASE_URL: 'postgresql://talla_migrate@db.internal:5432/talla',
  TALLA_ENCRYPTION_KEY: key(1),
  TALLA_INDEX_KEY: key(2),
  TALLA_PHONE_SECRET: key(3),
  TALLA_SESSION_SECRET: key(4),
  TALLA_ADMIN_HOST: 'admin.talla.app',
  TALLA_STOREFRONT_ROOT_DOMAIN: 'talla.app',
  TALLA_ASSET_ENDPOINT: 'https://eu-central-1.storage.example',
  TALLA_ASSET_BUCKET: 'talla-assets',
  TALLA_ASSET_ACCESS_KEY: 'AKIAEXAMPLE',
  TALLA_ASSET_SECRET_KEY: 'secret-access-key',
  TALLA_OTP_CHANNEL: 'log',
  TALLA_RETENTION_DAYS: '90',
});

describe('readConfig', () => {
  it('accepts a complete environment', () => {
    const config = readConfig(valid());

    expect(config.nodeEnv).toBe('test');
    expect(config.adminHost).toBe('admin.talla.app');
    expect(config.otpChannel).toBe('log');
    expect(config.retentionDays).toBe(90);
    expect(reveal(config.encryptionKey)).toHaveLength(32);
  });

  it('refuses a retention window that is missing, fractional, or out of range', () => {
    // Spec 12.7 says define the window before the first pilot. A process that starts
    // without one has not defined it, and nobody discovers that until an audit.
    const missing = valid();
    delete missing['TALLA_RETENTION_DAYS'];
    expect(() => readConfig(missing)).toThrow(/TALLA_RETENTION_DAYS is missing/);

    for (const value of ['0', '366', '30.5', 'ninety', '-1']) {
      const env = { ...valid(), TALLA_RETENTION_DAYS: value };
      expect(() => readConfig(env), value).toThrow(
        /TALLA_RETENTION_DAYS must be a whole number/,
      );
    }
  });

  it('defaults NODE_ENV to development rather than guessing production', () => {
    const env = valid();
    delete env['NODE_ENV'];
    expect(readConfig(env).nodeEnv).toBe('development');
  });
});

describe('readConfig problem reporting', () => {
  it('reports every problem at once, not the first', () => {
    const env = valid();
    delete env['TALLA_DATABASE_URL'];
    delete env['TALLA_ADMIN_HOST'];
    env['TALLA_INDEX_KEY'] = 'not base64 at all';

    // An operator fixing a deployment one failed boot at a time is a self-inflicted
    // outage, so all three must appear in one message.
    let message = '';
    try {
      readConfig(env);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('TALLA_DATABASE_URL');
    expect(message).toContain('TALLA_ADMIN_HOST');
    expect(message).toContain('TALLA_INDEX_KEY');
    expect(message).toContain('3 problem(s)');
  });

  it('never puts a value in the message', () => {
    const env = valid();
    env['TALLA_DATABASE_URL'] = `postgresql://talla_app:${PASSWORD}@db:5432/talla?x`;
    env['TALLA_ADMIN_HOST'] = 'ADMIN_HOST_REJECTED_VALUE';
    // Force a failure so the whole message is produced with the password present in env.
    delete env['TALLA_PHONE_SECRET'];

    let message = '';
    try {
      readConfig(env);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    // A configuration error that prints what it rejected prints a database password
    // into a deployment log.
    expect(message).not.toContain(PASSWORD);
    expect(message).not.toContain('ADMIN_HOST_REJECTED_VALUE');
    // The name still has to be there, or the operator cannot find what to fix.
    expect(message).toContain('TALLA_ADMIN_HOST');
  });

  it('rejects a key that does not decode to 32 bytes, and says which length arrived', () => {
    const env = valid();
    env['TALLA_SESSION_SECRET'] = Buffer.alloc(16, 9).toString('base64');

    expect(() => readConfig(env)).toThrow(/TALLA_SESSION_SECRET.*32 bytes, got 16/s);
  });

  it('rejects two secrets that are the same value', () => {
    const env = valid();
    env['TALLA_INDEX_KEY'] = env['TALLA_ENCRYPTION_KEY'] ?? '';

    expect(() => readConfig(env)).toThrow(
      /TALLA_INDEX_KEY must differ from TALLA_ENCRYPTION_KEY/,
    );
  });

  it('reports a missing secret as missing rather than as a duplicate', () => {
    const env = valid();
    delete env['TALLA_INDEX_KEY'];
    delete env['TALLA_PHONE_SECRET'];

    let message = '';
    try {
      readConfig(env);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('TALLA_INDEX_KEY is missing');
    expect(message).not.toContain('must differ from');
  });

  it('refuses a database URL that is not postgresql', () => {
    const env = valid();
    env['TALLA_DATABASE_URL'] = 'mysql://db.internal:3306/talla';

    expect(() => readConfig(env)).toThrow(/TALLA_DATABASE_URL is not a postgresql/);
  });

  it('refuses OTP codes going to the log in production', () => {
    const env = valid();
    env['NODE_ENV'] = 'production';

    // Codes printed to stdout in production is an authentication bypass for anyone who
    // can read a deployment log.
    expect(() => readConfig(env)).toThrow(/TALLA_OTP_CHANNEL must not be log/);
  });

  it('allows OTP codes going to the log outside production', () => {
    expect(() => readConfig({ ...valid(), NODE_ENV: 'development' })).not.toThrow();
  });

  it('accepts a host with a port so local development needs no special case', () => {
    const env = valid();
    env['TALLA_ADMIN_HOST'] = 'admin.localhost:3001';
    env['TALLA_STOREFRONT_ROOT_DOMAIN'] = 'localhost:3000';

    expect(readConfig(env).adminHost).toBe('admin.localhost:3001');
  });
});
