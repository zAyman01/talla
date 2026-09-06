import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export interface PrivacyBox {
  seal(value: unknown, tenantId: string): string;
  open(ciphertext: string, tenantId: string): unknown;
  phoneHash(phone: string): string;
}
export function createPrivacyBox(encryptionKey: Uint8Array, indexKey: Uint8Array): PrivacyBox {
  if (encryptionKey.length !== 32 || indexKey.length !== 32) throw new Error('Privacy keys must each contain 32 bytes');
  return {
    seal(value, tenantId): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
      cipher.setAAD(Buffer.from(tenantId));
      const bytes = Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
      return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
    },
    open(ciphertext, tenantId): unknown {
      const [version,iv,tag,data] = ciphertext.split('.');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Invalid encrypted record');
      const cipher = createDecipheriv('aes-256-gcm',encryptionKey,Buffer.from(iv,'base64url'));
      cipher.setAAD(Buffer.from(tenantId));
      cipher.setAuthTag(Buffer.from(tag,'base64url'));
      return JSON.parse(Buffer.concat([cipher.update(Buffer.from(data,'base64url')),cipher.final()]).toString('utf8')) as unknown;
    },
    phoneHash: (phone) => createHmac('sha256',indexKey).update(phone).digest('hex'),
  };
}
