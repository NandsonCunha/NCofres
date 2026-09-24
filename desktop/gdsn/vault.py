"""Formato do cofre GDSN e criptografia.

Arquivo .gdsn = JSON com um cabeçalho em claro (parâmetros do KDF, salt, nonce)
e o conteúdo cifrado com AES-256-GCM. A chave vem da senha mestra via Argon2id.
O cabeçalho entra como AAD: qualquer alteração nele faz a abertura falhar.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
import shutil
import string
import tempfile
import time
import uuid
from dataclasses import asdict, dataclass, field
from pathlib import Path

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.argon2 import Argon2id

FORMAT = "GDSN"
VERSION = 1

# Parâmetros padrão (~0,5 s num desktop atual). Ficam gravados no arquivo,
# então podem subir no futuro sem quebrar cofres antigos.
DEFAULT_KDF = {"name": "argon2id", "iterations": 3, "memory_kib": 262144, "lanes": 4}

# Limites para não deixar um arquivo adulterado travar a máquina.
_MAX_MEMORY_KIB = 4 * 1024 * 1024
_MAX_ITERATIONS = 64


class VaultError(Exception):
    pass


class WrongPasswordError(VaultError):
    pass


def _b64e(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64d(text: str) -> bytes:
    return base64.b64decode(text, validate=True)


def derive_key(password: str, salt: bytes, kdf: dict) -> bytes:
    if kdf.get("name") != "argon2id":
        raise VaultError(f"KDF não suportado: {kdf.get('name')}")
    if not (1 <= kdf["iterations"] <= _MAX_ITERATIONS and 8 <= kdf["memory_kib"] <= _MAX_MEMORY_KIB):
        raise VaultError("Parâmetros de KDF fora dos limites")
    return Argon2id(
        salt=salt,
        length=32,
        iterations=kdf["iterations"],
        lanes=kdf["lanes"],
        memory_cost=kdf["memory_kib"],
    ).derive(password.encode("utf-8"))


@dataclass
class Entry:
    service: str
    username: str
    password: str
    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    created: float = field(default_factory=time.time)
    updated: float = field(default_factory=time.time)


def parse_line(line: str) -> Entry:
    """'google: email@gmail.com: senha123' -> Entry.

    Só os dois primeiros ':' separam campos, então a senha pode conter ':'.
    """
    parts = line.split(":", 2)
    if len(parts) != 3:
        raise ValueError("Use o formato  serviço: usuário: senha")
    service, username = parts[0].strip(), parts[1].strip()
    password = parts[2].strip()
    if not service or not password:
        raise ValueError("Serviço e senha não podem ficar vazios")
    return Entry(service=service, username=username, password=password)


def generate_password(length: int = 20, symbols: bool = True) -> str:
    alphabet = string.ascii_letters + string.digits + ("!@#$%&*-_=+?" if symbols else "")
    while True:
        pw = "".join(secrets.choice(alphabet) for _ in range(length))
        # Garante ao menos um de cada classe pedida.
        if (any(c.islower() for c in pw) and any(c.isupper() for c in pw)
                and any(c.isdigit() for c in pw)
                and (not symbols or any(not c.isalnum() for c in pw))):
            return pw


class Vault:
    """Cofre aberto em memória. Guarda a chave derivada, não a senha mestra."""

    def __init__(self, path: Path, key: bytes, salt: bytes, kdf: dict, entries: list[Entry]):
        self.path = Path(path)
        self._key = key
        self._salt = salt
        self._kdf = kdf
        self.entries = entries

    # ---- criar / abrir -------------------------------------------------

    @classmethod
    def create(cls, path: Path, master_password: str) -> "Vault":
        salt = secrets.token_bytes(16)
        kdf = dict(DEFAULT_KDF)
        vault = cls(path, derive_key(master_password, salt, kdf), salt, kdf, [])
        vault.save()
        return vault

    @classmethod
    def open(cls, path: Path, master_password: str) -> "Vault":
        try:
            doc = json.loads(Path(path).read_text("utf-8"))
            if doc.get("format") != FORMAT:
                raise VaultError("Não é um arquivo GDSN")
            if doc.get("version") != VERSION:
                raise VaultError(f"Versão de cofre não suportada: {doc.get('version')}")
            kdf = doc["kdf"]
            salt = _b64d(doc["salt"])
            nonce = _b64d(doc["nonce"])
            ciphertext = _b64d(doc["ciphertext"])
        except (KeyError, ValueError, TypeError) as exc:
            raise VaultError(f"Arquivo corrompido: {exc}") from exc

        key = derive_key(master_password, salt, kdf)
        try:
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, _aad(kdf, salt))
        except InvalidTag:
            raise WrongPasswordError("Senha incorreta ou arquivo adulterado") from None

        data = json.loads(plaintext)
        entries = [Entry(**e) for e in data.get("entries", [])]
        return cls(path, key, salt, kdf, entries)

    # ---- salvar ----------------------------------------------------------

    def save(self) -> None:
        plaintext = json.dumps({"entries": [asdict(e) for e in self.entries]}).encode("utf-8")
        nonce = secrets.token_bytes(12)  # nonce novo a cada gravação
        ciphertext = AESGCM(self._key).encrypt(nonce, plaintext, _aad(self._kdf, self._salt))
        doc = {
            "format": FORMAT,
            "version": VERSION,
            "kdf": self._kdf,
            "salt": _b64e(self._salt),
            "nonce": _b64e(nonce),
            "ciphertext": _b64e(ciphertext),
        }
        _atomic_write(self.path, json.dumps(doc, indent=2).encode("utf-8"))

    def change_master_password(self, new_password: str) -> None:
        old = (self._salt, self._kdf, self._key)
        self._salt = secrets.token_bytes(16)
        self._kdf = dict(DEFAULT_KDF)
        self._key = derive_key(new_password, self._salt, self._kdf)
        try:
            self.save()
        except BaseException:
            self._salt, self._kdf, self._key = old
            raise

    def verify_master_password(self, password: str) -> bool:
        return secrets.compare_digest(derive_key(password, self._salt, self._kdf), self._key)

    # ---- entradas --------------------------------------------------------

    def add(self, entry: Entry) -> None:
        self.entries.append(entry)
        self.save()

    def update(self, entry_id: str, **fields) -> None:
        entry = self._get(entry_id)
        for name, value in fields.items():
            setattr(entry, name, value)
        entry.updated = time.time()
        self.save()

    def delete(self, entry_id: str) -> None:
        self.entries.remove(self._get(entry_id))
        self.save()

    def _get(self, entry_id: str) -> Entry:
        for e in self.entries:
            if e.id == entry_id:
                return e
        raise KeyError(entry_id)

    def close(self) -> None:
        # Python não permite zerar memória de forma garantida; soltamos as referências.
        self._key = b""
        self.entries = []


def _aad(kdf: dict, salt: bytes) -> bytes:
    return json.dumps({"format": FORMAT, "version": VERSION, "kdf": kdf, "salt": _b64e(salt)},
                      sort_keys=True).encode("utf-8")


def _atomic_write(path: Path, data: bytes) -> None:
    """Grava num temporário e renomeia: uma queda de energia nunca deixa o cofre pela metade.
    A versão anterior fica em <arquivo>.bak."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(data)
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)
        if path.exists():
            bak = path.with_name(path.name + ".bak")
            shutil.copyfile(path, bak)
            os.chmod(bak, 0o600)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise
