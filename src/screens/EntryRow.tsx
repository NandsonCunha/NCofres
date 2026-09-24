import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Entry } from '../vault/format';
import { colors, IconButton, styles as ui } from '../ui';

const REVEAL_SECONDS = 20;
const MASK = '•'.repeat(10);

export function EntryRow({ entry, onCopy, onEdit, onDelete }: {
  entry: Entry;
  onCopy: (text: string, what: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [revealed, setRevealed] = useState(false);

  // A senha revelada volta a ser ocultada sozinha.
  useEffect(() => {
    if (!revealed) return;
    const t = setTimeout(() => setRevealed(false), REVEAL_SECONDS * 1000);
    return () => clearTimeout(t);
  }, [revealed]);

  return (
    <View style={s.card}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.service}>{entry.service}</Text>
        <View style={ui.row}>
          <Text style={s.user} numberOfLines={1}>{entry.username || '—'}</Text>
          {!!entry.username && (
            <IconButton name="copy-outline" label="Copiar usuário" onPress={() => onCopy(entry.username, 'Usuário')} />
          )}
        </View>
        <View style={ui.row}>
          <Text style={s.password} selectable={revealed}>{revealed ? entry.password : MASK}</Text>
          {revealed ? (
            <>
              <IconButton name="copy-outline" label="Copiar senha" color={colors.accent}
                onPress={() => onCopy(entry.password, 'Senha')} />
              <IconButton name="eye-off-outline" label="Ocultar senha" onPress={() => setRevealed(false)} />
            </>
          ) : (
            <IconButton name="eye-outline" label="Revelar senha" onPress={() => setRevealed(true)} />
          )}
        </View>
      </View>
      <View>
        <IconButton name="create-outline" label="Editar" onPress={onEdit} />
        <IconButton name="trash-outline" label="Excluir" color={colors.danger} onPress={onDelete} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  service: { color: colors.text, fontSize: 16, fontWeight: '700' },
  user: { color: colors.muted, flexShrink: 1 },
  password: { color: colors.text, fontFamily: 'monospace', fontSize: 15, flexShrink: 1 },
});
