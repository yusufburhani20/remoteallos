#!/bin/bash
# install-ubuntu.sh
# Script Instalasi Lab Remote Agent (1-Click) untuk Ubuntu

# ==========================================
# KONFIGURASI SERVER & IDENTITAS
# ==========================================
if [ -z "$SERVER_URL" ]; then
    if [ -n "$1" ]; then
        SERVER_URL="$1"
    else
        SERVER_URL="http://80.80.80.4:3000"
    fi
fi
INSTALL_DIR="/opt/lab-agent"

echo -e "\e[36m=========================================\e[0m"
echo -e "\e[36m  Lab Remote Agent - Ubuntu Installer    \e[0m"
echo -e "\e[36m=========================================\e[0m"
echo ""

# Memastikan dijalankan sebagai root (sudo)
if [ "$EUID" -ne 0 ]; then
  echo -e "\e[31m[ERROR] Harap jalankan script ini dengan sudo!\e[0m"
  echo "Gunakan: curl -sL <URL>/install-ubuntu.sh | sudo bash"
  exit 1
fi

# 1. Atur Hostname (Jika variabel PC_NAME diisi)
if [ -n "$PC_NAME" ]; then
    echo -e "\e[33m[1/8] Mengatur nama PC (hostname) ke: $PC_NAME...\e[0m"
    hostnamectl set-hostname "$PC_NAME"
else
    echo -e "\e[33m[1/8] Menggunakan hostname saat ini: $(hostname)\e[0m"
fi

# 2. Nonaktifkan Wayland (Wajib Xorg agar x11vnc berjalan)
WAYLAND_MODIFIED=false
if [ -f /etc/gdm3/custom.conf ]; then
    echo -e "\e[33m[2/8] Memeriksa konfigurasi sesi tampilan (Xorg vs Wayland)...\e[0m"
    if grep -q "^#\?WaylandEnable=" /etc/gdm3/custom.conf; then
        sed -i 's/^#\?WaylandEnable=.*/WaylandEnable=false/' /etc/gdm3/custom.conf
    else
        sed -i '/^\[daemon\]/a WaylandEnable=false' /etc/gdm3/custom.conf
    fi
    WAYLAND_MODIFIED=true
fi

# 3. Menghentikan service lama
echo -e "\e[33m[3/8] Menghentikan service lama (jika ada)...\e[0m"
systemctl stop lab-remote-agent lab-vnc 2>/dev/null
systemctl disable lab-remote-agent lab-vnc 2>/dev/null
rm -rf "$INSTALL_DIR"

# 4. Instalasi dependensi sistem
echo -e "\e[33m[4/8] Menginstal dependensi sistem (nodejs, xinput, scrot, x11vnc)...\e[0m"
apt-get update -y > /dev/null 2>&1
apt-get install -y curl xinput zenity scrot x11vnc > /dev/null 2>&1

if ! command -v node &> /dev/null; then
    echo "  -> Menginstal Node.js v18..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
fi

# 5. Menyiapkan VNC Server (Skrip Runner Handal & Aman)
echo -e "\e[33m[5/8] Menyiapkan VNC Server (x11vnc)...\e[0m"
x11vnc -storepasswd labpassword /etc/x11vnc.pass > /dev/null 2>&1
chmod 600 /etc/x11vnc.pass

cat << 'EOF_VNC_RUNNER' > /usr/local/bin/run-lab-vnc.sh
#!/bin/bash
if [ ! -f /etc/x11vnc.pass ]; then
    x11vnc -storepasswd labpassword /etc/x11vnc.pass
    chmod 600 /etc/x11vnc.pass
fi

AUTH=$(ps aux | grep -oE '\-auth [^ ]+' | awk '{print $2}' | head -n 1)
[ -z "$AUTH" ] && AUTH=$(find /run/user /var/run/gdm3 /home -name "*authority*" 2>/dev/null | head -n 1)

DISP=$(ls /tmp/.X11-unix 2>/dev/null | tr 'X' ':' | head -n 1)
[ -z "$DISP" ] && DISP=":0"

exec /usr/bin/x11vnc -auth "$AUTH" -display "$DISP" -rfbauth /etc/x11vnc.pass -forever -shared -listen 0.0.0.0 -rfbport 5900 -noshm -quiet
EOF_VNC_RUNNER
chmod +x /usr/local/bin/run-lab-vnc.sh

cat > /etc/systemd/system/lab-vnc.service << 'EOF_VNC_SERVICE'
[Unit]
Description=Lab VNC Server
After=network.target display-manager.service

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/run-lab-vnc.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF_VNC_SERVICE

systemctl daemon-reload
systemctl enable lab-vnc > /dev/null 2>&1
systemctl restart lab-vnc

# 6. Menyiapkan direktori & Mengunduh file Agent
echo -e "\e[33m[6/8] Mengunduh file agent dari server ($SERVER_URL)...\e[0m"
mkdir -p "$INSTALL_DIR/modules"

cat > "$INSTALL_DIR/config.js" << EOF
module.exports = { SERVER_URL: process.env.SERVER_URL || '$SERVER_URL' };
EOF

FILES=(
    "index.js"
    "package.json"
    "modules/fileManager.js"
    "modules/metrics.js"
    "modules/power.js"
    "modules/screenshot.js"
    "modules/shell.js"
)

# Tentukan sumber unduhan: Server Lokal (jika aktif) atau GitHub
USE_LOCAL_SERVER=false
if curl -sSf "$SERVER_URL/agent/index.js" > /dev/null 2>&1; then
    USE_LOCAL_SERVER=true
    BASE_URL="$SERVER_URL/agent"
    echo "  -> Mengunduh langsung dari Server ($BASE_URL)..."
else
    LATEST_HASH=$(curl -s "https://api.github.com/repos/yusufburhani20/remoteallos/commits/main" | grep -m 1 '"sha"' | cut -d '"' -f 4)
    [ -z "$LATEST_HASH" ] && LATEST_HASH="main"
    BASE_URL="https://raw.githubusercontent.com/yusufburhani20/remoteallos/$LATEST_HASH/agent"
    echo "  -> Mengunduh dari GitHub ($BASE_URL)..."
fi

for file in "${FILES[@]}"; do
    echo "  -> Mengunduh $file..."
    curl -sL "$BASE_URL/$file" -o "$INSTALL_DIR/$file"
done

# 7. Menginstal dependensi NPM
echo -e "\e[33m[7/8] Menginstal dependensi NPM...\e[0m"
cd "$INSTALL_DIR"
npm install --silent

# 8. Konfigurasi & Menyalakan Systemd Service Agent
echo -e "\e[33m[8/8] Menyalakan Lab Remote Agent...\e[0m"
cat > /etc/systemd/system/lab-remote-agent.service << EOF
[Unit]
Description=Lab Remote Control Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) index.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable lab-remote-agent
systemctl restart lab-remote-agent

echo ""
echo -e "\e[32m=========================================\e[0m"
echo -e "\e[32m INSTALASI BERHASIL! \e[0m"
echo -e "\e[32m PC ini terhubung ke: $SERVER_URL\e[0m"
if [ "$WAYLAND_MODIFIED" = true ]; then
    echo -e "\e[33m Catatan: Disarankan 'sudo reboot' sekali\e[0m"
    echo -e "\e[33m agar konfigurasi Xorg aktif sempurna.\e[0m"
fi
echo -e "\e[32m=========================================\e[0m"
