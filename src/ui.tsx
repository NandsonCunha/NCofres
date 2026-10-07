import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode, Ref } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { TextInputProps } from 'react-native';

import { passwordStrength } from './strength';

// Preto e branco, minimalista. Verde só para ação principal e confirmações.
export const colors = {
  bg: '#000',
  card: '#000',
  border: '#333',
  text: '#fff',
  muted: '#888',
  secondary: '#bbb', // textos secundários claros, como os detalhes de uma conta
  accent: '#22c55e',
  danger: '#fff',
};

export const RADIUS = 2;

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
  // Primário: fundo verde, texto preto. Secundário: contorno branco, texto branco.
  const filled = kind !== 'secondary';
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={({ pressed }) => [styles.btn, filled ? styles.btnFilled : styles.btnSecondary,
        { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Text style={[styles.btnText, { color: filled ? colors.bg : colors.text }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * Campo para dados sensíveis: sem autocorreção, sem sugestões e sem
 * aprendizado do teclado (no Android, 'visible-password' desliga o dicionário do Gboard).
 */
export function SecureInput(props: TextInputProps & { reveal?: boolean; ref?: Ref<TextInput> }) {
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

/** Barra de 4 segmentos com a força da senha: vermelho, laranja, amarelo, verde. */
export function StrengthBar({ password }: { password: string }) {
  const { level, label, color } = passwordStrength(password);
  return (
    <View style={styles.strength} accessibilityLabel={`Força da senha: ${label}`}>
      <View style={styles.strengthTrack}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.strengthSeg, { backgroundColor: i <= level ? color : colors.border }]} />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color }]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  strength: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  strengthTrack: { flex: 1, flexDirection: 'row', gap: 3, maxWidth: 160 },
  strengthSeg: { flex: 1, height: 3, borderRadius: 1 },
  strengthLabel: { fontSize: 11, letterSpacing: 0.3 },
  iconBtn: { padding: 6 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: RADIUS, alignItems: 'center', borderWidth: 1 },
  btnFilled: { backgroundColor: colors.accent, borderColor: colors.accent },
  btnSecondary: { backgroundColor: 'transparent', borderColor: colors.text },
  btnText: { fontWeight: '600', fontSize: 14, letterSpacing: 0.5 },
  input: {
    backgroundColor: colors.card, color: colors.text, borderWidth: 1, borderColor: colors.border,
    borderRadius: RADIUS, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  backdrop: { flex: 1, backgroundColor: '#000c', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.bg, borderRadius: RADIUS, padding: 18, gap: 12, borderWidth: 1, borderColor: colors.text },
  sheetTitle: { color: colors.text, fontSize: 17, fontWeight: '600' },
  label: { color: colors.muted, fontSize: 13 },
  error: { color: colors.text, textAlign: 'center', textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
