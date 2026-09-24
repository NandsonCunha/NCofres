import { StatusBar } from 'expo-status-bar';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { clearSecret } from './src/clipboard';
import { UnlockScreen } from './src/screens/UnlockScreen';
import { VaultScreen } from './src/screens/VaultScreen';
import type { VaultSession } from './src/vault/format';

export default function App() {
  // Bloqueia print e gravação de tela (Android: FLAG_SECURE, também deixa a
  // miniatura em branco nos apps recentes).
  ScreenCapture.usePreventScreenCapture();

  // iOS não permite bloquear print; ao menos borra a tela no seletor de apps.
  useEffect(() => {
    if (Platform.OS === 'ios') ScreenCapture.enableAppSwitcherProtectionAsync().catch(() => {});
  }, []);

  const [session, setSession] = useState<VaultSession | null>(null);

  const lock = () => {
    clearSecret();
    setSession(null); // a chave derivada só existia neste estado
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {session ? (
        <VaultScreen session={session} onChange={setSession} onLock={lock} />
      ) : (
        <UnlockScreen onUnlocked={setSession} />
      )}
    </SafeAreaProvider>
  );
}
