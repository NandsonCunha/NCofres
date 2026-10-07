/**
 * Formato do cofre NCofres — idêntico ao do app desktop (desktop/ncofres/vault.py),
 * então um .ncf exportado do celular abre no PC e vice-versa.
 * Cofres antigos (formato "GDSN", extensão .gdsn) continuam abrindo e são
 * regravados no formato novo na próxima vez que forem salvos.
 *
 * Arquivo = JSON com cabeçalho em claro (parâmetros do KDF, salt, nonce) e o
 * conteúdo cifrado com AES-256-GCM. A chave vem da senha mestra via Argon2id.
 * O cabeçalho entra como AAD: qualquer alteração nele faz a abertura falhar.
 *
 * Este arquivo não importa nada do React Native: a criptografia chega por
 * `CryptoProvider`, o que permite testá-lo no Node.
 */

export const FORMAT = 'NCOFRES';
const LEGACY_FORMATS = ['GDSN'];
export const VERSION = 1;

export type KdfParams = {
  name: 'argon2id';
  iterations: number;
  memory_kib: number;
  lanes: number;
};

// 64 MiB é seguro para celulares modestos. Os parâmetros ficam gravados no
// arquivo, então um cofre criado no desktop (256 MiB) também abre aqui.
export const DEFAULT_KDF: KdfParams = { name: 'argon2id', iterations: 3, memory_kib: 65536, lanes: 4 };

// Limites para um arquivo adulterado não travar o aparelho.
const MAX_MEMORY_KIB = 1024 * 1024;
const MAX_ITERATIONS = 64;

export interface CryptoProvider {
  randomBytes(n: number): Uint8Array;
  argon2id(password: Uint8Array, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array>;
  /** Retorna ciphertext || tag (16 bytes), como o AESGCM do Python. */
  aesGcmEncrypt(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array;
  /** Lança erro se a tag não conferir. */
  aesGcmDecrypt(key: Uint8Array, nonce: Uint8Array, data: Uint8Array, aad: Uint8Array): Uint8Array;
  utf8Encode(text: string): Uint8Array;
  utf8Decode(bytes: Uint8Array): string;
}

export class VaultError extends Error {}
export class WrongPasswordError extends VaultError {}

export type Entry = {
  service: string;
  username: string;
  password: string;
  details: string; // descrição opcional (cofres antigos não têm: vira '')
  id: string;
  created: number; // segundos (compatível com o time.time() do Python)
  updated: number;
};

export type VaultSession = {
  key: Uint8Array;
  salt: Uint8Array;
  kdf: KdfParams;
  entries: Entry[];
};

// ------------------------------------------------------------------ entradas

export function newEntry(
  c: CryptoProvider, service: string, username: string, password: string, details = '',
): Entry {
  const now = Date.now() / 1000;
  return { service, username, password, details, id: toHex(c.randomBytes(16)), created: now, updated: now };
}

/**
 * 'google: email@gmail.com: senha123' -> campos.
 * Só os dois primeiros ':' separam, então a senha pode conter ':'.
 */
export function parseLine(line: string): { service: string; username: string; password: string } {
  const first = line.indexOf(':');
  const second = first < 0 ? -1 : line.indexOf(':', first + 1);
  if (second < 0) throw new Error('Use o formato  serviço: usuário: senha');
  const service = line.slice(0, first).trim();
  const username = line.slice(first + 1, second).trim();
  const password = line.slice(second + 1).trim();
  if (!service || !password) throw new Error('Serviço e senha não podem ficar vazios');
  return { service, username, password };
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SYMBOLS = '!@#$%&*-_=+?';

export function generatePassword(c: CryptoProvider, length = 20, symbols = true): string {
  const alphabet = LOWER + UPPER + DIGITS + (symbols ? SYMBOLS : '');
  for (;;) {
    let pw = '';
    while (pw.length < length) {
      // Rejeição: descarta bytes que causariam viés no módulo.
      const limit = 256 - (256 % alphabet.length);
      for (const b of c.randomBytes(length * 2)) {
        if (b < limit && pw.length < length) pw += alphabet[b % alphabet.length];
      }
    }
    const has = (set: string) => [...pw].some((ch) => set.includes(ch));
    if (has(LOWER) && has(UPPER) && has(DIGITS) && (!symbols || has(SYMBOLS))) return pw;
  }
}

// ------------------------------------------------------------------ cofre

export async function createVault(c: CryptoProvider, masterPassword: string): Promise<VaultSession> {
  const salt = c.randomBytes(16);
  const kdf = { ...DEFAULT_KDF };
  return { key: await deriveKey(c, masterPassword, salt, kdf), salt, kdf, entries: [] };
}

/**
 * Troca a senha mestra: confere a atual e devolve uma sessão com salt e chave novos.
 * Quem chama grava com sealVault, o que cifra o cofre inteiro de novo com a chave nova.
 */
export async function changeMasterPassword(
  c: CryptoProvider, session: VaultSession, currentPassword: string, newPassword: string,
): Promise<VaultSession> {
  const current = await deriveKey(c, currentPassword, session.salt, session.kdf);
  if (!sameKey(current, session.key)) throw new WrongPasswordError('Senha atual incorreta');
  const salt = c.randomBytes(16);
  const kdf = { ...DEFAULT_KDF };
  return { ...session, salt, kdf, key: await deriveKey(c, newPassword, salt, kdf) };
}

export async function openVault(c: CryptoProvider, fileText: string, masterPassword: string): Promise<VaultSession> {
  const file = parseVaultFile(fileText);
  return decryptVault(c, file, await deriveKey(c, masterPassword, file.salt, file.kdf));
}

/**
 * Abre com uma chave já derivada (a que o Keystore libera após a digital),
 * sem passar pelo Argon2id. Chave errada dá o mesmo erro que senha errada.
 */
export function openVaultWithKey(c: CryptoProvider, fileText: string, key: Uint8Array): VaultSession {
  return decryptVault(c, parseVaultFile(fileText), key);
}

type VaultFile = { format: string; kdf: KdfParams; salt: Uint8Array; nonce: Uint8Array; ciphertext: Uint8Array };

function parseVaultFile(fileText: string): VaultFile {
  try {
    const doc = JSON.parse(fileText);
    if (doc.format !== FORMAT && !LEGACY_FORMATS.includes(doc.format)) throw new VaultError('Não é um cofre NCofres');
    if (doc.version !== VERSION) throw new VaultError(`Versão de cofre não suportada: ${doc.version}`);
    return { format: doc.format, kdf: doc.kdf, salt: fromBase64(doc.salt), nonce: fromBase64(doc.nonce), ciphertext: fromBase64(doc.ciphertext) };
  } catch (e) {
    if (e instanceof VaultError) throw e;
    throw new VaultError(`Arquivo corrompido: ${(e as Error).message}`);
  }
}

function decryptVault(c: CryptoProvider, { format, kdf, salt, nonce, ciphertext }: VaultFile, key: Uint8Array): VaultSession {
  let plaintext: Uint8Array;
  try {
    plaintext = c.aesGcmDecrypt(key, nonce, ciphertext, aad(c, kdf, salt, format));
  } catch {
    throw new WrongPasswordError('Senha incorreta ou arquivo adulterado');
  }
  const data = JSON.parse(c.utf8Decode(plaintext));
  const entries = (data.entries ?? []).map((e: Entry) => ({ ...e, details: e.details ?? '' }));
  return { key, salt, kdf, entries };
}

/** Cifra a sessão e devolve o texto do arquivo .ncf. Nonce novo a cada chamada. */
export function sealVault(c: CryptoProvider, s: VaultSession): string {
  const entries = s.entries.map((e) => ({
    service: e.service, username: e.username, password: e.password, details: e.details ?? '',
    id: e.id, created: e.created, updated: e.updated,
  }));
  const nonce = c.randomBytes(12);
  const ciphertext = c.aesGcmEncrypt(s.key, nonce, c.utf8Encode(JSON.stringify({ entries })), aad(c, s.kdf, s.salt));
  const doc = {
    format: FORMAT,
    version: VERSION,
    kdf: s.kdf,
    salt: toBase64(s.salt),
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext),
  };
  return JSON.stringify(doc, null, 2);
}

async function deriveKey(c: CryptoProvider, password: string, salt: Uint8Array, kdf: KdfParams): Promise<Uint8Array> {
  if (kdf?.name !== 'argon2id') throw new VaultError(`KDF não suportado: ${kdf?.name}`);
  const ok = (n: unknown, min: number, max: number) => Number.isInteger(n) && (n as number) >= min && (n as number) <= max;
  if (!ok(kdf.iterations, 1, MAX_ITERATIONS) || !ok(kdf.memory_kib, 8, MAX_MEMORY_KIB) || !ok(kdf.lanes, 1, 16)) {
    throw new VaultError('Parâmetros de KDF fora dos limites');
  }
  return c.argon2id(c.utf8Encode(password), salt, kdf);
}

/**
 * AAD = json.dumps({...}, sort_keys=True) do Python, byte a byte
 * (chaves ordenadas, separadores ", " e ": ").
 */
function aad(c: CryptoProvider, kdf: KdfParams, salt: Uint8Array, format = FORMAT): Uint8Array {
  return c.utf8Encode(pyJson({ format, version: VERSION, kdf, salt: toBase64(salt) }));
}

function pyJson(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const body = Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}: ${pyJson(obj[k])}`);
    return `{${body.join(', ')}}`;
  }
  return JSON.stringify(value);
}

// ------------------------------------------------------------------ utilidades

export function sameKey(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function fromBase64(text: string): Uint8Array {
  if (typeof text !== 'string') throw new Error('campo base64 ausente');
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
