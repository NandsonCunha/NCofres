import * as SecureStore from 'expo-secure-store';

import { fromBase64, toBase64 } from './vault/format';

/**
 * Desbloqueio com digital, no mesmo esquema dos bancos.
 *
 * A chave do cofre (32 bytes, derivada da senha mestra) fica guardada no
 * Android Keystore / iOS Keychain, trancada por biometria forte: o chip de
 * segurança só a libera depois que o sistema confirma a digital. O app nunca
 * vê a digital, e a senha mestra continua não sendo gravada em lugar nenhum.
 *
 * Se uma digital for adicionada ou removida no celular, o sistema invalida a
 * chave guardada e o app volta a pedir a senha mestra.
 */

const KEY_ITEM = 'ncofres.vaultKey';
const META_ITEM = 'ncofres.biometric'; // sem biometria: só datas e flags, nada secreto

// Por segurança (e para não esquecer a senha mestra), ela é pedida de novo a cada 7 dias.
export const PASSWORD_EVERY_DAYS = 7;

type Meta = { enabled: boolean; asked: boolean; lastPasswordAt: number };

async function readMeta(): Promise<Meta> {
  try {
    const raw = await SecureStore.getItemAsync(META_ITEM);
    if (raw) return { enabled: false, asked: false, lastPasswordAt: 0, ...JSON.parse(raw) };
  } catch {
    // leitura falhou: trata como desativado
  }
  return { enabled: false, asked: false, lastPasswordAt: 0 };
}

async function writeMeta(changes: Partial<Meta>): Promise<void> {
  await SecureStore.setItemAsync(META_ITEM, JSON.stringify({ ...(await readMeta()), ...changes }));
}

export function biometricSupported(): boolean {
  try {
    return SecureStore.canUseBiometricAuthentication();
  } catch {
    return false;
  }
}

export type BiometricState = {
  supported: boolean;
  enabled: boolean;
  /** Já foi oferecido uma vez após digitar a senha. */
  asked: boolean;
  /** Passou o prazo: a digital fica indisponível até a senha mestra ser digitada. */
  passwordDue: boolean;
};

export async function getBiometricState(): Promise<BiometricState> {
  const meta = await readMeta();
  const supported = biometricSupported();
  const due = Date.now() - meta.lastPasswordAt > PASSWORD_EVERY_DAYS * 24 * 3600 * 1000;
  return { supported, enabled: supported && meta.enabled, asked: meta.asked, passwordDue: due };
}

/** Guarda a chave trancada pela digital. O sistema pede a digital para confirmar. */
export async function enableBiometric(key: Uint8Array): Promise<void> {
  await SecureStore.setItemAsync(KEY_ITEM, toBase64(key), {
    requireAuthentication: true,
    authenticationPrompt: 'Confirme sua digital para ativar',
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
  await writeMeta({ enabled: true, asked: true, lastPasswordAt: Date.now() });
}

export async function disableBiometric(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ITEM, { requireAuthentication: true });
  } catch {
    // já não existia
  }
  await writeMeta({ enabled: false });
}

/**
 * Pede a digital e devolve a chave do cofre.
 * Devolve null se a chave foi invalidada (digital adicionada/removida no celular).
 * Lança erro se o usuário cancelar ou a digital falhar.
 */
export async function unlockWithBiometric(): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(KEY_ITEM, {
    requireAuthentication: true,
    authenticationPrompt: 'Desbloquear o NCofres',
  });
  if (stored === null) {
    await disableBiometric();
    return null;
  }
  return fromBase64(stored);
}

export async function markPasswordUsed(): Promise<void> {
  await writeMeta({ lastPasswordAt: Date.now() });
}

export async function markAsked(): Promise<void> {
  await writeMeta({ asked: true });
}
