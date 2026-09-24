import * as Clipboard from 'expo-clipboard';

export const CLIPBOARD_CLEAR_SECONDS = 30;

let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Copia e agenda a limpeza da área de transferência.
 * Não lemos o conteúdo antes de limpar: no iOS, ler dispara o aviso de
 * "colar de outro app", e no Android a leitura é bloqueada em segundo plano.
 * Limitação: se o app for encerrado antes do prazo, a limpeza não acontece.
 */
export async function copySecret(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
  if (timer) clearTimeout(timer);
  timer = setTimeout(clearSecret, CLIPBOARD_CLEAR_SECONDS * 1000);
}

export async function clearSecret(): Promise<void> {
  if (!timer) return;
  clearTimeout(timer);
  timer = undefined;
  await Clipboard.setStringAsync('');
}
