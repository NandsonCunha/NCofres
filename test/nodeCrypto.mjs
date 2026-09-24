// CryptoProvider para testes no Node: AES-GCM do node:crypto e Argon2id do @noble/hashes
// (mesmo algoritmo do OpenSSL usado no celular).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { argon2idAsync } from '@noble/hashes/argon2.js';

export const nodeCrypto = {
  randomBytes: (n) => new Uint8Array(randomBytes(n)),
  argon2id: (password, salt, kdf) =>
    argon2idAsync(password, salt, { t: kdf.iterations, m: kdf.memory_kib, p: kdf.lanes, dkLen: 32 }),
  aesGcmEncrypt(key, nonce, plaintext, aad) {
    const c = createCipheriv('aes-256-gcm', key, nonce);
    c.setAAD(aad);
    return new Uint8Array(Buffer.concat([c.update(plaintext), c.final(), c.getAuthTag()]));
  },
  aesGcmDecrypt(key, nonce, data, aad) {
    const d = createDecipheriv('aes-256-gcm', key, nonce);
    d.setAAD(aad);
    d.setAuthTag(data.subarray(data.length - 16));
    return new Uint8Array(Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]));
  },
  utf8Encode: (t) => new Uint8Array(Buffer.from(t, 'utf8')),
  utf8Decode: (b) => Buffer.from(b).toString('utf8'),
};
