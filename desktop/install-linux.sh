#!/bin/sh
# Instala o NCofres no menu de aplicativos (KDE, GNOME etc.) do usuário atual.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ICONS="$HOME/.local/share/icons/hicolor"

python3 - "$DIR/ncofres.png" "$ICONS" <<'PY'
import os, sys
from PySide6.QtCore import Qt
from PySide6.QtGui import QGuiApplication, QImage
os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
app = QGuiApplication([])
src, icons = QImage(sys.argv[1]), sys.argv[2]
for s in (32, 48, 64, 128, 256):
    d = f"{icons}/{s}x{s}/apps"
    os.makedirs(d, exist_ok=True)
    src.scaled(s, s, Qt.KeepAspectRatio, Qt.SmoothTransformation).save(f"{d}/ncofres.png")
PY

mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/ncofres.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=NCofres
GenericName=Cofre de senhas
Comment=Cofre de senhas local e criptografado
Exec=python3 -m ncofres
Path=$DIR
Icon=$ICONS/256x256/apps/ncofres.png
Terminal=false
Categories=Utility;Security;
Keywords=senha;password;cofre;
StartupNotify=true
DESKTOP

update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
command -v kbuildsycoca6 >/dev/null && kbuildsycoca6 >/dev/null 2>&1 || true
echo "NCofres instalado no menu de aplicativos."
