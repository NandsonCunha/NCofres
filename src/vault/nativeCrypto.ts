import { argon2, Buffer, createCipheriv, createDecipheriv, randomBytes } from 'react-native-quick-crypto';

import type { CryptoProvider } from './format';

/** Criptografia nativa (OpenSSL via react-native-quick-crypto). */
export const nativeCrypto: CryptoProvider = {
  randomBytes: (n) => new Uint8Array(randomBytes(n)),

  argon2id: (password, salt, kdf) =>
    new Promise((resolve, reject) =>
      argon2(
        'argon2id',
        {
          message: Buffer.from(password),
          nonce: Buffer.from(salt),
          parallelism: kdf.lanes,
          memory: kdf.memory_kib,
          passes: kdf.iterations,
          tagLength: 32,
        },
        (err, key) => (err ? reject(err) : resolve(new Uint8Array(key))),
      ),
    ),

  aesGcmEncrypt(key, nonce, plaintext, aad) {
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    cipher.setAAD(Buffer.from(aad));
    const body = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    return new Uint8Array(Buffer.concat([body, cipher.getAuthTag()]));
  },

  aesGcmDecrypt(key, nonce, data, aad) {
    if (data.length < 16) throw new Error('dados curtos demais');
    const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(data.subarray(data.length - 16)));
    const body = decipher.update(Buffer.from(data.subarray(0, data.length - 16)));
    return new Uint8Array(Buffer.concat([body, decipher.final()]));
  },

  utf8Encode: (text) => new Uint8Array(Buffer.from(text, 'utf8')),
  utf8Decode: (bytes) => Buffer.from(bytes).toString('utf8'),
};
