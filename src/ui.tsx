import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

export const colors = {
  bg: '#0f1115',
  card: '#181b22',
  border: '#2a2f3a',
  text: '#e8eaf0',
  muted: '#8b93a7',
  accent: '#4f8cff',
  danger: '#ff5c6c',
  ok: '#3ecf8e',
};

type IconName = ComponentProps<typeof Ionicons>['name'];

export function IconButton({ name, onPress, color = colors.muted, label }: {
  name: IconName; onPress: () => void; color?: string; label: string;
}) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label}
      style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.5 }]}>
      <Ionicons name={name} size={20} color={color} />
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean;
}) {
  const bg = kind === 'primary' ? colors.accent : kind === 'danger' ? colors.danger : 'transparent';
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
        kind === 'secondary' && styles.btnSecondary]}>
      <Text style={[styles.btnText, kind === 'secondary' && { color: colors.accent }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Campo para dados sensíveis: sem autocorreção, sem sugestões e sem
 * aprendizado do teclado (no Android, 'visible-password' desliga o dicionário do Gboard).
 */
export function SecureInput(props: TextInputProps & { reveal?: boolean }) {
  const { reveal, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete="off"
      importantForAutofill="no"
      textContentType="none"
      keyboardType={reveal && Platform.OS === 'android' ? 'visible-password' : 'default'}
      secureTextEntry={!reveal}
      style={[styles.input, style]}
      {...rest}
    />
  );
}

export function Sheet({ visible, title, onClose, children }: {
  visible: boolean; title: string; onClose: () => void; children: ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  iconBtn: { padding: 6 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center' },
  btnSecondary: { borderWidth: 1, borderColor: colors.accent },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  input: {
    backgroundColor: colors.card, color: colors.text, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  backdrop: { flex: 1, backgroundColor: '#000a', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.bg, borderRadius: 14, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.border },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  label: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
