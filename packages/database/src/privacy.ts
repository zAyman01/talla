import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { reveal, type Sensitive } from '@talla/sensitive';

/**
 * A buyer as the rest of the system carries them: three concealed strings. Nothing
 * downstream of the request boundary holds the plaintext (ADR-0020).
 */
export interface SensitiveBuyer {
  readonly name: Sensitive<string>;
  readonly phone: Sensitive<string>;
  readonly address: Sensitive<string>;
}

/** Everything commerce needs about a buyer, and nothing it could accidentally print. */
export interface SealedBuyer {
  readonly ciphertext: string;
  readonly phoneHash: string;
}

export interface PrivacyBox {
  readonly seal: (value: unknown, tenantId: string) => string;
  readonly open: (ciphertext: string, tenantId: string) => unknown;
  readonly phoneHash: (phone: string) => string;
  /**
   * The one place a buyer's plaintext is unwrapped, because it is the place that
   * encrypts it. Returns the ciphertext and the phone index together: commerce needs
   * both and they are derived from the same values, so handing them back in one call
   * means the caller never holds a reason to unwrap anything itself.
   */
  readonly sealBuyer: (buyer: SensitiveBuyer, tenantId: string) => SealedBuyer;
}
export function createPrivacyBox(
  encryptionKey: Uint8Array,
  indexKey: Uint8Array,
): PrivacyBox {
  if (encryptionKey.length !== 32 || indexKey.length !== 32)
    throw new Error('Privacy keys must each contain 32 bytes');

  const seal = (value: unknown, tenantId: string): string => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    cipher.setAAD(Buffer.from(tenantId));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [
      'v1',
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      bytes.toString('base64url'),
    ].join('.');
  };

  const phoneHash = (phone: string): string =>
    createHmac('sha256', indexKey).update(phone).digest('hex');

  return {
    seal,
    open(ciphertext, tenantId): unknown {
      const [version, iv, tag, data] = ciphertext.split('.');
      if (version !== 'v1' || !iv || !tag || !data)
        throw new Error('Invalid encrypted record');
      const cipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        Buffer.from(iv, 'base64url'),
      );
      cipher.setAAD(Buffer.from(tenantId));
      cipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return JSON.parse(
        Buffer.concat([
          cipher.update(Buffer.from(data, 'base64url')),
          cipher.final(),
        ]).toString('utf8'),
      ) as unknown;
    },
    phoneHash,
    sealBuyer(buyer, tenantId): SealedBuyer {
      // `reveal` here is legitimate and named as such in packages/sensitive: this
      // function exists to turn the plaintext into ciphertext and an index.
      const plain = {
        name: reveal(buyer.name),
        phone: reveal(buyer.phone),
        address: reveal(buyer.address),
      };
      return { ciphertext: seal(plain, tenantId), phoneHash: phoneHash(plain.phone) };
    },
  };
}
