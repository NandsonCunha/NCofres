# NCofres

Gerenciador de senhas para celular (Expo / React Native), simples e seguro.
Tudo fica num único arquivo `cofre.ncf` cifrado, na área privada do app.

- `App.tsx`, `src/`: app de celular
- `desktop/`: versão desktop em Python/PySide6, com o **mesmo formato de arquivo** (um `.ncf` exportado do celular abre no PC e vice-versa)

## Uso

- Três campos: **Serviço**, **Usuário ou e-mail** e **Senha**. Toque em **Confirmar** para salvar.
- O campo **Serviço** também serve de busca: a lista filtra enquanto você digita.
- **Gerar senha** preenche a senha com uma senha forte de 20 caracteres e a mostra.
- O olho revela a senha e mostra **copiar** e **ocultar**, com uma barra colorida indicando a força. Ela volta a ser ocultada sozinha após 20 s.
- Senhas copiadas são apagadas da área de transferência após 30 s.
- Engrenagem: **exportar** (menu de compartilhar), **importar** (mescla outro `.ncf`), **trocar senha mestra**, **digital** e **sobre**. Ao lado, o cadeado **trava**.
- Cofres antigos (`.gdsn`, do tempo em que o app se chamava GDSN) continuam abrindo e são convertidos para `.ncf`.

## Instalar no celular (uso diário)

Gera um APK completo que roda **100% no celular**, sem PC e sem servidor:

```bash
npx eas-cli@latest build --profile preview --platform android
```

Abra o link do final do build no celular e instale o APK.

### Dois tipos de APK

| Perfil | Comando | Atualização automática |
|---|---|---|
| `preview` | `npx eas-cli@latest build --profile preview --platform android` | Sim (EAS Update) — para testes |
| `release` | `npx eas-cli@latest build --profile release --platform android` | Não — o `expo-updates` nem entra no APK. Use para distribuir (GitHub Releases). |

O perfil `release` usa o gancho `scripts/eas-build-pre-install.js`, que roda no servidor do EAS antes do `npm install` e tira o `expo-updates` do APK. Os dois APKs são o mesmo app (`com.ncofres.app`): instalar um por cima do outro mantém o cofre.

### Atualizações (sem reinstalar, só APKs `preview`)

Mudanças de código (telas, lógica) chegam pelo EAS Update, como no app Meus Gastos:

```bash
npx eas-cli@latest update --channel preview --message "o que mudou"
```

O app baixa a atualização ao abrir e aplica **na próxima vez que for aberto**.
Só é preciso gerar um APK novo quando entrar uma biblioteca nativa nova ou mudar a `version` do `app.json`.
Nos dois casos os dados continuam: o cofre fica no armazenamento do app e a Keystore do EAS é sempre a mesma.

Como quem controla a conta Expo pode enviar código ao app, proteja a conta com senha forte e 2FA.

O app usa criptografia nativa (`react-native-quick-crypto`), então **não roda no Expo Go**.

## Desenvolver (opcional)

Para ver mudanças no código na hora, sem gerar APK a cada alteração:

```bash
npx eas-cli@latest build --profile development --platform android   # uma vez
npm start                                                             # PC e celular na mesma rede
```

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
| Digital (opcional) | A chave do cofre fica no Android Keystore, liberada só após biometria forte; invalidada se as digitais do celular mudarem; senha mestra pedida a cada 7 dias |
| Gravação | Temporário + substituição; versão anterior em `cofre.ncf.bak` |
| Print de tela | Bloqueado no Android (`FLAG_SECURE`). No iOS não dá para bloquear; a tela é borrada no seletor de apps |
| Teclado | Campos sem autocorreção/sugestões; no Android o teclado não aprende o que é digitado |
| Área de transferência | Limpa após 30 s (se o app for encerrado antes, não limpa) |
| Sem recuperação | Sem a senha mestra, o cofre é irrecuperável. Faça backups com **Exportar** |

O cofre **não** trava sozinho ao ir para segundo plano (escolha de projeto): use o cadeado ou feche o app.
