# GDSN

Gerenciador de senhas local, simples e seguro. Tudo fica num único arquivo `.gdsn` criptografado.

## Rodar

```bash
pip install -r requirements.txt   # PySide6 + cryptography
python3 -m gdsn
python3 -m unittest tests/test_vault.py
```

## Uso

- Digite `google: email@gmail.com: senha123` e clique em **Confirmar** (ou Enter). A senha pode conter `:`.
- 🎲 gera uma senha forte (20 caracteres, `secrets`).
- 👁 revela a senha → aparecem **copiar** e **ocultar**. Ela volta a ser ocultada sozinha após 20 s.
- **Cofre → Importar .txt**: importa um arquivo com uma credencial por linha no mesmo formato.
- **Ctrl+L** trava. Trava sozinho após 5 min sem uso.

## Segurança

| Camada | Como |
|---|---|
| Derivação da chave | Argon2id, 256 MiB, 3 iterações, 4 lanes, salt aleatório de 16 bytes |
| Criptografia | AES-256-GCM (confidencialidade + integridade), nonce novo a cada gravação |
| Cabeçalho | Usado como AAD: adulterar parâmetros ou salt faz a abertura falhar |
| Gravação | Arquivo temporário + `fsync` + `rename` atômico; cópia anterior em `.gdsn.bak`; permissão `600` |
| Área de transferência | Marcada como secreta (Klipper não guarda) e limpa após 20 s |
| Sem recuperação | Não existe “esqueci a senha”: sem a senha mestra, o arquivo é irrecuperável |

Formato do arquivo:

```json
{ "format": "GDSN", "version": 1,
  "kdf": {"name": "argon2id", "iterations": 3, "memory_kib": 262144, "lanes": 4},
  "salt": "...", "nonce": "...", "ciphertext": "..." }
```

Limitações conhecidas: o Python não permite apagar a memória de forma garantida, então a proteção é contra
roubo do arquivo/disco, não contra um malware rodando na sua sessão com o cofre aberto.
