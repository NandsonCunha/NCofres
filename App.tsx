import { StatusBar } from 'expo-status-bar';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { disableBiometric, enableBiometric, getBiometricState, markAsked, markPasswordUsed } from './src/biometric';
import { clearSecret } from './src/clipboard';
import { UnlockScreen } from './src/screens/UnlockScreen';
import type { UnlockMethod } from './src/screens/UnlockScreen';
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

  const onUnlocked = async (s: VaultSession, how: UnlockMethod) => {
    setSession(s);
    if (how === 'biometric') return;
    try {
      await markPasswordUsed();
      // Cofre novo (criado ou importado): a chave antiga guardada não serve mais.
      if (how === 'new') await disableBiometric();
      const bio = await getBiometricState();
      if (bio.supported && !bio.enabled && (!bio.asked || how === 'new')) offerBiometric(s.key);
    } catch {
      // biometria é opcional: qualquer falha aqui não impede o uso do cofre
    }
  };

  const offerBiometric = (key: Uint8Array) =>
    Alert.alert('Desbloquear com digital?', 'Da próxima vez, abra o cofre com a digital. '
      + 'A senha mestra continua funcionando e será pedida a cada 7 dias.', [
      { text: 'Agora não', style: 'cancel', onPress: () => { markAsked().catch(() => {}); } },
      { text: 'Ativar', onPress: () => { enableBiometric(key).catch(() => markAsked().catch(() => {})); } },
    ]);

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
        <UnlockScreen onUnlocked={onUnlocked} />
      )}
    </SafeAreaProvider>
  );
}
