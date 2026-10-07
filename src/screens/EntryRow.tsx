import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Entry } from '../vault/format';
import { colors, IconButton, RADIUS, StrengthBar, styles as ui } from '../ui';

const REVEAL_SECONDS = 20;
const MASK = '•'.repeat(10);

type Actions = {
  onCopy: (text: string, what: string) => void;
  onEdit: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
};

/** Um serviço (ex.: Google) com todas as suas contas. */
export function ServiceGroup({ service, entries, onAddAccount, ...actions }: Actions & {
  service: string;
  entries: Entry[];
  onAddAccount: (service: string) => void;
}) {
  return (
    <View style={s.card}>
      <View style={ui.row}>
        <Text style={s.service} numberOfLines={1}>{service}</Text>
        <Text style={s.count}>{entries.length} {entries.length === 1 ? 'conta' : 'contas'}</Text>
        <IconButton name="add" label={`Adicionar conta em ${service}`} color={colors.accent}
          onPress={() => onAddAccount(service)} />
      </View>
      {entries.map((entry, i) => (
        <View key={entry.id} style={i > 0 && s.divider}>
          <AccountRow entry={entry} {...actions} />
        </View>
      ))}
    </View>
  );
}

function AccountRow({ entry, onCopy, onEdit, onDelete }: Actions & { entry: Entry }) {
  const [revealed, setRevealed] = useState(false);

  // A senha revelada volta a ser ocultada sozinha.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), REVEAL_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [revealed]);

  return (
    <View style={s.account}>
      <View style={{ flex: 1 }}>
        <View style={ui.row}>
          <Text style={s.user} numberOfLines={1}>{entry.username || '—'}</Text>
          {!!entry.username && (
            <IconButton name="copy-outline" label="Copiar usuário" onPress={() => onCopy(entry.username, 'Usuário copiado')} />
          )}
        </View>
        <View style={ui.row}>
          <Text style={s.password} selectable={revealed}>{revealed ? entry.password : MASK}</Text>
          {revealed ? (
            <>
              <IconButton name="copy-outline" label="Copiar senha" color={colors.accent}
                onPress={() => onCopy(entry.password, 'Senha copiada')} />
              <IconButton name="eye-off-outline" label="Ocultar senha" onPress={() => setRevealed(false)} />
            </>
          ) : (
            <IconButton name="eye-outline" label="Revelar senha" onPress={() => setRevealed(true)} />
          )}
        </View>
        {revealed && <StrengthBar password={entry.password} />}
        {!!entry.details && <Text style={s.details}>{entry.details}</Text>}
      </View>
      <IconButton name="create-outline" label="Editar" onPress={() => onEdit(entry)} />
      <IconButton name="trash-outline" label="Excluir" color={colors.danger} onPress={() => onDelete(entry)} />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card, borderRadius: RADIUS, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  service: { color: colors.text, fontSize: 16, fontWeight: '600', flex: 1 },
  count: { color: colors.muted, fontSize: 12 },
  account: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  user: { color: colors.text, flexShrink: 1 },
  password: { color: colors.muted, fontFamily: 'monospace', fontSize: 15, flexShrink: 1 },
  details: { color: colors.secondary, fontSize: 13, paddingBottom: 4 },
});
