import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from ncofres import vault as v
from ncofres.vault import Entry, Vault, VaultError, WrongPasswordError, parse_line

# KDF leve só para os testes rodarem rápido.
FAST_KDF = {"name": "argon2id", "iterations": 1, "memory_kib": 1024, "lanes": 1}


class VaultTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / "c.ncf"
        patcher = mock.patch.object(v, "DEFAULT_KDF", FAST_KDF)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(self.tmp.cleanup)

    def test_roundtrip(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("google", "email@gmail.com", "senha:com:dois-pontos"))
        reopened = Vault.open(self.path, "mestra-forte-123")
        self.assertEqual(reopened.entries[0].password, "senha:com:dois-pontos")

    def test_details_and_unknown_fields(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("a", "b", "c", "detalhe"))
        self.assertEqual(Vault.open(self.path, "mestra-forte-123").entries[0].details, "detalhe")

        # Regrava com um campo que só uma versão futura conhece, e sem "details" (cofre antigo).
        from dataclasses import asdict
        raw = asdict(vault.entries[0])
        del raw["details"]
        raw["campo_futuro"] = "x"
        with mock.patch.object(v, "asdict", lambda e: raw):
            vault.save()
        reopened = Vault.open(self.path, "mestra-forte-123")
        self.assertEqual(reopened.entries[0].details, "")
        self.assertEqual(reopened.entries[0].password, "c")

    def test_legacy_gdsn_vault_opens_and_is_upgraded(self):
        with mock.patch.object(v, "FORMAT", "GDSN"):  # cofre criado pela versão antiga do app
            vault = Vault.create(self.path, "mestra-forte-123")
            vault.add(Entry("a", "b", "c"))
        self.assertEqual(json.loads(self.path.read_text())["format"], "GDSN")
        reopened = Vault.open(self.path, "mestra-forte-123")
        self.assertEqual(reopened.entries[0].password, "c")
        reopened.save()
        self.assertEqual(json.loads(self.path.read_text())["format"], "NCOFRES")
        self.assertEqual(Vault.open(self.path, "mestra-forte-123").entries[0].service, "a")

    def test_file_has_no_plaintext(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("google", "email@gmail.com", "senha123"))
        raw = self.path.read_text()
        for secret in ("google", "email@gmail.com", "senha123"):
            self.assertNotIn(secret, raw)
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)

    def test_wrong_password(self):
        Vault.create(self.path, "mestra-forte-123")
        with self.assertRaises(WrongPasswordError):
            Vault.open(self.path, "errada")

    def test_tampered_ciphertext_and_header(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("a", "b", "c"))
        doc = json.loads(self.path.read_text())
        ct = bytearray(v._b64d(doc["ciphertext"]))
        ct[0] ^= 1
        self.path.write_text(json.dumps({**doc, "ciphertext": v._b64e(bytes(ct))}))
        with self.assertRaises(WrongPasswordError):
            Vault.open(self.path, "mestra-forte-123")
        # Mudar o cabeçalho (AAD) também invalida.
        self.path.write_text(json.dumps({**doc, "kdf": {**doc["kdf"], "lanes": 2}}))
        with self.assertRaises(WrongPasswordError):
            Vault.open(self.path, "mestra-forte-123")

    def test_nonce_changes_every_save(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        n1 = json.loads(self.path.read_text())["nonce"]
        vault.save()
        n2 = json.loads(self.path.read_text())["nonce"]
        self.assertNotEqual(n1, n2)

    def test_change_master_password(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("a", "b", "c"))
        vault.change_master_password("outra-senha-456")
        with self.assertRaises(WrongPasswordError):
            Vault.open(self.path, "mestra-forte-123")
        self.assertEqual(Vault.open(self.path, "outra-senha-456").entries[0].service, "a")

    def test_rejects_absurd_kdf_params(self):
        Vault.create(self.path, "mestra-forte-123")
        doc = json.loads(self.path.read_text())
        doc["kdf"]["memory_kib"] = 10**12
        self.path.write_text(json.dumps(doc))
        with self.assertRaises(VaultError):
            Vault.open(self.path, "mestra-forte-123")

    def test_backup_written(self):
        vault = Vault.create(self.path, "mestra-forte-123")
        vault.add(Entry("a", "b", "c"))
        self.assertTrue(self.path.with_name("c.ncf.bak").exists())


class ParseTest(unittest.TestCase):
    def test_parse(self):
        e = parse_line("google: email@gmail.com: senha123")
        self.assertEqual((e.service, e.username, e.password), ("google", "email@gmail.com", "senha123"))

    def test_password_with_colons(self):
        self.assertEqual(parse_line("x: y: a:b:c").password, "a:b:c")

    def test_invalid(self):
        for bad in ("google", "google: email", ": u: p", "g: u: "):
            with self.assertRaises(ValueError):
                parse_line(bad)

    def test_generator(self):
        pw = v.generate_password(24)
        self.assertEqual(len(pw), 24)
        self.assertNotEqual(pw, v.generate_password(24))


if __name__ == "__main__":
    unittest.main()
