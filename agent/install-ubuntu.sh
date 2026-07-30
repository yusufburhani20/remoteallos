#!/bin/bash
# Lab Remote Manager — PC Agent Installer (Ubuntu/Linux)
# Run as root: sudo bash install-ubuntu.sh --server-url "http://192.168.1.100:3000"

set -e

# ─── Parse arguments ──────────────────────────────────────────
SERVER_URL="http://192.168.1.100:3000"
INSTALL_DIR="/opt/lab-agent"
SERVICE_NAME="lab-remote-agent"

while [[ "$#" -gt 0 ]]; do
  case $1 in
    --server-url) SERVER_URL="$2"; shift ;;
    --install-dir) INSTALL_DIR="$2"; shift ;;
    *) echo "Unknown param: $1"; exit 1 ;;
  esac
  shift
done

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   Lab Remote Agent — Ubuntu Installer    ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─── Check root ───────────────────────────────────────────────
if [ "$(id -u)" != "0" ]; then
  echo "❌ Jalankan sebagai root: sudo bash $0"
  exit 1
fi

# ─── Check Node.js ────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "📦 Node.js tidak ditemukan. Menginstall via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
NODE_VER=$(node --version)
echo "✅ Node.js: $NODE_VER"

# ─── Install screenshot dependencies ──────────────────────────
echo "📦 Menginstall dependensi screenshot..."
apt-get install -y scrot libxi6 libxtst6 libx11-dev libxkbfile-dev 2>/dev/null || true

# ─── Copy files ───────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "📁 Menyalin file ke: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR"/. "$INSTALL_DIR/"

# ─── Write config ─────────────────────────────────────────────
cat > "$INSTALL_DIR/config.js" <<EOF
module.exports = {
  SERVER_URL: '$SERVER_URL',
};
EOF
echo "✅ Config: SERVER_URL = $SERVER_URL"

# ─── Install npm dependencies ─────────────────────────────────
echo "📦 Menginstall npm dependencies..."
cd "$INSTALL_DIR"
npm install --omit=dev 2>/dev/null
echo "✅ Dependencies terinstall"

# ─── Create systemd service ───────────────────────────────────
echo "⚙️  Membuat systemd service..."

cat > /etc/systemd/system/${SERVICE_NAME}.service <<EOF
[Unit]
Description=Lab Remote Manager Agent
After=network.target graphical-session.target
Wants=network.target

[Service]
Type=simple
ExecStart=$(which node) ${INSTALL_DIR}/index.js
WorkingDirectory=${INSTALL_DIR}
Restart=always
RestartSec=5
Environment=DISPLAY=:0
Environment=XAUTHORITY=/home/$(logname 2>/dev/null || echo user)/.Xauthority
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

# ─── Enable & start service ───────────────────────────────────
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl start  "$SERVICE_NAME"

sleep 2
STATUS=$(systemctl is-active "$SERVICE_NAME")

echo ""
if [ "$STATUS" = "active" ]; then
  echo "✅ Agent berjalan! (status: $STATUS)"
else
  echo "⚠️  Agent mungkin belum berjalan. Cek log:"
  echo "   journalctl -u $SERVICE_NAME -f"
fi

echo ""
echo "✅ Instalasi selesai!"
echo "   Server: $SERVER_URL"
echo ""
echo "Perintah berguna:"
echo "  Status  : systemctl status $SERVICE_NAME"
echo "  Log     : journalctl -u $SERVICE_NAME -f"
echo "  Stop    : systemctl stop $SERVICE_NAME"
echo "  Uninstall: systemctl disable $SERVICE_NAME && rm /etc/systemd/system/${SERVICE_NAME}.service"
echo ""
