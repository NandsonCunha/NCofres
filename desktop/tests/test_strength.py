import unittest

from ncofres.strength import password_strength
from ncofres.vault import generate_password


def level(pw: str) -> str:
    return password_strength(pw).label


class StrengthTest(unittest.TestCase):
    # Mesmos exemplos de test/strength.test.mjs: celular e PC precisam concordar.
    def test_examples(self):
        for pw in ("", "123456", "senha123", "abc", "aaaaaaaa", "Brasil2024"):
            self.assertEqual(level(pw), "Fraca", pw)
        self.assertEqual(level("gatoazul9"), "Média fraca")
        self.assertEqual(level("Gato.Azul92"), "Média")
        for pw in ("r7?HCO*p6!yZcIZ4ap%K", "Cavalo-Bateria-Grampo-42"):
            self.assertEqual(level(pw), "Forte", pw)

    def test_generated_is_strong(self):
        for _ in range(50):
            self.assertEqual(level(generate_password()), "Forte")


if __name__ == "__main__":
    unittest.main()
