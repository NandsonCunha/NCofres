import { requireOptionalNativeModule } from 'expo';

import appJson from '../app.json';

/**
 * Texto da versão para a tela "Sobre".
 *
 * Não importa o expo-updates diretamente: o APK de release é gerado sem ele,
 * e importá-lo sem a parte nativa fecharia o app. Aqui ele é opcional.
 */
type UpdatesNative = { isEmbeddedLaunch?: boolean; commitTime?: string | number | null } | null;

const updates = requireOptionalNativeModule('ExpoUpdates') as UpdatesNative;

export function versionText(): string {
  const base = `Versão ${appJson.expo.version}`;
  if (!updates) return `${base} · sem atualização automática`;
  if (updates.isEmbeddedLaunch || !updates.commitTime) return base;
  const when = new Date(updates.commitTime).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  return `${base} · atualizada em ${when}`;
}
