import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  changeMasterPassword, createVault, generatePassword, newEntry, openVault, openVaultWithKey, parseLine, sealVault,
  VaultError, WrongPasswordError,
} from '../src/vault/format.ts';
import { nodeCrypto as c } from './nodeCrypto.mjs';

const DESKTOP = join(dirname(fileURLToPath(import.meta.url)), '..', 'desktop');
const FAST_KDF = { name: 'argon2id', iterations: 1, memory_kib: 1024, lanes: 1 };

async function fastSession(password) {
  const salt = c.randomBytes(16);
  return { key: await c.argon2id(c.utf8Encode(password), salt, FAST_KDF), salt, kdf: { ...FAST_KDF }, entries: [] };
}

test('ida e volta, com senha contendo ":" e acentos', async () => {
  const s = await fastSession('mestra-forte-123');
  s.entries.push(newEntry(c, 'Gov.br', 'joão@x.com', 'a:b:ç'));
  const back = await openVault(c, sealVault(c, s), 'mestra-forte-123');
  assert.equal(back.entries[0].password, 'a:b:ç');
  assert.equal(back.entries[0].username, 'joão@x.com');
});

test('detalhes: gravados, e cofres antigos sem o campo abrem com ""', async () => {
  const s = await fastSession('mestra-forte-123');
  s.entries.push(newEntry(c, 'Google', 'eu', 'x', 'conta do trabalho'));
  const back = await openVault(c, sealVault(c, s), 'mestra-forte-123');
  assert.equal(back.entries[0].details, 'conta do trabalho');

  delete s.entries[0].details; // simula cofre criado antes do campo existir
  const old = await openVault(c, sealVault(c, s), 'mestra-forte-123');
  assert.equal(old.entries[0].details, '');
});

test('arquivo não contém nada em texto puro', async () => {
  const s = await fastSession('mestra-forte-123');
  s.entries.push(newEntry(c, 'google', 'email@gmail.com', 'senha123'));
  const text = sealVault(c, s);
  for (const secret of ['google', 'email@gmail.com', 'senha123']) assert.ok(!text.includes(secret));
});

test('abrir com a chave guardada (digital) e com chave errada', async () => {
  const s = await fastSession('mestra-forte-123');
  s.entries.push(newEntry(c, 'Google', 'eu', 'x'));
  const text = sealVault(c, s);
  assert.equal(openVaultWithKey(c, text, s.key).entries[0].service, 'Google');
  assert.throws(() => openVaultWithKey(c, text, c.randomBytes(32)), WrongPasswordError);
});

test('trocar senha mestra', async () => {
  const s = await fastSession('senha-antiga-123');
  s.entries.push(newEntry(c, 'Google', 'eu', 'x'));
  await assert.rejects(changeMasterPassword(c, s, 'errada', 'nova-senha-456'), WrongPasswordError);

  const next = await changeMasterPassword(c, s, 'senha-antiga-123', 'nova-senha-456');
  assert.notDeepEqual(next.salt, s.salt);
  const text = sealVault(c, next);
  assert.equal((await openVault(c, text, 'nova-senha-456')).entries[0].service, 'Google');
  await assert.rejects(openVault(c, text, 'senha-antiga-123'), WrongPasswordError);
});

test('senha errada', async () => {
  const text = sealVault(c, await fastSession('mestra-forte-123'));
  await assert.rejects(openVault(c, text, 'errada'), WrongPasswordError);
});

test('adulteração do conteúdo ou do cabeçalho é detectada', async () => {
  const s = await fastSession('mestra-forte-123');
  s.entries.push(newEntry(c, 'a', 'b', 'c'));
  const doc = JSON.parse(sealVault(c, s));
  const ct = Buffer.from(doc.ciphertext, 'base64');
  ct[0] ^= 1;
  await assert.rejects(openVault(c, JSON.stringify({ ...doc, ciphertext: ct.toString('base64') }), 'mestra-forte-123'), WrongPasswordError);
  await assert.rejects(openVault(c, JSON.stringify({ ...doc, kdf: { ...doc.kdf, lanes: 2 } }), 'mestra-forte-123'), WrongPasswordError);
});

test('nonce muda a cada gravação', async () => {
  const s = await fastSession('x-senha-longa');
  assert.notEqual(JSON.parse(sealVault(c, s)).nonce, JSON.parse(sealVault(c, s)).nonce);
});

test('rejeita parâmetros de KDF absurdos', async () => {
  const doc = JSON.parse(sealVault(c, await fastSession('x-senha-longa')));
  doc.kdf.memory_kib = 1e12;
  await assert.rejects(openVault(c, JSON.stringify(doc), 'x-senha-longa'), VaultError);
  await assert.rejects(openVault(c, '{"lixo": true}', 'x'), VaultError);
});

test('parseLine', () => {
  assert.deepEqual(parseLine('google: email@gmail.com: senha123'),
    { service: 'google', username: 'email@gmail.com', password: 'senha123' });
  assert.equal(parseLine('x: y: a:b:c').password, 'a:b:c');
  for (const bad of ['google', 'google: email', ': u: p', 'g: u: ']) assert.throws(() => parseLine(bad));
});

test('gerador de senhas', () => {
  const pw = generatePassword(c, 24);
  assert.equal(pw.length, 24);
  assert.match(pw, /[a-z]/); assert.match(pw, /[A-Z]/); assert.match(pw, /[0-9]/); assert.match(pw, /[^a-zA-Z0-9]/);
  assert.notEqual(pw, generatePassword(c, 24));
  assert.match(generatePassword(c, 16, false), /^[a-zA-Z0-9]{16}$/);
});

// Compatibilidade com o app desktop (Python). Pula se o Python/cryptography não estiver disponível.
function python(code, ...args) {
  return execFileSync('python3', ['-c', code, ...args], { cwd: DESKTOP, encoding: 'utf8' });
}
let hasPython = true;
try { python('import ncofres.vault'); } catch { hasPython = false; }

test('celular -> desktop: o Python abre o cofre criado aqui (KDF padrão)', { skip: !hasPython }, async () => {
  const s = await createVault(c, 'mestra-forte-123');
  s.entries.push(newEntry(c, 'google', 'email@gmail.com', 'senha:123', 'conta pessoal'));
  const file = join(mkdtempSync(join(tmpdir(), 'ncofres-')), 'c.ncf');
  writeFileSync(file, sealVault(c, s));
  const out = python(
    'import sys; from ncofres.vault import Vault; v = Vault.open(sys.argv[1], "mestra-forte-123"); '
    + 'print(v.entries[0].password + "|" + v.entries[0].details)',
    file);
  assert.equal(out.trim(), 'senha:123|conta pessoal');
});

test('desktop -> celular: abrimos o cofre criado pelo Python', { skip: !hasPython }, async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ncofres-')), 'd.ncf');
  python(`import sys
from ncofres import vault as v
v.DEFAULT_KDF = {"name": "argon2id", "iterations": 1, "memory_kib": 1024, "lanes": 1}
x = v.Vault.create(sys.argv[1], "mestra-forte-123")
x.add(v.Entry("github", "eu", "p@ss:ção", "2FA no celular"))`, file);
  const s = await openVault(c, readFileSync(file, 'utf8'), 'mestra-forte-123');
  assert.equal(s.entries[0].password, 'p@ss:ção');
  assert.equal(s.entries[0].details, '2FA no celular');
});

test('cofre antigo (formato GDSN) abre aqui e é regravado como NCOFRES', { skip: !hasPython }, async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'ncofres-')), 'antigo.gdsn');
  python(`import sys
from ncofres import vault as v
v.DEFAULT_KDF = {"name": "argon2id", "iterations": 1, "memory_kib": 1024, "lanes": 1}
v.FORMAT = "GDSN"
x = v.Vault.create(sys.argv[1], "mestra-forte-123")
x.add(v.Entry("antigo", "eu", "pw"))`, file);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).format, 'GDSN');
  const s = await openVault(c, readFileSync(file, 'utf8'), 'mestra-forte-123');
  assert.equal(s.entries[0].service, 'antigo');
  const upgraded = sealVault(c, s);
  assert.equal(JSON.parse(upgraded).format, 'NCOFRES');
  assert.equal((await openVault(c, upgraded, 'mestra-forte-123')).entries[0].password, 'pw');
});
