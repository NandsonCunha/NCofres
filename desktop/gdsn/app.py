"""Interface do GDSN (PySide6)."""

from __future__ import annotations

import sys
from pathlib import Path

from PySide6.QtCore import QEvent, QMimeData, QObject, QSettings, QStandardPaths, Qt, QTimer
from PySide6.QtGui import QAction, QGuiApplication, QIcon, QKeySequence
from PySide6.QtWidgets import (
    QApplication, QDialog, QDialogButtonBox, QFileDialog, QFormLayout, QFrame, QHBoxLayout,
    QLabel, QLineEdit, QMainWindow, QMessageBox, QPushButton, QScrollArea, QStackedWidget,
    QToolButton, QVBoxLayout, QWidget,
)

from .vault import Entry, Vault, VaultError, WrongPasswordError, generate_password, parse_line

AUTO_LOCK_MS = 5 * 60 * 1000      # trava após 5 min sem uso
CLIPBOARD_CLEAR_MS = 20 * 1000    # limpa a área de transferência após 20 s
REVEAL_HIDE_MS = 20 * 1000        # senha revelada volta a ser ocultada após 20 s
MIN_MASTER_LEN = 10
MASK = "•" * 10


def icon_button(theme_icon: str, fallback: str, tooltip: str) -> QToolButton:
    btn = QToolButton()
    icon = QIcon.fromTheme(theme_icon)
    if icon.isNull():
        btn.setText(fallback)
    else:
        btn.setIcon(icon)
    btn.setToolTip(tooltip)
    btn.setAutoRaise(True)
    btn.setCursor(Qt.PointingHandCursor)
    return btn


class SecureClipboard:
    """Copia marcando o conteúdo como secreto e limpa depois de um tempo."""

    def __init__(self, on_message):
        self._on_message = on_message
        self._last = None
        self._timer = QTimer(singleShot=True, interval=CLIPBOARD_CLEAR_MS, timeout=self.clear)

    def copy(self, text: str, what: str) -> None:
        mime = QMimeData()
        mime.setText(text)
        # KDE Klipper e outros gerenciadores respeitam esta dica e não guardam no histórico.
        mime.setData("x-kde-passwordManagerHint", b"secret")
        QGuiApplication.clipboard().setMimeData(mime)
        self._last = text
        self._timer.start()
        self._on_message(f"{what} copiado — a área de transferência será limpa em "
                         f"{CLIPBOARD_CLEAR_MS // 1000} s")

    def clear(self) -> None:
        cb = QGuiApplication.clipboard()
        # Só limpa se ainda for o que nós copiamos.
        if self._last is not None and cb.text() == self._last:
            cb.clear()
        self._last = None


# --------------------------------------------------------------------- diálogos

class MasterPasswordDialog(QDialog):
    """Definir senha mestra (novo cofre ou troca de senha)."""

    def __init__(self, parent, title: str, ask_current: bool = False):
        super().__init__(parent)
        self.setWindowTitle(title)
        form = QFormLayout(self)
        self.current = QLineEdit(echoMode=QLineEdit.Password)
        self.new = QLineEdit(echoMode=QLineEdit.Password)
        self.confirm = QLineEdit(echoMode=QLineEdit.Password)
        if ask_current:
            form.addRow("Senha atual:", self.current)
        form.addRow("Nova senha mestra:", self.new)
        form.addRow("Confirmar:", self.confirm)
        hint = QLabel(f"Mínimo {MIN_MASTER_LEN} caracteres. Uma frase longa "
                      "(ex.: 4–5 palavras aleatórias) é mais forte e fácil de lembrar.\n"
                      "Se você esquecer esta senha, NÃO há como recuperar o cofre.")
        hint.setWordWrap(True)
        form.addRow(hint)
        buttons = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._validate)
        buttons.rejected.connect(self.reject)
        form.addRow(buttons)

    def _validate(self):
        if len(self.new.text()) < MIN_MASTER_LEN:
            QMessageBox.warning(self, "GDSN", f"A senha precisa ter pelo menos {MIN_MASTER_LEN} caracteres.")
        elif self.new.text() != self.confirm.text():
            QMessageBox.warning(self, "GDSN", "As senhas não conferem.")
        else:
            self.accept()


class EditEntryDialog(QDialog):
    def __init__(self, parent, entry: Entry):
        super().__init__(parent)
        self.setWindowTitle(f"Editar — {entry.service}")
        form = QFormLayout(self)
        self.service = QLineEdit(entry.service)
        self.username = QLineEdit(entry.username)
        self.password = QLineEdit(entry.password, echoMode=QLineEdit.Password)
        pw_row = QHBoxLayout()
        pw_row.addWidget(self.password)
        eye = icon_button("view-visible", "👁", "Mostrar/ocultar")
        eye.clicked.connect(lambda: self.password.setEchoMode(
            QLineEdit.Normal if self.password.echoMode() == QLineEdit.Password else QLineEdit.Password))
        gen = icon_button("roll", "🎲", "Gerar senha forte")
        gen.clicked.connect(lambda: self.password.setText(generate_password()))
        pw_row.addWidget(eye)
        pw_row.addWidget(gen)
        form.addRow("Serviço:", self.service)
        form.addRow("Usuário:", self.username)
        form.addRow("Senha:", pw_row)
        buttons = QDialogButtonBox(QDialogButtonBox.Save | QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._validate)
        buttons.rejected.connect(self.reject)
        form.addRow(buttons)

    def _validate(self):
        if not self.service.text().strip() or not self.password.text():
            QMessageBox.warning(self, "GDSN", "Serviço e senha não podem ficar vazios.")
        else:
            self.accept()


# --------------------------------------------------------------------- telas

class UnlockScreen(QWidget):
    def __init__(self, window: "MainWindow"):
        super().__init__()
        self.window = window
        outer = QVBoxLayout(self)
        outer.addStretch()
        box = QFrame()
        box.setMaximumWidth(420)
        lay = QVBoxLayout(box)

        title = QLabel("🔐 GDSN")
        title.setStyleSheet("font-size: 28px; font-weight: bold;")
        title.setAlignment(Qt.AlignCenter)
        lay.addWidget(title)

        self.path_label = QLabel()
        self.path_label.setAlignment(Qt.AlignCenter)
        self.path_label.setWordWrap(True)
        self.path_label.setStyleSheet("color: gray;")
        lay.addWidget(self.path_label)

        self.password = QLineEdit(echoMode=QLineEdit.Password, placeholderText="Senha mestra")
        self.password.returnPressed.connect(self.unlock)
        lay.addWidget(self.password)

        self.error = QLabel(styleSheet="color: #d9534f;")
        self.error.setAlignment(Qt.AlignCenter)
        lay.addWidget(self.error)

        self.unlock_btn = QPushButton("Desbloquear")
        self.unlock_btn.setDefault(True)
        self.unlock_btn.clicked.connect(self.unlock)
        lay.addWidget(self.unlock_btn)

        row = QHBoxLayout()
        open_btn = QPushButton("Abrir outro cofre…")
        open_btn.clicked.connect(self.choose_file)
        new_btn = QPushButton("Criar novo cofre…")
        new_btn.clicked.connect(self.create_vault)
        row.addWidget(open_btn)
        row.addWidget(new_btn)
        lay.addLayout(row)

        h = QHBoxLayout()
        h.addStretch()
        h.addWidget(box)
        h.addStretch()
        outer.addLayout(h)
        outer.addStretch()
        self.refresh()

    def refresh(self):
        path = self.window.vault_path
        exists = path is not None and path.exists()
        self.path_label.setText(str(path) if exists else "Nenhum cofre encontrado — crie um novo.")
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
                                              "Cofre GDSN (*.gdsn);;Todos (*)")
        if path:
            self.window.set_vault_path(Path(path))
            self.refresh()

    def create_vault(self):
        start = str(self.window.vault_path or default_vault_path())
        path, _ = QFileDialog.getSaveFileName(self, "Novo cofre", start, "Cofre GDSN (*.gdsn)")
        if not path:
            return
        path = Path(path)
        if path.suffix != ".gdsn":
            path = path.with_suffix(".gdsn")
        dlg = MasterPasswordDialog(self, "Criar cofre")
        if dlg.exec() != QDialog.Accepted:
            return
        QApplication.setOverrideCursor(Qt.WaitCursor)
        try:
            vault = Vault.create(path, dlg.new.text())
        except OSError as exc:
            QMessageBox.critical(self, "GDSN", f"Não foi possível criar o cofre:\n{exc}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.window.set_vault_path(path)
        self.window.on_unlocked(vault)


class EntryRow(QFrame):
    """Uma credencial: serviço, usuário e senha oculta com o 'olho'."""

    def __init__(self, screen: "VaultScreen", entry: Entry):
        super().__init__()
        self.screen = screen
        self.entry = entry
        self.setFrameShape(QFrame.StyledPanel)

        lay = QHBoxLayout(self)
        info = QVBoxLayout()
        service = QLabel(entry.service)
        service.setStyleSheet("font-weight: bold; font-size: 14px;")
        info.addWidget(service)

        user_row = QHBoxLayout()
        user = QLabel(entry.username or "—")
        user.setTextInteractionFlags(Qt.TextSelectableByMouse)
        user_row.addWidget(user)
        if entry.username:
            copy_user = icon_button("edit-copy", "⧉", "Copiar usuário")
            copy_user.clicked.connect(lambda: screen.clipboard.copy(entry.username, "Usuário"))
            user_row.addWidget(copy_user)
        user_row.addStretch()
        info.addLayout(user_row)

        pw_row = QHBoxLayout()
        self.pw_label = QLabel(MASK)
        self.pw_label.setStyleSheet("font-family: monospace;")
        pw_row.addWidget(self.pw_label)

        # Oculto: só o olho. Revelado: copiar + ocultar.
        self.reveal_btn = icon_button("view-visible", "👁", "Revelar senha")
        self.reveal_btn.clicked.connect(self.reveal)
        self.copy_btn = icon_button("edit-copy", "⧉", "Copiar senha")
        self.copy_btn.clicked.connect(lambda: screen.clipboard.copy(entry.password, "Senha"))
        self.hide_btn = icon_button("view-hidden", "🙈", "Ocultar senha")
        self.hide_btn.clicked.connect(self.conceal)
        for b in (self.reveal_btn, self.copy_btn, self.hide_btn):
            pw_row.addWidget(b)
        pw_row.addStretch()
        info.addLayout(pw_row)
        lay.addLayout(info, 1)

        edit_btn = icon_button("document-edit", "✎", "Editar")
        edit_btn.clicked.connect(lambda: screen.edit_entry(entry))
        del_btn = icon_button("edit-delete", "🗑", "Excluir")
        del_btn.clicked.connect(lambda: screen.delete_entry(entry))
        lay.addWidget(edit_btn, 0, Qt.AlignTop)
        lay.addWidget(del_btn, 0, Qt.AlignTop)

        self._auto_hide = QTimer(self, singleShot=True, interval=REVEAL_HIDE_MS, timeout=self.conceal)
        self.conceal()

    def reveal(self):
        self.pw_label.setText(self.entry.password)
        self.pw_label.setTextInteractionFlags(Qt.TextSelectableByMouse)
        self.reveal_btn.hide()
        self.copy_btn.show()
        self.hide_btn.show()
        self._auto_hide.start()

    def conceal(self):
        self.pw_label.setText(MASK)
        self.pw_label.setTextInteractionFlags(Qt.NoTextInteraction)
        self.reveal_btn.show()
        self.copy_btn.hide()
        self.hide_btn.hide()
        self._auto_hide.stop()


class VaultScreen(QWidget):
    def __init__(self, window: "MainWindow"):
        super().__init__()
        self.window = window
        self.vault: Vault | None = None
        self.clipboard = SecureClipboard(window.show_message)

        lay = QVBoxLayout(self)

        # Área de entrada rápida: "google: email@gmail.com: senha123"
        entry_row = QHBoxLayout()
        self.quick = QLineEdit(placeholderText="serviço: usuário: senha   (ex.: google: email@gmail.com: senha123)")
        self.quick.setEchoMode(QLineEdit.PasswordEchoOnEdit)
        self.quick.returnPressed.connect(self.confirm_quick)
        gen = icon_button("roll", "🎲", "Inserir senha forte gerada")
        gen.clicked.connect(self.insert_generated)
        confirm = QPushButton("Confirmar")
        confirm.clicked.connect(self.confirm_quick)
        entry_row.addWidget(self.quick, 1)
        entry_row.addWidget(gen)
        entry_row.addWidget(confirm)
        lay.addLayout(entry_row)

        self.search = QLineEdit(placeholderText="🔎 Buscar por serviço ou usuário…")
        self.search.setClearButtonEnabled(True)
        self.search.textChanged.connect(self.rebuild)
        lay.addWidget(self.search)

        self.list_host = QWidget()
        self.list_layout = QVBoxLayout(self.list_host)
        self.list_layout.setAlignment(Qt.AlignTop)
        scroll = QScrollArea(widgetResizable=True)
        scroll.setWidget(self.list_host)
        lay.addWidget(scroll, 1)

    def load(self, vault: Vault):
        self.vault = vault
        self.search.clear()
        self.quick.clear()
        self.rebuild()
        self.quick.setFocus()

    def unload(self):
        self.vault = None
        self.quick.clear()
        self.search.clear()
        self.clipboard.clear()
        self.rebuild()

    def rebuild(self):
        while (item := self.list_layout.takeAt(0)) is not None:
            if item.widget():
                item.widget().deleteLater()
        if self.vault is None:
            return
        term = self.search.text().strip().lower()
        entries = sorted(self.vault.entries, key=lambda e: (e.service.lower(), e.username.lower()))
        shown = [e for e in entries if not term or term in e.service.lower() or term in e.username.lower()]
        for e in shown:
            self.list_layout.addWidget(EntryRow(self, e))
        if not shown:
            empty = QLabel("Nenhuma credencial ainda." if not term else "Nada encontrado.")
            empty.setAlignment(Qt.AlignCenter)
            empty.setStyleSheet("color: gray; padding: 24px;")
            self.list_layout.addWidget(empty)
        self.window.show_message(f"{len(self.vault.entries)} credenciais")

    def insert_generated(self):
        text = self.quick.text()
        if text.count(":") >= 2:
            # Já tem senha: substitui pela gerada.
            service, user, _ = text.split(":", 2)
            text = f"{service}:{user}: "
        elif text.count(":") == 1:
            text = text.rstrip() + ": "
        self.quick.setText(text + generate_password())
        self.quick.setFocus()

    def confirm_quick(self):
        try:
            entry = parse_line(self.quick.text())
        except ValueError as exc:
            self.window.show_message(str(exc))
            return
        dup = [e for e in self.vault.entries
               if e.service.lower() == entry.service.lower() and e.username == entry.username]
        if dup and QMessageBox.question(
                self, "GDSN", f"Já existe {entry.service} / {entry.username}. Adicionar mesmo assim?"
        ) != QMessageBox.Yes:
            return
        if not self._try_save(lambda: self.vault.add(entry)):
            self.vault.entries.remove(entry)
            return
        self.quick.clear()
        self.rebuild()
        self.window.show_message(f"“{entry.service}” salvo e criptografado")

    def edit_entry(self, entry: Entry):
        dlg = EditEntryDialog(self, entry)
        if dlg.exec() != QDialog.Accepted:
            return
        self._try_save(lambda: self.vault.update(
            entry.id, service=dlg.service.text().strip(),
            username=dlg.username.text().strip(), password=dlg.password.text()))
        self.rebuild()

    def delete_entry(self, entry: Entry):
        if QMessageBox.question(self, "GDSN", f"Excluir “{entry.service}” ({entry.username})?") != QMessageBox.Yes:
            return
        self._try_save(lambda: self.vault.delete(entry.id))
        self.rebuild()

    def import_txt(self):
        path, _ = QFileDialog.getOpenFileName(self, "Importar texto", str(Path.home()),
                                              "Texto (*.txt);;Todos (*)")
        if not path:
            return
        added, bad = [], []
        for n, line in enumerate(Path(path).read_text("utf-8").splitlines(), 1):
            if not line.strip() or line.lstrip().startswith("#"):
                continue
            try:
                added.append(parse_line(line))
            except ValueError:
                bad.append(n)
        self.vault.entries.extend(added)
        if not self._try_save(self.vault.save):
            for e in added:
                self.vault.entries.remove(e)
            return
        self.rebuild()
        msg = f"{len(added)} credenciais importadas."
        if bad:
            msg += f"\nLinhas ignoradas (formato inválido): {', '.join(map(str, bad))}"
        msg += ("\n\nO arquivo .txt original continua em texto puro no disco. "
                "Deseja excluí-lo agora?")
        if QMessageBox.question(self, "Importação", msg) == QMessageBox.Yes:
            Path(path).unlink()

    def _try_save(self, action) -> bool:
        try:
            action()
            return True
        except OSError as exc:
            QMessageBox.critical(self, "GDSN", f"Falha ao salvar o cofre:\n{exc}")
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
    return Path(base) / "cofre.gdsn"


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("GDSN")
        self.resize(640, 560)
        self.settings = QSettings("GDSN", "GDSN")  # guarda só o caminho do cofre, nada secreto
        saved = self.settings.value("vault_path")
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

        menu = self.menuBar().addMenu("&Cofre")
        self.act_lock = QAction("Travar agora", self, shortcut=QKeySequence("Ctrl+L"), triggered=self.lock)
        self.act_import = QAction("Importar .txt…", self, triggered=lambda: self.vault_screen.import_txt())
        self.act_change = QAction("Trocar senha mestra…", self, triggered=self.change_master)
        act_quit = QAction("Sair", self, shortcut=QKeySequence.Quit, triggered=self.close)
        for a in (self.act_lock, self.act_import, self.act_change):
            menu.addAction(a)
        menu.addSeparator()
        menu.addAction(act_quit)
        self._set_unlocked_actions(False)

    def set_vault_path(self, path: Path):
        self.vault_path = path
        self.settings.setValue("vault_path", str(path))

    def show_message(self, text: str):
        self.statusBar().showMessage(text, 6000)

    def _set_unlocked_actions(self, enabled: bool):
        for a in (self.act_lock, self.act_import, self.act_change):
            a.setEnabled(enabled)

    def on_unlocked(self, vault: Vault):
        self.vault_screen.load(vault)
        self.stack.setCurrentWidget(self.vault_screen)
        self._set_unlocked_actions(True)
        self.setWindowTitle(f"GDSN — {vault.path.name}")
        self.lock_timer.start()

    def lock(self):
        if self.vault_screen.vault is not None:
            self.vault_screen.vault.close()
        self.vault_screen.unload()
        self.lock_timer.stop()
        self._set_unlocked_actions(False)
        self.setWindowTitle("GDSN")
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
                QMessageBox.warning(self, "GDSN", "Senha atual incorreta.")
                return
            vault.change_master_password(dlg.new.text())
        except OSError as exc:
            QMessageBox.critical(self, "GDSN", f"Falha ao salvar:\n{exc}")
            return
        finally:
            QApplication.restoreOverrideCursor()
        self.show_message("Senha mestra alterada")

    def closeEvent(self, event):
        self.vault_screen.clipboard.clear()
        self.lock()
        super().closeEvent(event)


def main():
    app = QApplication(sys.argv)
    app.setApplicationName("GDSN")
    app.setOrganizationName("GDSN")
    win = MainWindow()
    win.show()
    sys.exit(app.exec())
