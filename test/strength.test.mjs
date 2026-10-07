import assert from 'node:assert/strict';
import { test } from 'node:test';

import { passwordStrength } from '../src/strength.ts';

const level = (pw) => passwordStrength(pw).label;

test('força da senha: exemplos de cada nível', () => {
  for (const pw of ['', '123456', 'senha123', 'abc', 'aaaaaaaa', 'Brasil2024']) assert.equal(level(pw), 'Fraca', pw);
  assert.equal(level('gatoazul9'), 'Média fraca');
  assert.equal(level('Gato.Azul92'), 'Média');
  for (const pw of ['r7?HCO*p6!yZcIZ4ap%K', 'Cavalo-Bateria-Grampo-42']) assert.equal(level(pw), 'Forte', pw);
});

test('senha gerada pelo app é sempre forte', async () => {
  const { generatePassword } = await import('../src/vault/format.ts');
  const { nodeCrypto } = await import('./nodeCrypto.mjs');
  for (let i = 0; i < 50; i++) assert.equal(level(generatePassword(nodeCrypto)), 'Forte');
});
