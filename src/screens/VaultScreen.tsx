import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { biometricSupported, disableBiometric, enableBiometric, getBiometricState, markPasswordUsed } from '../biometric';
import { CLIPBOARD_CLEAR_SECONDS, copySecret } from '../clipboard';
import { changeMasterPassword, generatePassword, newEntry, openVault, sealVault, WrongPasswordError } from '../vault/format';
import type { Entry, VaultSession } from '../vault/format';
import { nativeCrypto } from '../vault/nativeCrypto';
import { exportVault, pickVaultFile, writeVault } from '../vault/storage';
import { Button, colors, IconButton, RADIUS, SecureInput, Sheet, StrengthBar, styles as ui } from '../ui';
import { ServiceGroup } from './EntryRow';
import { AboutSheet, SettingsSheet } from './Settings';
import { MIN_MASTER_LEN } from './UnlockScreen';

export function VaultScreen({ session, onChange, onLock }: {
  session: VaultSession;
  onChange: (s: VaultSession) => void;
  onLock: () => void;
}) {
  // "Serviço" também é o campo de busca: filtra a lista enquanto se digita.
  const [service, setService] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [details, setDetails] = useState('');
  const [revealNew, setRevealNew] = useState(false);
  const [status, setStatus] = useState({ text: '', ok: true });
  const [editing, setEditing] = useState<Entry | null>(null);
  const [importText, setImportText] = useState<string | null>(null);
  const [changingMaster, setChangingMaster] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const statusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [bioOn, setBioOn] = useState(false);

  useEffect(() => {
    getBiometricState().then((b) => setBioOn(b.enabled)).catch(() => {});
  }, []);

  // Confirmações (salvo, copiado) em verde; avisos em branco.
  const flash = (text: string, ok = true) => {
    setStatus({ text, ok });
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus({ text: '', ok: true }), 4000);
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

  const canConfirm = !!service.trim() && !!password;

  const confirmNew = () => {
    const typed = service.trim();
    // Se o serviço já existe (ignorando maiúsculas), reaproveita o nome: "google" entra em "Google".
    const existing = session.entries.find((e) => e.service.toLowerCase() === typed.toLowerCase());
    const fields = { service: existing?.service ?? typed, username: username.trim(), password, details: details.trim() };
    if (!fields.service || !fields.password) return flash('Preencha serviço e senha', false);
    const save = () => {
      if (persist([...session.entries, newEntry(nativeCrypto, fields.service, fields.username, fields.password, fields.details)])) {
        setService('');
        setUsername('');
        setPassword('');
        setDetails('');
        setRevealNew(false);
        flash(`“${fields.service}” salvo e criptografado`);
      }
    };
    const dup = session.entries.some(
      (e) => e.service.toLowerCase() === fields.service.toLowerCase() && e.username === fields.username);
    if (dup) {
      Alert.alert('Já existe', `${fields.service} / ${fields.username || 'sem usuário'} já está no cofre. Adicionar mesmo assim?`,
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Adicionar', onPress: save }]);
    } else {
      save();
    }
  };

  // Preenche a senha com uma gerada e a mostra, para o usuário ver o que foi criado.
  const insertGenerated = () => {
    setPassword(generatePassword(nativeCrypto));
    setRevealNew(true);
  };

  const copy = async (text: string, what: string) => {
    await copySecret(text);
    flash(`${what} — será apagado em ${CLIPBOARD_CLEAR_SECONDS} s`);
  };

  const remove = (entry: Entry) =>
    Alert.alert('Excluir', `Excluir “${entry.service}” (${entry.username || 'sem usuário'})?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => persist(session.entries.filter((e) => e.id !== entry.id)) },
    ]);

  // Liga/desliga o desbloqueio com digital (ligar pede a digital para confirmar).
  const toggleBiometric = () => {
    if (bioOn) {
      Alert.alert('Desativar digital?', 'O cofre voltará a abrir só com a senha mestra.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Desativar', style: 'destructive', onPress: async () => {
          await disableBiometric().catch(() => {});
          setBioOn(false);
          flash('Desbloqueio com digital desativado');
        } },
      ]);
      return;
    }
    enableBiometric(session.key)
      .then(() => { setBioOn(true); flash('Desbloqueio com digital ativado'); })
      .catch(() => flash('Digital não confirmada. Nada foi alterado.', false));
  };

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

  // Agrupa as contas por serviço (sem diferenciar maiúsculas), filtrando pelo campo Serviço.
  const groups = useMemo(() => {
    const term = service.trim().toLowerCase();
    const byService = new Map<string, { service: string; entries: Entry[] }>();
    for (const e of session.entries) {
      const key = e.service.toLowerCase();
      if (term && !key.includes(term)) continue;
      if (!byService.has(key)) byService.set(key, { service: e.service, entries: [] });
      byService.get(key)!.entries.push(e);
    }
    const cmp = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
    return [...byService.values()]
      .map((g) => ({ ...g, entries: g.entries.sort((a, b) => cmp(a.username, b.username)) }))
      .sort((a, b) => cmp(a.service, b.service));
  }, [session.entries, service]);

  const usernameInput = useRef<TextInput>(null);
  const addAccount = (name: string) => {
    setService(name);
    usernameInput.current?.focus();
  };

  return (
    <SafeAreaView style={s.wrap} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, gap: 10 }}>
        <View style={ui.row}>
          <Text style={s.title}>NCofres</Text>
          <View style={{ flex: 1 }} />
          <IconButton name="settings-outline" label="Configurações" onPress={() => setSettingsOpen(true)} />
          <IconButton name="lock-closed" label="Travar" color={colors.accent} onPress={onLock} />
        </View>

        <SecureInput reveal value={service} onChangeText={setService}
          placeholder="Serviço (buscar ou adicionar)" returnKeyType="next" />
        <View style={ui.row}>
          <SecureInput ref={usernameInput} reveal value={username} onChangeText={setUsername}
            placeholder="Usuário ou e-mail" style={{ flex: 1 }} returnKeyType="next" />
          <View style={[ui.row, s.passwordBox]}>
            <SecureInput reveal={revealNew} value={password} onChangeText={setPassword}
              placeholder="Senha" style={s.passwordInput} onSubmitEditing={confirmNew} returnKeyType="done" />
            <IconButton name={revealNew ? 'eye-off-outline' : 'eye-outline'} label="Mostrar/ocultar senha"
              onPress={() => setRevealNew(!revealNew)} />
          </View>
        </View>
        {!!password && <StrengthBar password={password} />}
        <SecureInput reveal multiline value={details} onChangeText={setDetails}
          placeholder="Detalhes (opcional)" style={s.details} />
        <View style={ui.row}>
          <View style={{ flex: 1 }}>
            <Button title="Gerar senha" kind="secondary" onPress={insertGenerated} />
          </View>
          <View style={{ flex: 1 }}>
            <Button title="Confirmar" onPress={confirmNew} disabled={!canConfirm} />
          </View>
        </View>

        <FlatList
          data={groups}
          keyExtractor={(g) => g.service.toLowerCase()}
          contentContainerStyle={{ gap: 8, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={s.empty}>
              {service.trim()
                ? `Nenhum “${service.trim()}” no cofre.\nPreencha usuário e senha e toque em Confirmar.`
                : 'Nenhuma credencial ainda.\nPreencha serviço, usuário e senha acima.'}
            </Text>
          }
          renderItem={({ item }) => (
            <ServiceGroup service={item.service} entries={item.entries} onCopy={copy}
              onEdit={setEditing} onDelete={remove} onAddAccount={addAccount} />
          )}
        />

        <Text style={[s.status, !!status.text && { color: status.ok ? colors.accent : colors.text }]}>
          {status.text || `${session.entries.length} ${session.entries.length === 1 ? 'conta' : 'contas'}`}
        </Text>
      </KeyboardAvoidingView>

      {editing && (
        <EditSheet entry={editing} onCancel={() => setEditing(null)}
          onSave={(fields) => {
            const entries = session.entries.map((e) =>
              e.id === editing.id ? { ...e, ...fields, updated: Date.now() / 1000 } : e);
            if (persist(entries)) setEditing(null);
          }} />
      )}

      {settingsOpen && (
        <SettingsSheet
          biometricSupported={biometricSupported()}
          biometricOn={bioOn}
          onToggleBiometric={() => { setSettingsOpen(false); toggleBiometric(); }}
          onAbout={() => { setSettingsOpen(false); setAboutOpen(true); }}
          onExport={() => { setSettingsOpen(false); exportFile(); }}
          onImport={() => { setSettingsOpen(false); chooseImport(); }}
          onChangeMaster={() => { setSettingsOpen(false); setChangingMaster(true); }}
          onClose={() => setSettingsOpen(false)} />
      )}

      {aboutOpen && <AboutSheet onClose={() => setAboutOpen(false)} />}

      {changingMaster && (
        <ChangeMasterSheet session={session} onCancel={() => setChangingMaster(false)}
          onChanged={async (next) => {
            try {
              writeVault(sealVault(nativeCrypto, next));
            } catch (e) {
              Alert.alert('Falha ao salvar', (e as Error).message);
              return;
            }
            onChange(next);
            setChangingMaster(false);
            await markPasswordUsed().catch(() => {});
            // A chave guardada para a digital era a antiga: desativa para não ficar inválida.
            if (bioOn) {
              await disableBiometric().catch(() => {});
              setBioOn(false);
              flash('Senha mestra alterada. Ative a digital de novo pelo ícone.');
            } else {
              flash('Senha mestra alterada');
            }
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
  onSave: (f: { service: string; username: string; password: string; details: string }) => void;
  onCancel: () => void;
}) {
  const [service, setService] = useState(entry.service);
  const [username, setUsername] = useState(entry.username);
  const [password, setPassword] = useState(entry.password);
  const [details, setDetails] = useState(entry.details);
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
        <IconButton name="key-outline" label="Gerar senha" onPress={() => setPassword(generatePassword(nativeCrypto))} />
      </View>
      {!!password && <StrengthBar password={password} />}
      <Text style={ui.label}>Detalhes</Text>
      <SecureInput reveal multiline value={details} onChangeText={setDetails} style={s.details} />
      <View style={ui.row}>
        <View style={{ flex: 1 }}><Button title="Cancelar" kind="secondary" onPress={onCancel} /></View>
        <View style={{ flex: 1 }}>
          <Button title="Salvar" disabled={!valid}
            onPress={() => onSave({ service: service.trim(), username: username.trim(), password, details: details.trim() })} />
        </View>
      </View>
    </Sheet>
  );
}

function ChangeMasterSheet({ session, onChanged, onCancel }: {
  session: VaultSession;
  onChanged: (next: VaultSession) => void;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (next.length < MIN_MASTER_LEN) return setError(`A nova senha precisa ter pelo menos ${MIN_MASTER_LEN} caracteres.`);
    if (next !== confirm) return setError('As novas senhas não conferem.');
    if (next === current) return setError('A nova senha é igual à atual.');
    setBusy(true);
    setError('');
    try {
      onChanged(await changeMasterPassword(nativeCrypto, session, current, next));
    } catch (e) {
      setError(e instanceof WrongPasswordError ? e.message : `Erro: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet visible title="Trocar senha mestra" onClose={onCancel}>
      <SecureInput autoFocus placeholder="Senha atual" value={current} onChangeText={setCurrent} editable={!busy} />
      <SecureInput placeholder="Nova senha mestra" value={next} onChangeText={setNext} editable={!busy} />
      <SecureInput placeholder="Confirmar nova senha" value={confirm} onChangeText={setConfirm} editable={!busy}
        onSubmitEditing={save} />
      <Text style={ui.label}>
        Mínimo {MIN_MASTER_LEN} caracteres. Cópias exportadas antes da troca continuam abrindo com a senha antiga.
      </Text>
      {!!error && <Text style={ui.error}>{error}</Text>}
      <View style={ui.row}>
        <View style={{ flex: 1 }}><Button title="Cancelar" kind="secondary" onPress={onCancel} /></View>
        <View style={{ flex: 1 }}>
          <Button title={busy ? 'Salvando…' : 'Salvar'} disabled={!current || !next || busy} onPress={save} />
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
  title: { color: colors.text, fontSize: 18, fontWeight: '600', letterSpacing: 1 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 32, lineHeight: 22 },
  status: { color: colors.muted, textAlign: 'center', fontSize: 12, paddingVertical: 4 },
  // Caixa com a borda do input, para o olho ficar "dentro" do campo de senha.
  passwordBox: {
    flex: 1, gap: 0, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    borderRadius: RADIUS, paddingRight: 4,
  },
  passwordInput: { flex: 1, borderWidth: 0, backgroundColor: 'transparent' },
  details: { maxHeight: 88, textAlignVertical: 'top' },
});
