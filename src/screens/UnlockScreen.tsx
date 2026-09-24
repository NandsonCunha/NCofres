import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';

import { createVault, openVault, sealVault, WrongPasswordError } from '../vault/format';
import type { VaultSession } from '../vault/format';
import { nativeCrypto } from '../vault/nativeCrypto';
import { pickVaultFile, readVault, vaultExists, writeVault } from '../vault/storage';
import { Button, colors, SecureInput, styles as ui } from '../ui';

export const MIN_MASTER_LEN = 10;

export function UnlockScreen({ onUnlocked }: { onUnlocked: (s: VaultSession) => void }) {
  const [exists, setExists] = useState(vaultExists);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [importText, setImportText] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    onUnlocked(session);
  });

  const create = () => {
    if (password.length < MIN_MASTER_LEN) return setError(`A senha precisa ter pelo menos ${MIN_MASTER_LEN} caracteres.`);
    if (password !== confirm) return setError('As senhas não conferem.');
    run(async () => {
      const session = await createVault(nativeCrypto, password);
      writeVault(sealVault(nativeCrypto, session));
      setPassword('');
      setConfirm('');
      onUnlocked(session);
    });
  };

  // Importar um .gdsn existente como o cofre deste aparelho (ex.: vindo do PC).
  const chooseImport = () => run(async () => {
    const text = await pickVaultFile();
    if (text !== null) setImportText(text);
  });

  const confirmImport = () => run(async () => {
    const session = await openVault(nativeCrypto, importText!, password);
    writeVault(importText!);
    setExists(true);
    setImportText(null);
    setPassword('');
    onUnlocked(session);
  });

  const mode = importText !== null ? 'import' : exists ? 'unlock' : 'create';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.wrap}>
      <Text style={s.title}>🔐 GDSN</Text>
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
          {mode === 'create' && <Button title="Criar cofre" onPress={create} disabled={!password} />}
          {mode === 'import' && <Button title="Abrir e importar" onPress={confirmImport} disabled={!password} />}
          {mode === 'create' && <Button title="Importar cofre existente (.gdsn)" kind="secondary" onPress={chooseImport} />}
          {mode === 'import' && (
            <Button title="Cancelar" kind="secondary" onPress={() => { setImportText(null); setPassword(''); setError(''); }} />
          )}
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 34, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: colors.muted, textAlign: 'center', marginBottom: 8 },
});
