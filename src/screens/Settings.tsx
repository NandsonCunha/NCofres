import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { versionText } from '../appVersion';
import { STRENGTH_LEVELS } from '../strength';
import { Button, colors, Sheet, styles as ui } from '../ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

function Row({ icon, title, onPress, right }: {
  icon: IconName; title: string; onPress?: () => void; right?: React.ReactNode;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: '#111' }]}>
      <Ionicons name={icon} size={20} color={colors.text} />
      <Text style={s.rowText}>{title}</Text>
      {right ?? <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
    </Pressable>
  );
}

/** Engrenagem: reúne as opções do cofre. */
export function SettingsSheet({ biometricSupported, biometricOn, onToggleBiometric, onAbout, onExport, onImport,
  onChangeMaster, onClose }: {
  biometricSupported: boolean;
  biometricOn: boolean;
  onToggleBiometric: () => void;
  onAbout: () => void;
  onExport: () => void;
  onImport: () => void;
  onChangeMaster: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible title="Configurações" onClose={onClose}>
      <View style={s.list}>
        <Row icon="share-outline" title="Exportar cofre" onPress={onExport} />
        <Row icon="download-outline" title="Importar cofre" onPress={onImport} />
        <Row icon="key-outline" title="Trocar senha mestra" onPress={onChangeMaster} />
        {biometricSupported && (
          <Row icon="finger-print" title="Desbloquear com digital" onPress={onToggleBiometric}
            right={
              <Switch value={biometricOn} onValueChange={onToggleBiometric}
                trackColor={{ false: colors.border, true: '#14532d' }}
                thumbColor={biometricOn ? colors.accent : colors.muted} />
            } />
        )}
        <Row icon="help-circle-outline" title="Sobre o NCofres" onPress={onAbout} />
      </View>
      <Button title="Fechar" kind="secondary" onPress={onClose} />
    </Sheet>
  );
}


/** Explicação para o cliente, sem termos técnicos. */
export function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet visible title="Sobre o NCofres" onClose={onClose}>
      <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ gap: 14 }}>
        <Text style={s.p}>
          O NCofres é um cofre para as suas senhas. Tudo o que você guarda aqui fica trancado por uma
          senha mestra, que só você conhece.
        </Text>

        <View style={{ gap: 6 }}>
          <Text style={s.h}>Como ele protege você</Text>
          <Text style={s.li}>• Suas senhas ficam guardadas só neste celular, embaralhadas. Sem a senha mestra, ninguém consegue lê-las, nem mesmo nós.</Text>
          <Text style={s.li}>• Não tem cadastro, nuvem nem anúncios.</Text>
          <Text style={s.li}>• A senha mestra nunca é gravada. Por isso, se você esquecê-la, não há como recuperar o cofre.</Text>
          <Text style={s.li}>• Faça cópias de segurança em Configurações → Exportar e guarde num lugar seguro.</Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.h}>Use sempre senhas fortes</Text>
          <Text style={s.li}>• Pelo menos 12 caracteres.</Text>
          <Text style={s.li}>• Misture letras maiúsculas e minúsculas, números e símbolos (como ! @ # $).</Text>
          <Text style={s.li}>• Nunca repita a mesma senha em serviços diferentes.</Text>
          <Text style={s.li}>• Mais fácil ainda: toque em Gerar senha e o app cria uma senha forte para você.</Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.h}>A barra colorida</Text>
          <Text style={s.li}>Ao revelar uma senha, a barra abaixo dela mostra a força:</Text>
          <View style={s.legend}>
            {STRENGTH_LEVELS.map((l) => (
              <View key={l.level} style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: l.color }]} />
                <Text style={[ui.label, { color: l.color }]}>{l.label}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={s.version}>{versionText()}</Text>
      </ScrollView>
      <Button title="Fechar" kind="secondary" onPress={onClose} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  rowText: { color: colors.text, fontSize: 15, flex: 1 },
  p: { color: colors.text, fontSize: 15, lineHeight: 22 },
  h: { color: colors.text, fontSize: 15, fontWeight: '600' },
  li: { color: colors.secondary, fontSize: 14, lineHeight: 20 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 14, height: 3, borderRadius: 1 },
  version: { color: colors.muted, fontSize: 12, textAlign: 'center', paddingTop: 4 },
});
