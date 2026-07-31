#!/bin/bash
# install-ubuntu.sh
# Script Instalasi Lab Remote Agent (1-Click) untuk Ubuntu via GitHub

# ==========================================
# KONFIGURASI SERVER
# ==========================================
if [ -z "$SERVER_URL" ]; then
    SERVER_URL="https://remote.nusambasingaparna.com"
fi
INSTALL_DIR="/opt/lab-agent"
GITHUB_BASE="https://raw.githubusercontent.com/yusufburhani20/remoteallos/main/agent"

echo -e "\e[36m=========================================\e[0m"
echo -e "\e[36m  Lab Remote Agent - Ubuntu Installer\e[0m"
echo -e "\e[36m=========================================\e[0m"
echo ""

# Memastikan dijalankan sebagai root (sudo)
if [ "$EUID" -ne 0 ]; then
  echo -e "\e[31m[ERROR] Harap jalankan script ini dengan sudo!\e[0m"
  echo "Gunakan: curl -sL $GITHUB_BASE/install-ubuntu.sh | sudo bash"
  exit 1
fi

echo -e "\e[33m[1/6] Menghentikan service lama (jika ada)...\e[0m"
systemctl stop lab-remote-agent 2>/dev/null
systemctl disable lab-remote-agent 2>/dev/null
rm -rf $INSTALL_DIR

echo -e "\e[33m[2/6] Menginstal dependensi sistem (nodejs, npm, xinput, zenity, scrot)...\e[0m"
apt-get update -y > /dev/null 2>&1
apt-get install -y curl xinput zenity scrot > /dev/null 2>&1

# Pastikan Node.js terinstal
if ! command -v node &> /dev/null; then
    echo "  -> Menginstal Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
    apt-get install -y nodejs > /dev/null 2>&1
fi

echo -e "\e[33m[3/6] Menyiapkan direktori & Mengunduh file dari GitHub...\e[0m"
mkdir -p $INSTALL_DIR/modules

# Membuat config.js
cat > $INSTALL_DIR/config.js << EOF
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

for file in "${FILES[@]}"; do
    echo "  -> Mengunduh $file..."
    curl -sL "$GITHUB_BASE/$file" -o "$INSTALL_DIR/$file"
done

echo -e "\e[33m[4/6] Menginstal dependensi NPM...\e[0m"
cd $INSTALL_DIR
npm install --silent

echo -e "\e[33m[5/6] Mengkonfigurasi Systemd Service (Background Daemon)...\e[0m"
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

echo -e "\e[33m[6/6] Menyalakan Lab Remote Agent...\e[0m"
systemctl daemon-reload
systemctl enable lab-remote-agent
systemctl start lab-remote-agent

echo ""
echo -e "\e[32m=========================================\e[0m"
echo -e "\e[32m INSTALASI BERHASIL! \e[0m"
echo -e "\e[32m PC ini sekarang sudah bisa diremote\e[0m"
echo -e "\e[32m dari Dashboard Server.\e[0m"
echo -e "\e[32m=========================================\e[0m"
