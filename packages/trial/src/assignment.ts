import { createHmac } from 'node:crypto';

export interface Assignment {
  readonly cohort: 'control' | 'viewer';
  readonly pseudonym: string;
}

/** Device ID is a random first-party cookie, never a phone number or fingerprint.
 * The secret and experiment ID stay fixed for the preregistered pilot window. */
export function assignExperiment(
  secret: Uint8Array,
  experimentId: string,
  tenantId: string,
  deviceId: string,
): Assignment {
  if (secret.byteLength < 32 || !experimentId || !tenantId || !deviceId)
    throw new Error('Invalid experiment configuration');
  const digest = createHmac('sha256', secret)
    .update(JSON.stringify([experimentId, tenantId, deviceId]))
    .digest();
  const bucket = digest.readUInt32BE(0) / 0x1_0000_0000;
  return {
    cohort: bucket < 0.2 ? 'control' : 'viewer',
    pseudonym: digest.toString('hex'),
  };
}
