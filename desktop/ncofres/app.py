"""Interface do NCofres desktop (PySide6): mesma identidade do celular, layout de duas colunas."""

from __future__ import annotations

import shutil
import sys
from datetime import date
from pathlib import Path

from PySide6.QtCore import QByteArray, QEvent, QMimeData, QObject, QSettings, QSize, QStandardPaths, Qt, QTimer
from PySide6.QtGui import QGuiApplication, QIcon, QKeySequence, QPainter, QPixmap, QShortcut
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtWidgets import (
    QApplication, QCompleter, QDialog, QFileDialog, QFrame, QGridLayout, QHBoxLayout, QLabel, QLineEdit,
    QListWidget, QListWidgetItem, QMainWindow, QMenu, QMessageBox, QPlainTextEdit, QPushButton, QScrollArea,
    QStackedWidget, QToolButton, QVBoxLayout, QWidget,
)

from . import __version__
from .strength import LEVELS, password_strength
from .vault import Entry, Vault, VaultError, WrongPasswordError, generate_password

AUTO_LOCK_MS = 5 * 60 * 1000      # trava após 5 min sem uso
CLIPBOARD_CLEAR_MS = 30 * 1000    # limpa a área de transferência após 30 s
REVEAL_HIDE_MS = 20 * 1000        # senha revelada volta a ser ocultada após 20 s
MIN_MASTER_LEN = 10
MASK = "•" * 10

# Mesma paleta do celular: preto e branco, verde só para ação principal e confirmações.
BG, BORDER, TEXT, MUTED, ACCENT = "#000000", "#333333", "#ffffff", "#888888", "#22c55e"
SECONDARY = "#bbbbbb"  # textos secundários claros, como os detalhes de uma conta

STYLE = f"""
QWidget {{ background: {BG}; color: {TEXT}; font-size: 14px; }}
QLabel#muted {{ color: {MUTED}; font-size: 12px; }}
QLabel#title {{ font-size: 18px; font-weight: 600; letter-spacing: 1px; }}
QLabel#bigTitle {{ font-size: 34px; font-weight: 300; letter-spacing: 2px; }}
QLabel#service {{ font-size: 15px; font-weight: 600; }}
QLabel#pageTitle {{ font-size: 24px; font-weight: 500; }}
QLabel#colHead {{ color: {MUTED}; font-size: 11px; letter-spacing: 1px; }}
QLabel#fieldLabel {{ color: {SECONDARY}; font-size: 12px; }}
QFrame#sidebar {{ border: none; border-right: 1px solid {BORDER}; }}
QListWidget#services {{ border: none; outline: 0; }}
QListWidget#services::item {{ border-left: 2px solid transparent; }}
QListWidget#services::item:hover {{ background: #0d0d0d; }}
QListWidget#services::item:selected {{ background: #0f2e1a; border-left: 2px solid {ACCENT}; }}
QWidget#svcItem, QWidget#svcItem QLabel {{ background: transparent; }}
QCompleter QAbstractItemView, QAbstractItemView {{ border: 1px solid {BORDER}; selection-background-color: #0f2e1a; }}
QLabel#password {{ color: {MUTED}; font-family: monospace; font-size: 14px; }}
QLabel#details {{ color: {SECONDARY}; font-size: 12px; }}
QLabel#error {{ text-decoration: underline; }}
QLineEdit, QPlainTextEdit {{
    border: 1px solid {BORDER}; border-radius: 2px; padding: 8px 10px;
    selection-background-color: {ACCENT}; selection-color: {BG};
}}
QLineEdit:focus, QPlainTextEdit:focus {{ border-color: {MUTED}; }}
QPushButton {{
    border-radius: 2px; padding: 10px 16px; font-weight: 600; letter-spacing: 0.5px;
    border: 1px solid {TEXT}; background: transparent; color: {TEXT};
}}
QPushButton#primary {{ background: {ACCENT}; border-color: {ACCENT}; color: {BG}; }}
QPushButton:disabled {{ color: #555; border-color: #555; }}
QPushButton#primary:disabled {{ background: #14532d; border-color: #14532d; color: #000; }}
QPushButton:pressed {{ background: #222; }}
QToolButton {{ border: none; padding: 4px; background: transparent; }}
QToolButton:hover {{ background: #111; }}
QFrame#card {{ border: 1px solid {BORDER}; border-radius: 2px; }}
QFrame#divider {{ background: {BORDER}; max-height: 1px; border: none; }}
QScrollArea, QScrollArea > QWidget > QWidget {{ border: none; }}
QScrollBar:vertical {{ background: {BG}; width: 8px; }}
QScrollBar::handle:vertical {{ background: {BORDER}; min-height: 24px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; }}
QDialog {{ border: 1px solid {TEXT}; }}
QMessageBox QPushButton {{ min-width: 80px; }}
QMenu {{ border: 1px solid {BORDER}; padding: 4px; }}
QMenu::item {{ padding: 8px 24px 8px 12px; }}
QMenu::item:selected {{ background: #0f2e1a; }}
QMenu::separator {{ height: 1px; background: {BORDER}; margin: 4px 0; }}
QLabel#h {{ font-size: 14px; font-weight: 600; }}
QLabel#p {{ color: {SECONDARY}; font-size: 13px; }}
"""

# Ícones de traço simples (estilo Feather, licença MIT), desenhados na cor pedida.
_ICONS = {
    "eye": '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94'
               'M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19'
               'm-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    "copy": '<rect x="9" y="9" width="13" height="13" rx="1"/>'
            '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    "edit": '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
    "trash": '<polyline points="3 6 5 6 21 6"/>'
             '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    "plus": '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    "lock": '<rect x="3" y="11" width="18" height="11" rx="1"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    "import": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
              '<polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    "export": '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>'
              '<polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    "key": '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    "settings": '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 '
                '2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 '
                '2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 '
                '2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 '
                '2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 '
                '2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 '
                '2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 '
                '2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 '
                '2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    "help": '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>'
            '<line x1="12" y1="17" x2="12.01" y2="17"/>',
}


def icon(name: str, color: str = TEXT) -> QIcon:
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="{color}" '
           f'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">{_ICONS[name]}</svg>')
    pix = QPixmap(48, 48)
    pix.fill(Qt.transparent)
    painter = QPainter(pix)
    QSvgRenderer(QByteArray(svg.encode())).render(painter)
    painter.end()
    return QIcon(pix)


def icon_button(name: str, tooltip: str, color: str = TEXT) -> QToolButton:
    btn = QToolButton()
    btn.setIcon(icon(name, color))
    btn.setIconSize(QSize(18, 18))
    btn.setToolTip(tooltip)
    btn.setCursor(Qt.PointingHandCursor)
    return btn


def button(text: str, primary: bool = False) -> QPushButton:
    btn = QPushButton(text)
    btn.setObjectName("primary" if primary else "secondary")
    btn.setCursor(Qt.PointingHandCursor)
    return btn


def label(text: str = "", name: str = "") -> QLabel:
    lbl = QLabel(text)
    if name:
        lbl.setObjectName(name)
    return lbl


def password_field(placeholder: str) -> tuple[QWidget, QLineEdit, QToolButton]:
    """Campo de senha com o olho dentro da mesma caixa."""
    edit = QLineEdit(placeholderText=placeholder, echoMode=QLineEdit.Password)
    eye = icon_button("eye", "Mostrar/ocultar senha")

    def toggle():
        hidden = edit.echoMode() == QLineEdit.Password
        edit.setEchoMode(QLineEdit.Normal if hidden else QLineEdit.Password)
        eye.setIcon(icon("eye-off" if hidden else "eye"))

    eye.clicked.connect(toggle)
    box = QWidget()
    row = QHBoxLayout(box)
    row.setContentsMargins(0, 0, 0, 0)
    row.setSpacing(4)
    row.addWidget(edit, 1)
    row.addWidget(eye)
    return box, edit, eye


def details_field(text: str = "", placeholder: str = "") -> QPlainTextEdit:
    """Campo de detalhes: texto livre de até ~3 linhas."""
    edit = QPlainTextEdit(text)
    edit.setPlaceholderText(placeholder)
    edit.setTabChangesFocus(True)
    edit.setFixedHeight(64)
    return edit


class StrengthBar(QWidget):
    """Barra de 4 segmentos com a força da senha: vermelho, laranja, amarelo, verde."""

    def __init__(self, password: str = ""):
        super().__init__()
        lay = QHBoxLayout(self)
        lay.setContentsMargins(0, 2, 0, 2)
        lay.setSpacing(3)
        self.segments = []
        for _ in range(4):
            seg = QFrame()
            seg.setFixedSize(30, 3)
            lay.addWidget(seg)
            self.segments.append(seg)
        lay.addSpacing(6)
        self.text = QLabel()
        lay.addWidget(self.text)
        lay.addStretch()
        self.set_password(password)

    def set_password(self, password: str):
        s = password_strength(password)
        for i, seg in enumerate(self.segments):
            seg.setStyleSheet(f"background: {s.color if i <= s.level else BORDER}; border: none;")
        self.text.setText(s.label)
        self.text.setStyleSheet(f"color: {s.color}; font-size: 11px;")


def ask(parent, title: str, text: str) -> bool:
    return QMessageBox.question(parent, title, text) == QMessageBox.Yes


class SecureClipboard:
    """Copia marcando o conteúdo como secreto e limpa depois de um tempo."""

    def __init__(self):
        self._last = None
        self._timer = QTimer(singleShot=True, interval=CLIPBOARD_CLEAR_MS, timeout=self.clear)

    def copy(self, text: str) -> None:
        mime = QMimeData()
        mime.setText(text)
        # KDE Klipper e outros gerenciadores respeitam esta dica e não guardam no histórico.
        mime.setData("x-kde-passwordManagerHint", b"secret")
        QGuiApplication.clipboard().setMimeData(mime)
        self._last = text
        self._timer.start()

    def clear(self) -> None:
        cb = QGuiApplication.clipboard()
        # Só limpa se ainda for o que nós copiamos.
        if self._last is not None and cb.text() == self._last:
            cb.clear()
        self._last = None


# --------------------------------------------------------------------- diálogos

class FormDialog(QDialog):
    """Diálogo simples no estilo do app: título, campos e botões Cancelar / ação."""

    def __init__(self, parent, title: str, action: str):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setMinimumWidth(380)
        self.body = QVBoxLayout(self)
        self.body.setSpacing(10)
        self.body.setContentsMargins(18, 18, 18, 18)
        self.body.addWidget(label(title, "service"))
        self.error = label("", "error")
        self.error.setWordWrap(True)
        self.error.hide()
        self.buttons = QHBoxLayout()
        cancel = button("Cancelar")
        cancel.clicked.connect(self.reject)
        self.ok = button(action, primary=True)
        self.ok.clicked.connect(self._submit)
        self.buttons.addWidget(cancel, 1)
        self.buttons.addWidget(self.ok, 1)

    def finish_layout(self):
        self.body.addWidget(self.error)
        self.body.addLayout(self.buttons)

    def fail(self, message: str):
        self.error.setText(message)
        self.error.show()

    def validate(self) -> str | None:
        return None

    def _submit(self):
        problem = self.validate()
        if problem:
            self.fail(problem)
        else:
            self.accept()


class MasterPasswordDialog(FormDialog):
    """Definir senha mestra (novo cofre ou troca de senha)."""

    def __init__(self, parent, title: str, ask_current: bool = False):
        super().__init__(parent, title, "Salvar" if ask_current else "Criar cofre")
        self.current = None
        if ask_current:
            box, self.current, _ = password_field("Senha atual")
            self.body.addWidget(box)
        box, self.new, _ = password_field("Nova senha mestra")
        self.body.addWidget(box)
        box, self.confirm, _ = password_field("Confirmar senha mestra")
        self.body.addWidget(box)
        hint = label(f"Mínimo {MIN_MASTER_LEN} caracteres. Uma frase longa (4–5 palavras aleatórias) "
                     "é forte e fácil de lembrar.\nSe você esquecer esta senha, NÃO há como recuperar o cofre.",
                     "muted")
        hint.setWordWrap(True)
        self.body.addWidget(hint)
        self.finish_layout()

    def validate(self):
        if len(self.new.text()) < MIN_MASTER_LEN:
            return f"A senha precisa ter pelo menos {MIN_MASTER_LEN} caracteres."
        if self.new.text() != self.confirm.text():
            return "As senhas não conferem."
        return None


class EditEntryDialog(FormDialog):
    def __init__(self, parent, entry: Entry):
        super().__init__(parent, f"Editar — {entry.service}", "Salvar")
        self.service = QLineEdit(entry.service, placeholderText="Serviço")
        self.username = QLineEdit(entry.username, placeholderText="Usuário ou e-mail")
        self.details = details_field(entry.details)
        box, self.password, eye = password_field("Senha")
        self.password.setText(entry.password)
        gen = icon_button("key", "Gerar senha forte")

        def generate():
            self.password.setText(generate_password())
            if self.password.echoMode() == QLineEdit.Password:
                eye.click()

        gen.clicked.connect(generate)
        box.layout().addWidget(gen)
        strength = StrengthBar(entry.password)
        self.password.textChanged.connect(strength.set_password)
        for caption, widget in (("Serviço", self.service), ("Usuário ou e-mail", self.username), ("Senha", box),
                                (None, strength), ("Detalhes", self.details)):
            if caption:
                self.body.addWidget(label(caption, "muted"))
            self.body.addWidget(widget)
        self.finish_layout()

    def validate(self):
        if not self.service.text().strip() or not self.password.text():
            return "Serviço e senha não podem ficar vazios."
        return None


class ImportDialog(FormDialog):
    """Pede a senha mestra de um cofre (.ncf) escolhido e devolve as contas dele."""

    def __init__(self, parent, path: Path):
        super().__init__(parent, "Importar cofre", "Importar")
        self.path = path
        self.entries: list[Entry] = []
        text = label(f"Digite a senha mestra de {path.name}. As contas serão adicionadas ao seu cofre.", "muted")
        text.setWordWrap(True)
        self.body.addWidget(text)
        box, self.password, _ = password_field("Senha mestra do arquivo")
        self.password.returnPressed.connect(self._submit)
        self.body.addWidget(box)
        self.finish_layout()

    def validate(self):
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            other = Vault.open(self.path, self.password.text())
            self.entries = list(other.entries)
            other.close()
        except WrongPasswordError as exc:
            return str(exc)
        except (VaultError, OSError) as exc:
            return f"Erro ao abrir: {exc}"
        finally:
            QApplication.restoreOverrideCursor()
        return None


class AboutDialog(QDialog):
    """Explicação para o cliente, sem termos técnicos."""

    def __init__(self, parent, welcome: bool = False):
        # welcome: primeira abertura do app — mesmo conteúdo, com título de boas-vindas.
        super().__init__(parent)
        title = "Bem-vindo ao NCofres" if welcome else "Sobre o NCofres"
        self.setWindowTitle(title)
        self.setFixedWidth(500)
        lay = QVBoxLayout(self)
        lay.setContentsMargins(24, 22, 24, 20)
        lay.setSpacing(6)

        def para(text: str, name: str = "p"):
            lbl = label(text, name)
            lbl.setWordWrap(True)
            lay.addWidget(lbl)

        lay.addWidget(label(title, "service"))
        lay.addSpacing(6)
        para("O NCofres é um cofre para as suas senhas. Tudo o que você guarda aqui fica trancado por uma "
             "senha mestra, que só você conhece.", "")
        lay.addSpacing(10)
        para("Como ele protege você", "h")
        for text in ("• Suas senhas ficam guardadas só neste computador, embaralhadas. Sem a senha mestra, "
                     "ninguém consegue lê-las, nem mesmo nós.",
                     "• Não tem cadastro, nuvem nem anúncios.",
                     "• A senha mestra nunca é gravada. Por isso, se você esquecê-la, não há como recuperar o cofre.",
                     "• Faça cópias de segurança em Configurações → Exportar e guarde num lugar seguro."):
            para(text)
        lay.addSpacing(10)
        para("Use sempre senhas fortes", "h")
        for text in ("• Pelo menos 12 caracteres.",
                     "• Misture letras maiúsculas e minúsculas, números e símbolos (como ! @ # $).",
                     "• Nunca repita a mesma senha em serviços diferentes.",
                     "• Mais fácil ainda: clique em Gerar senha e o app cria uma senha forte para você."):
            para(text)
        lay.addSpacing(10)
        para("A barra colorida", "h")
        para("Ao revelar uma senha, a barra abaixo dela mostra a força:")
        legend = QHBoxLayout()
        for lvl in LEVELS:
            dot = QFrame()
            dot.setFixedSize(14, 3)
            dot.setStyleSheet(f"background: {lvl.color}; border: none;")
            text = QLabel(lvl.label)
            text.setStyleSheet(f"color: {lvl.color}; font-size: 12px;")
            legend.addWidget(dot)
            legend.addWidget(text)
            legend.addSpacing(10)
        legend.addStretch()
        lay.addLayout(legend)
        lay.addSpacing(14)
        version = label(f"Versão {__version__}", "muted")
        version.setAlignment(Qt.AlignCenter)
        lay.addWidget(version)
        close = button("Começar" if welcome else "Fechar", primary=welcome)
        close.clicked.connect(self.accept)
        lay.addWidget(close)
        lay.setSizeConstraint(QVBoxLayout.SetFixedSize)


# --------------------------------------------------------------------- telas

class UnlockScreen(QWidget):
    def __init__(self, window: "MainWindow"):
        super().__init__()
        self.window = window
        outer = QVBoxLayout(self)
        outer.addStretch()
        box = QWidget()
        box.setMaximumWidth(380)
        lay = QVBoxLayout(box)
        lay.setSpacing(12)

        title = label("NCofres", "bigTitle")
        title.setAlignment(Qt.AlignCenter)
        lay.addWidget(title)
        self.subtitle = label("", "muted")
        self.subtitle.setAlignment(Qt.AlignCenter)
        self.subtitle.setWordWrap(True)
        lay.addWidget(self.subtitle)

        pw_box, self.password, _ = password_field("Senha mestra")
        self.password.returnPressed.connect(self.unlock)
        lay.addWidget(pw_box)

        self.error = label("", "error")
        self.error.setAlignment(Qt.AlignCenter)
        self.error.setWordWrap(True)
        lay.addWidget(self.error)

        self.unlock_btn = button("Desbloquear", primary=True)
        self.unlock_btn.clicked.connect(self.unlock)
        lay.addWidget(self.unlock_btn)
        new_btn = button("Criar novo cofre")
        new_btn.clicked.connect(self.create_vault)
        open_btn = button("Abrir outro cofre (.ncf)")
        open_btn.clicked.connect(self.choose_file)
        lay.addWidget(new_btn)
        lay.addWidget(open_btn)

        h = QHBoxLayout()
        h.addStretch()
        h.addWidget(box, 1)
        h.addStretch()
        outer.addLayout(h)
        outer.addStretch()
        self.refresh()

    def refresh(self):
        path = self.window.vault_path
        exists = path is not None and path.exists()
        self.subtitle.setText(f"Digite a senha mestra\n{path}" if exists
                              else "Nenhum cofre encontrado. Crie um novo ou abra um exportado do celular.")
        self.password.setEnabled(exists)
        self.unlock_btn.setEnabled(exists)
        self.password.clear()
        self.error.clear()
        if exists:
            self.password.setFocus()

    def unlock(self):
        if not self.password.text():
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            vault = Vault.open(self.window.vault_path, self.password.text())
        except WrongPasswordError as exc:
            self.error.setText(str(exc))
            self.password.selectAll()
            return
        except (VaultError, OSError) as exc:
            self.error.setText(f"Erro ao abrir: {exc}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.password.clear()
        self.window.on_unlocked(vault)

    def choose_file(self):
        path, _ = QFileDialog.getOpenFileName(self, "Abrir cofre", str(Path.home()),
                                              "Cofre NCofres (*.ncf *.gdsn);;Todos (*)")
        if path:
            self.window.set_vault_path(Path(path))
            self.refresh()

    def create_vault(self):
        start = str(self.window.vault_path or default_vault_path())
        path, _ = QFileDialog.getSaveFileName(self, "Novo cofre", start, "Cofre NCofres (*.ncf)")
        if not path:
            return
        path = Path(path)
        if path.suffix != ".ncf":
            path = path.with_suffix(".ncf")
        dlg = MasterPasswordDialog(self, "Criar cofre")
        if dlg.exec() != QDialog.Accepted:
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            vault = Vault.create(path, dlg.new.text())
        except OSError as exc:
            QMessageBox.critical(self, "NCofres", f"Não foi possível criar o cofre:\n{exc}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.window.set_vault_path(path)
        self.window.on_unlocked(vault)


class AccountRow(QObject):
    """Uma conta numa linha da tabela do serviço: usuário, senha oculta, detalhes e ações."""

    def __init__(self, screen: "VaultScreen", entry: Entry, parent: QWidget):
        super().__init__(parent)
        self.entry = entry

        self.user_cell = QWidget()
        user_lay = QHBoxLayout(self.user_cell)
        user_lay.setContentsMargins(0, 0, 0, 0)
        user_lay.setSpacing(2)
        user = label(entry.username or "—")
        user.setTextInteractionFlags(Qt.TextSelectableByMouse)
        user_lay.addWidget(user)
        if entry.username:
            copy_user = icon_button("copy", "Copiar usuário", MUTED)
            copy_user.clicked.connect(lambda: screen.copy(entry.username, "Usuário copiado"))
            user_lay.addWidget(copy_user)
        user_lay.addStretch()

        # Oculto: só o olho. Revelado: copiar (verde) + ocultar.
        self.pw_cell = QWidget()
        pw_col = QVBoxLayout(self.pw_cell)
        pw_col.setContentsMargins(0, 0, 0, 0)
        pw_col.setSpacing(0)
        pw_lay = QHBoxLayout()
        pw_lay.setSpacing(2)
        pw_col.addLayout(pw_lay)
        self.pw_label = label(MASK, "password")
        pw_lay.addWidget(self.pw_label)
        self.reveal_btn = icon_button("eye", "Revelar senha", MUTED)
        self.reveal_btn.clicked.connect(self.reveal)
        self.copy_btn = icon_button("copy", "Copiar senha", ACCENT)
        self.copy_btn.clicked.connect(lambda: screen.copy(entry.password, "Senha copiada"))
        self.hide_btn = icon_button("eye-off", "Ocultar senha", MUTED)
        self.hide_btn.clicked.connect(self.conceal)
        for b in (self.reveal_btn, self.copy_btn, self.hide_btn):
            pw_lay.addWidget(b)
        pw_lay.addStretch()
        self.strength = StrengthBar(entry.password)
        pw_col.addWidget(self.strength)

        self.details = label(entry.details or "—", "details")
        self.details.setWordWrap(True)
        self.details.setTextInteractionFlags(Qt.TextSelectableByMouse)

        self.actions = QWidget()
        act_lay = QHBoxLayout(self.actions)
        act_lay.setContentsMargins(0, 0, 0, 0)
        act_lay.setSpacing(2)
        edit_btn = icon_button("edit", "Editar")
        edit_btn.clicked.connect(lambda: screen.edit_entry(entry))
        del_btn = icon_button("trash", "Excluir")
        del_btn.clicked.connect(lambda: screen.delete_entry(entry))
        act_lay.addWidget(edit_btn)
        act_lay.addWidget(del_btn)

        self._auto_hide = QTimer(self, singleShot=True, interval=REVEAL_HIDE_MS, timeout=self.conceal)
        self.conceal()

    def place(self, grid: QGridLayout, row: int):
        grid.addWidget(self.user_cell, row, 0)
        grid.addWidget(self.pw_cell, row, 1)
        grid.addWidget(self.details, row, 2)
        grid.addWidget(self.actions, row, 3, Qt.AlignRight)

    def reveal(self):
        self.pw_label.setText(self.entry.password)
        self.pw_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.reveal_btn.hide()
        self.copy_btn.show()
        self.hide_btn.show()
        self.strength.show()
        self._auto_hide.start()

    def conceal(self):
        self.pw_label.setText(MASK)
        self.pw_label.setTextInteractionFlags(Qt.NoTextInteraction)
        self.reveal_btn.show()
        self.copy_btn.hide()
        self.hide_btn.hide()
        self.strength.hide()
        self._auto_hide.stop()


class ServicePage(QWidget):
    """Painel da direita: todas as contas de um serviço, em forma de tabela."""

    def __init__(self, screen: "VaultScreen"):
        super().__init__()
        self.screen = screen
        self.service = ""
        self.rows: list[AccountRow] = []
        lay = QVBoxLayout(self)
        lay.setContentsMargins(32, 28, 32, 16)
        lay.setSpacing(20)

        header = QHBoxLayout()
        titles = QVBoxLayout()
        titles.setSpacing(2)
        self.title = label("", "pageTitle")
        self.count = label("", "muted")
        titles.addWidget(self.title)
        titles.addWidget(self.count)
        header.addLayout(titles, 1)
        add = button("+  Adicionar conta")
        add.clicked.connect(lambda: screen.add_account(self.service))
        header.addWidget(add, 0, Qt.AlignTop)
        lay.addLayout(header)

        self.table_host = QWidget()
        self.grid = QGridLayout(self.table_host)
        self.grid.setContentsMargins(0, 0, 0, 0)
        self.grid.setHorizontalSpacing(24)
        self.grid.setVerticalSpacing(10)
        self.grid.setAlignment(Qt.AlignTop)
        for col, stretch in enumerate((3, 3, 4, 0)):
            self.grid.setColumnStretch(col, stretch)
        scroll = QScrollArea(widgetResizable=True)
        scroll.setWidget(self.table_host)
        lay.addWidget(scroll, 1)

    def show_service(self, service: str, entries: list[Entry]):
        self.service = service
        self.title.setText(service)
        self.count.setText(f"{len(entries)} {'conta' if len(entries) == 1 else 'contas'}")
        # Esconde já os widgets antigos: deleteLater só os apaga no próximo ciclo de eventos.
        while (item := self.grid.takeAt(0)) is not None:
            if item.widget():
                item.widget().hide()
                item.widget().deleteLater()
        for old in self.rows:
            old.deleteLater()
        self.rows = []
        for col, text in enumerate(("USUÁRIO OU E-MAIL", "SENHA", "DETALHES")):
            self.grid.addWidget(label(text, "colHead"), 0, col)
        row = 1
        for entry in entries:
            line = QFrame()
            line.setObjectName("divider")
            self.grid.addWidget(line, row, 0, 1, 4)
            account = AccountRow(self.screen, entry, self.table_host)
            account.place(self.grid, row + 1)
            self.rows.append(account)
            row += 2


class NewEntryForm(QWidget):
    """Painel da direita: formulário de nova conta."""

    def __init__(self, screen: "VaultScreen"):
        super().__init__()
        self.screen = screen
        outer = QVBoxLayout(self)
        outer.setContentsMargins(32, 28, 32, 16)
        box = QWidget()
        box.setMaximumWidth(640)
        lay = QVBoxLayout(box)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(8)

        self.title = label("Novo serviço", "pageTitle")
        lay.addWidget(self.title)
        lay.addWidget(label("Tudo é criptografado antes de ser salvo.", "muted"))
        lay.addSpacing(16)

        lay.addWidget(label("Serviço", "fieldLabel"))
        self.service = QLineEdit(placeholderText="Ex.: Google")
        self.completer = QCompleter([])
        self.completer.setCaseSensitivity(Qt.CaseInsensitive)
        self.completer.setFilterMode(Qt.MatchContains)
        self.service.setCompleter(self.completer)
        lay.addWidget(self.service)
        lay.addSpacing(8)

        row = QHBoxLayout()
        row.setSpacing(16)
        col_user = QVBoxLayout()
        col_user.setSpacing(8)
        col_user.addWidget(label("Usuário ou e-mail", "fieldLabel"))
        self.username = QLineEdit(placeholderText="Ex.: voce@gmail.com")
        col_user.addWidget(self.username)
        col_pw = QVBoxLayout()
        col_pw.setSpacing(8)
        col_pw.addWidget(label("Senha", "fieldLabel"))
        pw_box, self.password, self.pw_eye = password_field("Senha")
        self.password.returnPressed.connect(self.submit)
        col_pw.addWidget(pw_box)
        self.strength = StrengthBar()
        self.password.textChanged.connect(self.strength.set_password)
        self.password.textChanged.connect(lambda t: self.strength.setVisible(bool(t)))
        policy = self.strength.sizePolicy()
        policy.setRetainSizeWhenHidden(True)
        self.strength.setSizePolicy(policy)
        self.strength.hide()
        col_pw.addWidget(self.strength)
        col_user.addStretch()
        row.addLayout(col_user, 1)
        row.addLayout(col_pw, 1)
        lay.addLayout(row)
        lay.addSpacing(8)

        lay.addWidget(label("Detalhes (opcional)", "fieldLabel"))
        self.details = details_field(placeholder="Ex.: conta do trabalho, 2FA no celular")
        lay.addWidget(self.details)
        lay.addSpacing(16)

        actions = QHBoxLayout()
        gen = button("Gerar senha")
        gen.clicked.connect(self.generate)
        cancel = button("Cancelar")
        cancel.clicked.connect(screen.cancel_form)
        self.confirm = button("Confirmar", primary=True)
        self.confirm.clicked.connect(self.submit)
        actions.addWidget(gen)
        actions.addStretch()
        actions.addWidget(cancel)
        actions.addWidget(self.confirm)
        lay.addLayout(actions)

        for w in (self.service, self.password):
            w.textChanged.connect(self._update_confirm)
        QShortcut(QKeySequence(Qt.Key_Escape), self, activated=screen.cancel_form)

        outer.addWidget(box)
        outer.addStretch()

    def reset(self, service: str, known_services: list[str]):
        # Botão da lateral: serviço novo. "+ Adicionar conta": outra conta num serviço existente.
        self.title.setText(f"Nova conta em {service}" if service else "Novo serviço")
        self.completer.model().setStringList(known_services)
        for w in (self.service, self.username, self.password, self.details):
            w.clear()
        if self.password.echoMode() == QLineEdit.Normal:
            self.pw_eye.click()
        self.service.setText(service)
        (self.username if service else self.service).setFocus()
        self._update_confirm()

    def _update_confirm(self):
        self.confirm.setEnabled(bool(self.service.text().strip() and self.password.text()))

    def generate(self):
        self.password.setText(generate_password())
        if self.password.echoMode() == QLineEdit.Password:
            self.pw_eye.click()

    def submit(self):
        self.screen.confirm_new(self.service.text().strip(), self.username.text().strip(),
                                self.password.text(), self.details.toPlainText().strip())


class VaultScreen(QWidget):
    """Cofre aberto: lista de serviços à esquerda, contas ou formulário à direita."""

    def __init__(self, window: "MainWindow"):
        super().__init__()
        self.window = window
        self.vault: Vault | None = None
        self.clipboard = SecureClipboard()
        self.groups: dict[str, tuple[str, list[Entry]]] = {}

        root = QHBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ---- barra lateral
        sidebar = QFrame()
        sidebar.setObjectName("sidebar")
        sidebar.setFixedWidth(290)
        side = QVBoxLayout(sidebar)
        side.setContentsMargins(16, 20, 16, 16)
        side.setSpacing(12)

        top = QHBoxLayout()
        top.addWidget(label("NCofres", "title"))
        top.addStretch()
        gear = icon_button("settings", "Configurações")
        gear.setPopupMode(QToolButton.InstantPopup)
        gear.setStyleSheet("QToolButton::menu-indicator { image: none; }")
        menu = QMenu(gear)
        menu.addAction(icon("export"), "Exportar cofre", self.export_vault)
        menu.addAction(icon("import"), "Importar cofre", self.import_vault)
        menu.addAction(icon("key"), "Trocar senha mestra", window.change_master)
        menu.addSeparator()
        menu.addAction(icon("help"), "Sobre o NCofres", lambda: AboutDialog(self).exec())
        gear.setMenu(menu)
        top.addWidget(gear)
        lock = icon_button("lock", "Travar (Ctrl+L)", ACCENT)
        lock.clicked.connect(window.lock)
        top.addWidget(lock)
        side.addLayout(top)

        self.search = QLineEdit(placeholderText="Buscar serviço ou usuário")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(lambda: self.refresh())
        side.addWidget(self.search)

        self.list = QListWidget()
        self.list.setObjectName("services")
        self.list.currentItemChanged.connect(self._on_select)
        side.addWidget(self.list, 1)
        self.no_results = label("Nada encontrado.", "muted")
        self.no_results.setAlignment(Qt.AlignCenter)
        side.addWidget(self.no_results)

        self.total = label("", "muted")
        side.addWidget(self.total)
        new_btn = button("+  Novo serviço", primary=True)
        new_btn.setToolTip("Ctrl+N")
        new_btn.clicked.connect(self.new_entry)
        side.addWidget(new_btn)
        root.addWidget(sidebar)

        # ---- painel da direita
        right = QVBoxLayout()
        right.setContentsMargins(0, 0, 0, 0)
        right.setSpacing(0)
        self.pages = QStackedWidget()
        self.service_page = ServicePage(self)
        self.form = NewEntryForm(self)
        self.empty_page = QWidget()
        empty = QVBoxLayout(self.empty_page)
        empty.addStretch()
        for text, name in (("Seu cofre está vazio", "pageTitle"),
                           ("Adicione a primeira conta: serviço, usuário e senha.", "muted")):
            lbl = label(text, name)
            lbl.setAlignment(Qt.AlignCenter)
            empty.addWidget(lbl)
        first = button("+  Novo serviço", primary=True)
        first.clicked.connect(self.new_entry)
        empty.addSpacing(12)
        empty.addWidget(first, 0, Qt.AlignCenter)
        empty.addStretch()
        for page in (self.service_page, self.form, self.empty_page):
            self.pages.addWidget(page)
        right.addWidget(self.pages, 1)

        self.status = label("", "muted")
        self.status.setAlignment(Qt.AlignRight)
        self.status.setContentsMargins(32, 6, 32, 12)
        right.addWidget(self.status)
        root.addLayout(right, 1)
        self._status_timer = QTimer(self, singleShot=True, interval=4000, timeout=self._reset_status)

        QShortcut(QKeySequence("Ctrl+N"), self, activated=self.new_entry)
        QShortcut(QKeySequence("Ctrl+F"), self, activated=self.search.setFocus)

    # ---- estado ---------------------------------------------------------

    def load(self, vault: Vault):
        self.vault = vault
        self.search.clear()
        self.refresh()
        if not vault.entries:
            self.pages.setCurrentWidget(self.empty_page)

    def unload(self):
        self.vault = None
        self.search.clear()
        self.clipboard.clear()
        self.form.reset("", [])
        self.refresh()

    def flash(self, text: str, ok: bool = True):
        """Confirmações em verde; avisos em branco."""
        self.status.setText(text)
        self.status.setStyleSheet(f"color: {ACCENT if ok else TEXT};")
        self._status_timer.start()

    def _reset_status(self):
        self.status.setStyleSheet("")
        self.status.setText("")

    def refresh(self, select: str | None = None):
        """Reconstrói a lista lateral (filtrada pela busca) e mantém ou muda a seleção."""
        current = select or (self.list.currentItem().data(Qt.UserRole) if self.list.currentItem() else None)
        self.list.blockSignals(True)
        self.list.clear()
        self.groups = {}
        if self.vault is not None:
            for e in self.vault.entries:
                self.groups.setdefault(e.service.lower(), (e.service, []))[1].append(e)
        term = self.search.text().strip().lower()
        shown = [k for k in sorted(self.groups)
                 if not term or term in k or any(term in e.username.lower() for e in self.groups[k][1])]
        for key in shown:
            name, entries = self.groups[key]
            item = QListWidgetItem()
            item.setData(Qt.UserRole, key)
            row = QWidget()
            row.setObjectName("svcItem")
            row_lay = QHBoxLayout(row)
            row_lay.setContentsMargins(12, 8, 12, 8)
            row_lay.addWidget(label(name), 1)
            row_lay.addWidget(label(str(len(entries)), "muted"))
            item.setSizeHint(row.sizeHint())
            self.list.addItem(item)
            self.list.setItemWidget(item, row)
        self.list.blockSignals(False)

        n = len(self.vault.entries) if self.vault else 0
        g = len(self.groups)
        self.total.setText(f"{g} {'serviço' if g == 1 else 'serviços'} · {n} {'conta' if n == 1 else 'contas'}"
                           if n else "")
        self.no_results.setVisible(bool(term) and not shown)

        if self.vault is None:
            return
        if not self.groups:
            if self.pages.currentWidget() is not self.form:
                self.pages.setCurrentWidget(self.empty_page)
            return
        target = current.lower() if current else None
        keys = [self.list.item(i).data(Qt.UserRole) for i in range(self.list.count())]
        if target in keys:
            self.list.setCurrentRow(keys.index(target))
        elif keys and self.pages.currentWidget() is not self.form:
            self.list.setCurrentRow(0)
        if self.pages.currentWidget() is self.service_page or select:
            self._show_current()

    def _on_select(self, *_):
        self._show_current()

    def _show_current(self):
        item = self.list.currentItem()
        if item is None:
            return
        name, entries = self.groups[item.data(Qt.UserRole)]
        self.service_page.show_service(name, sorted(entries, key=lambda e: e.username.lower()))
        self.pages.setCurrentWidget(self.service_page)

    # ---- ações ----------------------------------------------------------

    def _service_names(self) -> list[str]:
        return sorted({name for name, _ in self.groups.values()}, key=str.lower)

    def new_entry(self):
        if self.vault is None:
            return
        self.list.clearSelection()
        self.form.reset("", self._service_names())
        self.pages.setCurrentWidget(self.form)

    def add_account(self, service: str):
        self.form.reset(service, self._service_names())
        self.pages.setCurrentWidget(self.form)

    def cancel_form(self):
        if self.pages.currentWidget() is not self.form:
            return
        if self.groups:
            self.refresh()
            self._show_current()
        else:
            self.pages.setCurrentWidget(self.empty_page)

    def confirm_new(self, typed: str, username: str, password: str, details: str):
        if not typed or not password:
            return self.flash("Preencha serviço e senha", ok=False)
        # Se o serviço já existe (ignorando maiúsculas), reaproveita o nome: "google" entra em "Google".
        existing = next((e.service for e in self.vault.entries if e.service.lower() == typed.lower()), typed)
        entry = Entry(service=existing, username=username, password=password, details=details)
        dup = any(e.service.lower() == entry.service.lower() and e.username == entry.username
                  for e in self.vault.entries)
        if dup and not ask(self, "Já existe", f"{entry.service} / {entry.username or 'sem usuário'} já está "
                                              "no cofre. Adicionar mesmo assim?"):
            return
        if not self._try_save(lambda: self.vault.add(entry)):
            self.vault.entries.remove(entry)
            return
        self.search.clear()
        self.refresh(select=entry.service)
        self.flash(f"“{entry.service}” salvo e criptografado")

    def copy(self, text: str, what: str):
        self.clipboard.copy(text)
        self.flash(f"{what} — será apagado em {CLIPBOARD_CLEAR_MS // 1000} s")

    def edit_entry(self, entry: Entry):
        dlg = EditEntryDialog(self, entry)
        if dlg.exec() != QDialog.Accepted:
            return
        if self._try_save(lambda: self.vault.update(
                entry.id, service=dlg.service.text().strip(),
                username=dlg.username.text().strip(), password=dlg.password.text(),
                details=dlg.details.toPlainText().strip())):
            self.flash(f"“{entry.service}” atualizado")
        self.refresh(select=entry.service)

    def delete_entry(self, entry: Entry):
        if not ask(self, "Excluir", f"Excluir “{entry.service}” ({entry.username or 'sem usuário'})?"):
            return
        self._try_save(lambda: self.vault.delete(entry.id))
        self.refresh(select=entry.service)
        if not self.vault.entries:
            self.pages.setCurrentWidget(self.empty_page)

    def import_vault(self):
        path, _ = QFileDialog.getOpenFileName(self, "Importar cofre", str(Path.home()),
                                              "Cofre NCofres (*.ncf *.gdsn);;Todos (*)")
        if not path:
            return
        dlg = ImportDialog(self, Path(path))
        if dlg.exec() != QDialog.Accepted:
            return
        # Mescla: entradas já existentes (mesmo id ou mesmo conteúdo) são ignoradas.
        known = {e.id for e in self.vault.entries}
        content = {(e.service, e.username, e.password) for e in self.vault.entries}
        added = [e for e in dlg.entries if e.id not in known and (e.service, e.username, e.password) not in content]
        self.vault.entries.extend(added)
        if not self._try_save(self.vault.save):
            for e in added:
                self.vault.entries.remove(e)
            return
        self.refresh()
        self._show_current()
        self.flash(f"{len(added)} contas importadas ({len(dlg.entries) - len(added)} já existiam)")

    def export_vault(self):
        start = str(Path.home() / f"ncofres-{date.today().isoformat()}.ncf")
        path, _ = QFileDialog.getSaveFileName(self, "Exportar cópia do cofre", start, "Cofre NCofres (*.ncf)")
        if not path:
            return
        try:
            shutil.copyfile(self.vault.path, path)  # o arquivo já está cifrado
        except OSError as exc:
            QMessageBox.critical(self, "NCofres", f"Falha ao exportar:\n{exc}")
            return
        self.flash(f"Cópia cifrada salva em {Path(path).name}")

    def _try_save(self, action) -> bool:
        try:
            action()
            return True
        except OSError as exc:
            QMessageBox.critical(self, "NCofres", f"Falha ao salvar o cofre:\n{exc}")
            return False


# --------------------------------------------------------------------- janela

class ActivityFilter(QObject):
    """Reinicia o timer de auto-bloqueio a cada interação do usuário."""

    def __init__(self, timer: QTimer):
        super().__init__()
        self.timer = timer

    def eventFilter(self, obj, event):
        if event.type() in (QEvent.KeyPress, QEvent.MouseButtonPress, QEvent.Wheel):
            if self.timer.isActive():
                self.timer.start()
        return False


def default_vault_path() -> Path:
    base = QStandardPaths.writableLocation(QStandardPaths.AppDataLocation)
    return Path(base) / "cofre.ncf"


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("NCofres")
        self.resize(1040, 660)
        self.setMinimumSize(780, 480)
        self.settings = QSettings("NCofres", "NCofres")  # guarda só o caminho do cofre, nada secreto
        # Continua abrindo o cofre usado antes da troca de nome do app.
        saved = self.settings.value("vault_path") or QSettings("GDSN", "GDSN").value("vault_path")
        self.vault_path: Path | None = Path(saved) if saved else default_vault_path()

        self.lock_timer = QTimer(self, singleShot=True, interval=AUTO_LOCK_MS, timeout=self.lock)
        self._activity = ActivityFilter(self.lock_timer)
        QApplication.instance().installEventFilter(self._activity)

        self.stack = QStackedWidget()
        self.unlock_screen = UnlockScreen(self)
        self.vault_screen = VaultScreen(self)
        self.stack.addWidget(self.unlock_screen)
        self.stack.addWidget(self.vault_screen)
        self.setCentralWidget(self.stack)
        QShortcut(QKeySequence("Ctrl+L"), self, activated=self.lock)

    def set_vault_path(self, path: Path):
        self.vault_path = path
        self.settings.setValue("vault_path", str(path))

    def on_unlocked(self, vault: Vault):
        self.vault_screen.load(vault)
        self.stack.setCurrentWidget(self.vault_screen)
        self.setWindowTitle(f"NCofres — {vault.path.name}")
        self.lock_timer.start()

    def lock(self):
        if self.vault_screen.vault is not None:
            self.vault_screen.vault.close()
        self.vault_screen.unload()
        self.lock_timer.stop()
        self.setWindowTitle("NCofres")
        self.unlock_screen.refresh()
        self.stack.setCurrentWidget(self.unlock_screen)

    def change_master(self):
        vault = self.vault_screen.vault
        dlg = MasterPasswordDialog(self, "Trocar senha mestra", ask_current=True)
        if dlg.exec() != QDialog.Accepted:
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            if not vault.verify_master_password(dlg.current.text()):
                QMessageBox.warning(self, "NCofres", "Senha atual incorreta.")
                return
            vault.change_master_password(dlg.new.text())
        except OSError as exc:
            QMessageBox.critical(self, "NCofres", f"Falha ao salvar:\n{exc}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.vault_screen.flash("Senha mestra alterada")

    def closeEvent(self, event):
        self.vault_screen.clipboard.clear()
        self.lock()
        super().closeEvent(event)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("NCofres")
    app.setOrganizationName("NCofres")
    app.setDesktopFileName("ncofres")  # liga a janela ao atalho ncofres.desktop (ícone na barra de tarefas)
    app.setWindowIcon(QIcon(str(Path(__file__).resolve().parent.parent / "ncofres.png")))
    app.setStyle("Fusion")  # ignora o tema do sistema para manter preto/branco/verde
    app.setStyleSheet(STYLE)
    win = MainWindow()
    win.show()
    # Primeira abertura: mostra a tela Sobre como boas-vindas, uma única vez.
    if not win.settings.value("welcome_seen", False, type=bool):
        def welcome():
            AboutDialog(win, welcome=True).exec()
            win.settings.setValue("welcome_seen", True)
        QTimer.singleShot(0, welcome)
    sys.exit(app.exec())
