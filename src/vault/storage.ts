import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const VAULT_NAME = 'cofre.gdsn';

/** O cofre fica na área privada do app (outros apps não têm acesso). */
function vaultFile() {
  return new File(Paths.document, VAULT_NAME);
}

export function vaultExists(): boolean {
  return vaultFile().exists;
}

export function readVault(): Promise<string> {
  return vaultFile().text();
}

/**
 * Grava num temporário e só então substitui o cofre: uma falha no meio nunca
 * deixa o arquivo pela metade. A versão anterior fica em cofre.gdsn.bak.
 */
export function writeVault(text: string): void {
  const target = vaultFile();
  const tmp = new File(Paths.document, `${VAULT_NAME}.tmp`);
  if (tmp.exists) tmp.delete();
  tmp.create();
  tmp.write(text);
  if (target.exists) target.copySync(new File(Paths.document, `${VAULT_NAME}.bak`), { overwrite: true });
  tmp.moveSync(target, { overwrite: true });
}

/** Abre o menu de compartilhar do sistema com uma cópia do cofre (já cifrado). */
export async function exportVault(): Promise<void> {
  const date = new Date().toISOString().slice(0, 10);
  const copy = new File(Paths.cache, `gdsn-${date}.gdsn`);
  vaultFile().copySync(copy, { overwrite: true });
  try {
    await Sharing.shareAsync(copy.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Exportar cofre GDSN',
    });
  } finally {
    if (copy.exists) copy.delete();
  }
}

/** Deixa o usuário escolher um arquivo .gdsn e devolve o conteúdo (ou null se cancelar). */
export async function pickVaultFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const picked = new File(result.assets[0].uri);
  try {
    return await picked.text();
  } finally {
    if (picked.exists) picked.delete();
  }
}
