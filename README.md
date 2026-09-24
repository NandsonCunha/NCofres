# GDSN

Gerenciador de senhas para celular (Expo / React Native), simples e seguro.
Tudo fica num único arquivo `cofre.gdsn` cifrado, na área privada do app.

- `App.tsx`, `src/`: app de celular
- `desktop/`: versão desktop em Python/PySide6, com o **mesmo formato de arquivo** (um `.gdsn` exportado do celular abre no PC e vice-versa)

## Uso

- Digite `google: email@gmail.com: senha123` e toque em **Confirmar**. A senha pode conter `:`.
- **🎲 Gerar senha** completa o campo com uma senha forte de 20 caracteres.
- 👁 revela a senha e mostra **copiar** e **ocultar**. Ela volta a ser ocultada sozinha após 20 s.
- Senhas copiadas são apagadas da área de transferência após 30 s.
- Ícones do topo: **importar** (mescla outro `.gdsn`), **exportar** (menu de compartilhar), **travar**.

## Rodar (development build)

O app usa criptografia nativa (`react-native-quick-crypto`), então **não roda no Expo Go**.

**Opção A: build na nuvem (EAS), sem Android Studio**
```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile development --platform android
# instale o APK gerado no celular (link/QR code no final do build)
npm start          # servidor de desenvolvimento; abra o app GDSN instalado
```

**Opção B: build local**: precisa de JDK 17 + Android SDK instalados.
```bash
npm run android
```

Só é preciso refazer o build quando mudar dependências nativas. Mudanças no código JS aparecem direto via `npm start`.

## Verificações

```bash
npm test           # formato/criptografia do cofre (+ compatibilidade com o desktop, se o Python estiver disponível)
npm run typecheck
npx expo lint
```

## Segurança

| Camada | Como |
|---|---|
| Derivação da chave | Argon2id nativo (64 MiB, 3 iterações, 4 lanes), salt aleatório de 16 bytes |
| Criptografia | AES-256-GCM (sigilo + integridade), nonce novo a cada gravação |
| Cabeçalho | Usado como AAD: adulterar parâmetros ou salt faz a abertura falhar |
| Senha mestra | Nunca é gravada; a chave derivada fica só na memória enquanto o cofre está aberto |
| Gravação | Temporário + substituição; versão anterior em `cofre.gdsn.bak` |
| Print de tela | Bloqueado no Android (`FLAG_SECURE`). No iOS não dá para bloquear; a tela é borrada no seletor de apps |
| Teclado | Campos sem autocorreção/sugestões; no Android o teclado não aprende o que é digitado |
| Área de transferência | Limpa após 30 s (se o app for encerrado antes, não limpa) |
| Sem recuperação | Sem a senha mestra, o cofre é irrecuperável. Faça backups com **Exportar** |

O cofre **não** trava sozinho ao ir para segundo plano (escolha de projeto): use o cadeado ou feche o app.
