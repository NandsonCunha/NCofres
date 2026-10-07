/**
 * Força de uma senha em 4 níveis, para a barra colorida abaixo da senha.
 *
 * Estimativa: comprimento × tipos de caractere usados (minúsculas, maiúsculas,
 * números, símbolos), com penalidades para senhas comuns, repetições e
 * sequências (abc, 123, qwerty). Não é uma garantia, é um guia para o usuário.
 */

export type Strength = { level: 0 | 1 | 2 | 3; label: string; color: string };

export const STRENGTH_LEVELS: Strength[] = [
  { level: 0, label: 'Fraca', color: '#ef4444' },
  { level: 1, label: 'Média fraca', color: '#f97316' },
  { level: 2, label: 'Média', color: '#eab308' },
  { level: 3, label: 'Forte', color: '#22c55e' },
];

const COMMON = [
  '123456', '12345678', '123456789', 'password', 'senha', 'qwerty', 'abc123', '111111',
  'iloveyou', 'admin', 'brasil', 'mudar123', 'senha123', 'teste', '000000', '654321',
];

const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm'];

export function passwordStrength(password: string): Strength {
  if (!password) return STRENGTH_LEVELS[0];
  const lower = password.toLowerCase();

  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/[0-9]/.test(password)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(password)) pool += 33;

  // Bits de entropia estimados; descontamos o que é previsível.
  let bits = password.length * Math.log2(Math.max(pool, 1));

  // Muitos caracteres repetidos (ex.: "aaaaaa1!").
  const distinct = new Set(password).size;
  if (distinct / password.length < 0.5) bits *= 0.6;

  // Trechos em sequência (abc, 321, qwe) com 3 ou mais caracteres.
  let sequential = 0;
  for (let i = 0; i + 3 <= lower.length; i++) {
    const chunk = lower.slice(i, i + 3);
    const reversed = [...chunk].reverse().join('');
    if (SEQUENCES.some((s) => s.includes(chunk) || s.includes(reversed))) sequential++;
  }
  bits -= sequential * 4;

  // Contém uma senha muito comum: no máximo "Fraca".
  if (COMMON.some((c) => lower.includes(c))) return STRENGTH_LEVELS[0];

  if (bits < 36) return STRENGTH_LEVELS[0];
  if (bits < 55) return STRENGTH_LEVELS[1];
  // "Forte" exige também comprimento mínimo de 12.
  if (bits < 75 || password.length < 12) return STRENGTH_LEVELS[2];
  return STRENGTH_LEVELS[3];
}
