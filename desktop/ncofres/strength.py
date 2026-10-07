"""Força de uma senha em 4 níveis — mesma regra do app de celular (src/strength.ts).

Estimativa: comprimento × tipos de caractere usados, com penalidades para senhas
comuns, repetições e sequências (abc, 123, qwerty). É um guia, não uma garantia.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Strength:
    level: int
    label: str
    color: str


LEVELS = (
    Strength(0, "Fraca", "#ef4444"),
    Strength(1, "Média fraca", "#f97316"),
    Strength(2, "Média", "#eab308"),
    Strength(3, "Forte", "#22c55e"),
)

_COMMON = (
    "123456", "12345678", "123456789", "password", "senha", "qwerty", "abc123", "111111",
    "iloveyou", "admin", "brasil", "mudar123", "senha123", "teste", "000000", "654321",
)
_SEQUENCES = ("abcdefghijklmnopqrstuvwxyz", "01234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm")


def password_strength(password: str) -> Strength:
    if not password:
        return LEVELS[0]
    lower = password.lower()

    pool = 0
    if re.search(r"[a-z]", password):
        pool += 26
    if re.search(r"[A-Z]", password):
        pool += 26
    if re.search(r"[0-9]", password):
        pool += 10
    if re.search(r"[^a-zA-Z0-9]", password):
        pool += 33

    bits = len(password) * math.log2(max(pool, 1))

    # Muitos caracteres repetidos (ex.: "aaaaaa1!").
    if len(set(password)) / len(password) < 0.5:
        bits *= 0.6

    # Trechos em sequência (abc, 321, qwe) com 3 ou mais caracteres.
    sequential = 0
    for i in range(len(lower) - 2):
        chunk = lower[i:i + 3]
        if any(chunk in s or chunk[::-1] in s for s in _SEQUENCES):
            sequential += 1
    bits -= sequential * 4

    # Contém uma senha muito comum: no máximo "Fraca".
    if any(c in lower for c in _COMMON):
        return LEVELS[0]

    if bits < 36:
        return LEVELS[0]
    if bits < 55:
        return LEVELS[1]
    # "Forte" exige também comprimento mínimo de 12.
    if bits < 75 or len(password) < 12:
        return LEVELS[2]
    return LEVELS[3]
