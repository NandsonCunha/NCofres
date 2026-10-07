# NCofres

Gerenciador de senhas local, simples e seguro. Tudo fica num único arquivo `.ncf` criptografado.

## Rodar

```bash
pip install -r requirements.txt   # PySide6 + cryptography
python3 -m ncofres
python3 -m unittest tests/test_vault.py tests/test_strength.py
```

Para colocar o NCofres no menu de aplicativos do Linux, com ícone:

```bash
./install-linux.sh
```

## Uso

Mesmo visual e funcionamento do app de celular.

- Três campos: **Serviço** (também filtra a lista), **Usuário ou e-mail** e **Senha**. Clique em **Confirmar**.
- As contas ficam agrupadas por serviço; o **+** de um serviço adiciona outra conta nele.
- **Gerar senha** cria uma senha forte (20 caracteres, `secrets`).
- O olho revela a senha e mostra **copiar** e **ocultar**. Ela volta a ser ocultada sozinha após 20 s.
- Senhas copiadas são apagadas da área de transferência após 30 s.
- Engrenagem: **exportar** (cópia cifrada), **importar** (mescla outro `.ncf`), **trocar senha mestra** e **sobre**. Ao lado, o cadeado **trava**.
- **Ctrl+L** trava. Trava sozinho após 5 min sem uso.
- Para abrir um cofre exportado do celular: **Abrir outro cofre (.ncf)** na tela inicial. Cofres antigos (`.gdsn`) também abrem.

## Segurança

| Camada | Como |
|---|---|
| Derivação da chave | Argon2id, 256 MiB, 3 iterações, 4 lanes, salt aleatório de 16 bytes |
| Criptografia | AES-256-GCM (confidencialidade + integridade), nonce novo a cada gravação |
| Cabeçalho | Usado como AAD: adulterar parâmetros ou salt faz a abertura falhar |
| Gravação | Arquivo temporário + `fsync` + `rename` atômico; cópia anterior em `.ncf.bak`; permissão `600` |
| Área de transferência | Marcada como secreta (Klipper não guarda) e limpa após 20 s |
| Sem recuperação | Não existe “esqueci a senha”: sem a senha mestra, o arquivo é irrecuperável |

Formato do arquivo:

```json
{ "format": "NCOFRES", "version": 1,
  "kdf": {"name": "argon2id", "iterations": 3, "memory_kib": 262144, "lanes": 4},
  "salt": "...", "nonce": "...", "ciphertext": "..." }
```

Limitações conhecidas: o Python não permite apagar a memória de forma garantida, então a proteção é contra
roubo do arquivo/disco, não contra um malware rodando na sua sessão com o cofre aberto.
