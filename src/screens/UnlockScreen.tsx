import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { disableBiometric, getBiometricState, PASSWORD_EVERY_DAYS, unlockWithBiometric } from '../biometric';
import type { BiometricState } from '../biometric';
import { createVault, openVault, openVaultWithKey, sealVault, WrongPasswordError } from '../vault/format';
import type { VaultSession } from '../vault/format';
import { nativeCrypto } from '../vault/nativeCrypto';
import { pickVaultFile, readVault, vaultExists, writeVault } from '../vault/storage';
import { markWelcomeSeen, shouldShowWelcome } from '../firstRun';
import { Button, colors, IconButton, SecureInput, styles as ui } from '../ui';
import { AboutSheet } from './Settings';

export const MIN_MASTER_LEN = 10;

/** Como o cofre foi aberto: 'new' = cofre criado ou importado agora (chave nova). */
export type UnlockMethod = 'password' | 'new' | 'biometric';

export function UnlockScreen({ onUnlocked }: { onUnlocked: (s: VaultSession, how: UnlockMethod) => void }) {
  const insets = useSafeAreaInsets();
  const [exists, setExists] = useState(vaultExists);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [importText, setImportText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bio, setBio] = useState<BiometricState | null>(null);

  const [welcome, setWelcome] = useState(false);

  // Primeira abertura do app: mostra a tela Sobre como boas-vindas.
  useEffect(() => {
    shouldShowWelcome().then(setWelcome);
  }, []);

  const closeWelcome = () => {
    setWelcome(false);
    markWelcomeSeen();
  };

  useEffect(() => {
    getBiometricState().then(setBio).catch(() => setBio(null));
  }, []);

  const run = async (work: () => Promise<void>) => {
    setError('');
    setBusy(true);
    try {
      await work();
    } catch (e) {
      setError(e instanceof WrongPasswordError ? e.message : `Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const unlock = () => run(async () => {
    const session = await openVault(nativeCrypto, await readVault(), password);
    setPassword('');
    onUnlocked(session, 'password');
  });

  // Digital: o Keystore libera a chave guardada; se falhar, a senha mestra continua disponível.
  const unlockBiometric = async () => {
    setError('');
    let key: Uint8Array | null;
    try {
      key = await unlockWithBiometric();
    } catch {
      return setError('Digital não confirmada. Tente de novo ou use a senha mestra.');
    }
    if (!key) {
      setBio((b) => b && { ...b, enabled: false });
      return setError('As digitais do celular mudaram. Digite a senha mestra para reativar.');
    }
    setBusy(true);
    try {
      const session = openVaultWithKey(nativeCrypto, await readVault(), key);
      onUnlocked(session, 'biometric');
    } catch (e) {
      if (e instanceof WrongPasswordError) {
        await disableBiometric();
        setBio((b) => b && { ...b, enabled: false });
        setError('A digital não abre mais este cofre. Digite a senha mestra para reativar.');
      } else {
        setError(`Erro: ${(e as Error).message}`);
      }
    } finally {
      setBusy(false);
    }
  };

  const create = () => {
    if (password.length < MIN_MASTER_LEN) return setError(`A senha precisa ter pelo menos ${MIN_MASTER_LEN} caracteres.`);
    if (password !== confirm) return setError('As senhas não conferem.');
    run(async () => {
      const session = await createVault(nativeCrypto, password);
      writeVault(sealVault(nativeCrypto, session));
      setPassword('');
      setConfirm('');
      onUnlocked(session, 'new');
    });
  };

  // Importar um cofre (.ncf) como o cofre deste aparelho (ex.: exportado do PC).
  const chooseImport = () => run(async () => {
    const text = await pickVaultFile();
    if (text !== null) {
      setPassword('');
      setImportText(text);
    }
  });

  const finishImport = (session: VaultSession) => {
    try {
      writeVault(importText!);
    } catch (e) {
      return setError(`Erro ao salvar: ${(e as Error).message}`);
    }
    setExists(true);
    setImportText(null);
    setPassword('');
    onUnlocked(session, 'new');
  };

  // Primeiro confere a senha do arquivo; só então pergunta se pode substituir o cofre atual.
  const confirmImport = () => run(async () => {
    const session = await openVault(nativeCrypto, importText!, password);
    if (!exists) return finishImport(session);
    Alert.alert(
      'Substituir o cofre deste celular?',
      'O cofre atual deste celular será trocado pelo arquivo importado.\n\n'
        + 'Se ele tiver contas que não estão no arquivo, cancele, abra o cofre e use '
        + 'Configurações → Importar cofre: assim as contas são juntadas em vez de substituídas.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Substituir', style: 'destructive', onPress: () => finishImport(session) },
      ],
    );
  });

  const mode = importText !== null ? 'import' : exists ? 'unlock' : 'create';
  const showBiometric = mode === 'unlock' && !!bio?.enabled && !bio.passwordDue;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
      {mode !== 'import' && !busy && (
        <View style={[s.corner, { top: insets.top + 8 }]}>
          <IconButton name="download-outline" label="Importar cofre do PC" onPress={chooseImport} />
        </View>
      )}
      <Text style={s.title}>NCofres</Text>
      <Text style={s.subtitle}>
        {mode === 'unlock' && 'Digite a senha mestra'}
        {mode === 'create' && 'Crie seu cofre'}
        {mode === 'import' && 'Senha mestra do arquivo importado'}
      </Text>

      <SecureInput placeholder="Senha mestra" value={password} onChangeText={setPassword} editable={!busy}
        onSubmitEditing={mode === 'unlock' ? unlock : mode === 'import' ? confirmImport : undefined}
        returnKeyType="done" autoFocus={mode !== 'create'} />

      {mode === 'create' && (
        <>
          <SecureInput placeholder="Confirmar senha mestra" value={confirm} onChangeText={setConfirm} editable={!busy} />
          <Text style={ui.label}>
            Mínimo {MIN_MASTER_LEN} caracteres. Uma frase longa (4–5 palavras aleatórias) é forte e fácil de lembrar.
            {'\n'}Se você esquecer esta senha, NÃO há como recuperar o cofre.
          </Text>
        </>
      )}

      {!!error && <Text style={ui.error}>{error}</Text>}
      {busy ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: 12 }} />
      ) : (
        <View style={{ gap: 10 }}>
          {mode === 'unlock' && <Button title="Desbloquear" onPress={unlock} disabled={!password} />}
          {showBiometric && (
            <Pressable onPress={unlockBiometric} accessibilityLabel="Desbloquear com digital"
              style={({ pressed }) => [s.bio, pressed && { opacity: 0.5 }]}>
              <Ionicons name="finger-print" size={44} color={colors.accent} />
              <Text style={s.bioText}>Usar digital</Text>
            </Pressable>
          )}
          {mode === 'unlock' && !!bio?.enabled && bio.passwordDue && (
            <Text style={[ui.label, { textAlign: 'center' }]}>
              Por segurança, a senha mestra é pedida a cada {PASSWORD_EVERY_DAYS} dias.
            </Text>
          )}
          {mode === 'create' && <Button title="Criar cofre" onPress={create} disabled={!password} />}
          {mode === 'import' && <Button title="Abrir e importar" onPress={confirmImport} disabled={!password} />}
          {mode === 'create' && <Button title="Importar cofre existente (.ncf)" kind="secondary" onPress={chooseImport} />}
          {mode === 'import' && (
            <Button title="Cancelar" kind="secondary" onPress={() => { setImportText(null); setPassword(''); setError(''); }} />
          )}
        </View>
      )}
      {welcome && <AboutSheet welcome onClose={closeWelcome} />}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 34, fontWeight: '300', letterSpacing: 2, textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
  bio: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  corner: { position: 'absolute', right: 12 },
  bioText: { color: colors.secondary, fontSize: 13 },
});
