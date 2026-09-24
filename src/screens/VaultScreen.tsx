import { useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CLIPBOARD_CLEAR_SECONDS, copySecret } from '../clipboard';
import { generatePassword, newEntry, openVault, parseLine, sealVault, WrongPasswordError } from '../vault/format';
import type { Entry, VaultSession } from '../vault/format';
import { nativeCrypto } from '../vault/nativeCrypto';
import { exportVault, pickVaultFile, writeVault } from '../vault/storage';
import { Button, colors, IconButton, SecureInput, Sheet, styles as ui } from '../ui';
import { EntryRow } from './EntryRow';

export function VaultScreen({ session, onChange, onLock }: {
  session: VaultSession;
  onChange: (s: VaultSession) => void;
  onLock: () => void;
}) {
  const [quick, setQuick] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Entry | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const flash = (msg: string) => {
    setStatus(msg);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), 4000);
  };

  /** Cifra e grava; só atualiza a tela se a gravação deu certo. */
  const persist = (entries: Entry[]): boolean => {
    const next = { ...session, entries };
    try {
      writeVault(sealVault(nativeCrypto, next));
    } catch (e) {
      Alert.alert('Falha ao salvar', (e as Error).message);
      return false;
    }
    onChange(next);
    return true;
  };

  const confirmQuick = () => {
    let fields;
    try {
      fields = parseLine(quick);
    } catch (e) {
      return flash((e as Error).message);
    }
    const save = () => {
      if (persist([...session.entries, newEntry(nativeCrypto, fields.service, fields.username, fields.password)])) {
        setQuick('');
        flash(`“${fields.service}” salvo e criptografado`);
      }
    };
    const dup = session.entries.some(
      (e) => e.service.toLowerCase() === fields.service.toLowerCase() && e.username === fields.username);
    if (dup) {
      Alert.alert('Já existe', `${fields.service} / ${fields.username} já está no cofre. Adicionar mesmo assim?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Adicionar', onPress: save }]);
    } else {
      save();
    }
  };

  // Completa o campo com uma senha forte (substitui a senha se já houver uma).
  const insertGenerated = () => {
    const parts = quick.split(':');
    const prefix = parts.length >= 3 ? `${parts[0]}:${parts[1]}: ` : parts.length === 2 ? `${quick.trimEnd()} ` : quick;
    setQuick(prefix + generatePassword(nativeCrypto));
  };

  const copy = async (text: string, what: string) => {
    await copySecret(text);
    flash(`${what} copiado — será apagado em ${CLIPBOARD_CLEAR_SECONDS} s`);
  };

  const remove = (entry: Entry) =>
    Alert.alert('Excluir', `Excluir “${entry.service}” (${entry.username || 'sem usuário'})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => persist(session.entries.filter((e) => e.id !== entry.id)) },
    ]);

  const exportFile = async () => {
    try {
      await exportVault();
    } catch (e) {
      Alert.alert('Falha ao exportar', (e as Error).message);
    }
  };

  const chooseImport = async () => {
    try {
      const text = await pickVaultFile();
      if (text !== null) setImportText(text);
    } catch (e) {
      Alert.alert('Falha ao abrir arquivo', (e as Error).message);
    }
  };

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    return [...session.entries]
      .filter((e) => !term || e.service.toLowerCase().includes(term) || e.username.toLowerCase().includes(term))
      .sort((a, b) => a.service.localeCompare(b.service, 'pt-BR', { sensitivity: 'base' }));
  }, [session.entries, search]);

  return (
    <SafeAreaView style={s.wrap} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, gap: 10 }}>
        <View style={ui.row}>
          <Text style={s.title}>GDSN</Text>
          <View style={{ flex: 1 }} />
          <IconButton name="download-outline" label="Importar cofre" onPress={chooseImport} />
          <IconButton name="share-outline" label="Exportar cofre" onPress={exportFile} />
          <IconButton name="lock-closed" label="Travar" color={colors.accent} onPress={onLock} />
        </View>

        {/* Entrada rápida: "google: email@gmail.com: senha123" */}
        <SecureInput reveal value={quick} onChangeText={setQuick} onSubmitEditing={confirmQuick}
          placeholder="serviço: usuário: senha" returnKeyType="done" />
        <View style={ui.row}>
          <View style={{ flex: 1 }}>
            <Button title="🎲  Gerar senha" kind="secondary" onPress={insertGenerated} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Confirmar" onPress={confirmQuick} disabled={!quick.trim()} />
          </View>
        </View>

        <SecureInput reveal value={search} onChangeText={setSearch} placeholder="🔎 Buscar serviço ou usuário" />

        <FlatList
          data={shown}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={s.empty}>{search ? 'Nada encontrado.' : 'Nenhuma credencial ainda.\nDigite acima: google: email@gmail.com: senha123'}</Text>
          }
          renderItem={({ item }) => (
            <EntryRow entry={item} onCopy={copy} onEdit={() => setEditing(item)} onDelete={() => remove(item)} />
          )}
        />

        <Text style={s.status}>{status || `${session.entries.length} credenciais`}</Text>
      </KeyboardAvoidingView>

      {editing && (
        <EditSheet entry={editing} onCancel={() => setEditing(null)}
          onSave={(fields) => {
            const entries = session.entries.map((e) =>
              e.id === editing.id ? { ...e, ...fields, updated: Date.now() / 1000 } : e);
            if (persist(entries)) setEditing(null);
          }} />
      )}

      {importText !== null && (
        <ImportSheet text={importText} onCancel={() => setImportText(null)}
          onImported={(incoming) => {
            // Mescla: entradas já existentes (mesmo id ou mesmo conteúdo) são ignoradas.
            const known = new Set(session.entries.map((e) => e.id));
            const same = (a: Entry, b: Entry) =>
              a.service === b.service && a.username === b.username && a.password === b.password;
            const added = incoming.filter((n) => !known.has(n.id) && !session.entries.some((e) => same(e, n)));
            if (persist([...session.entries, ...added])) {
              setImportText(null);
              flash(`${added.length} credenciais importadas (${incoming.length - added.length} já existiam)`);
            }
          }} />
      )}
    </SafeAreaView>
  );
}

function EditSheet({ entry, onSave, onCancel }: {
  entry: Entry;
  onSave: (f: { service: string; username: string; password: string }) => void;
  onCancel: () => void;
}) {
  const [service, setService] = useState(entry.service);
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState(entry.password);
  const [reveal, setReveal] = useState(false);
  const valid = service.trim() && password;
  return (
    <Sheet visible title={`Editar — ${entry.service}`} onClose={onCancel}>
      <Text style={ui.label}>Serviço</Text>
      <SecureInput reveal value={service} onChangeText={setService} />
      <Text style={ui.label}>Usuário</Text>
      <SecureInput reveal value={username} onChangeText={setUsername} />
      <Text style={ui.label}>Senha</Text>
      <View style={ui.row}>
        <SecureInput reveal={reveal} value={password} onChangeText={setPassword} style={{ flex: 1 }} />
        <IconButton name={reveal ? 'eye-off-outline' : 'eye-outline'} label="Mostrar/ocultar" onPress={() => setReveal(!reveal)} />
        <IconButton name="dice-outline" label="Gerar senha" onPress={() => setPassword(generatePassword(nativeCrypto))} />
      </View>
      <View style={ui.row}>
        <View style={{ flex: 1 }}><Button title="Cancelar" kind="secondary" onPress={onCancel} /></View>
        <View style={{ flex: 1 }}>
          <Button title="Salvar" disabled={!valid}
            onPress={() => onSave({ service: service.trim(), username: username.trim(), password })} />
        </View>
      </View>
    </Sheet>
  );
}

function ImportSheet({ text, onImported, onCancel }: {
  text: string;
  onImported: (entries: Entry[]) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      onImported((await openVault(nativeCrypto, text, password)).entries);
    } catch (e) {
      setError(e instanceof WrongPasswordError ? e.message : `Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible title="Importar cofre" onClose={onCancel}>
      <Text style={ui.label}>Digite a senha mestra do arquivo escolhido. As credenciais serão adicionadas ao seu cofre.</Text>
      <SecureInput autoFocus placeholder="Senha mestra do arquivo" value={password} onChangeText={setPassword}
        onSubmitEditing={open} editable={!busy} />
      {!!error && <Text style={ui.error}>{error}</Text>}
      <View style={ui.row}>
        <View style={{ flex: 1 }}><Button title="Cancelar" kind="secondary" onPress={onCancel} /></View>
        <View style={{ flex: 1 }}><Button title={busy ? 'Abrindo…' : 'Importar'} disabled={!password || busy} onPress={open} /></View>
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32, lineHeight: 22 },
  status: { color: colors.muted, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
});
