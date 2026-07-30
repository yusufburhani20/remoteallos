# 🖥️ Lab Remote Manager (RemoteAllOS)

**Lab Remote Manager** adalah aplikasi web terpusat modern berbasis **Node.js, Express, Socket.IO, dan noVNC** yang dirancang untuk memantau, mengontrol, dan mengelola seluruh komputer di laboratorium atau jaringan lokal (Windows & Linux/Ubuntu) secara *real-time*.

Aplikasi ini mengusung tampilan gaya **NetSupport School Grid Wall** yang mewah, sangat rinci, responsif, dan kaya fitur tanpa membebani resource jaringan.

---

## ✨ Fitur-Fitur Utama

### 1. 🖥️ Grid Wall Live Screen (NetSupport Style)
- Tampilan grid thumbnail layar desktop seluruh PC client yang ter-update secara *live*.
- Efek hover zoom 🔍 **"Klik Remote Control"** untuk langsung mengambil alih kendali PC.

### 2. 📊 Pemantau Resource & Trafik Jaringan Real-Time
- **⚡ Kecepatan Trafik Jaringan:** Download (`⬇ KB/s` / `MB/s`) dan Upload (`⬆ KB/s` / `MB/s`) real-time.
- **⚡ Aplikasi & Browser Aktif:** Menampilkan nama aplikasi utama (misal: `Chrome`, `VS Code`, `PowerShell`, `UltraViewer`) serta daftar seluruh aplikasi yang sedang dibuka siswa/client.
- **🌐 Identitas & Resource:** Alamat IP, Status Disk %, Penggunaan CPU % (Progress Bar Gradien), dan RAM % (Progress Bar Gradien).

### 3. 🖥️ Remote Control Interaktif (noVNC / TightVNC)
- Kontrol penuh mouse dan keyboard client melalui browser tanpa install software tambahan di PC Admin.
- **📋 Copy-Paste Teks Dua Arah (Admin ↔ Client):**
  - Tombol **`📋 Paste Teks`** pada toolbar remote desktop.
  - Dukungan shortcut **`Ctrl + V`** langsung ke layar remote.
  - Teks yang di-copy di client otomatis tersinkronisasi ke clipboard Admin.
- Fitur **`⌨️ C+A+D`** (Send Ctrl+Alt+Del) dan Mode **`⛶ Fullscreen`**.

### 4. 📁 File Manager Multi-Drive (`C:\`, `D:\`, `E:\`, dll.)
- Jelajahi seluruh isi folder dan partisi harddisk client (`C:\`, `D:\`, `E:\`, USB Flashdisk, dll.).
- Tombol pintas **`💾 Drives`** untuk langsung menampilkan seluruh daftar drive.
- Download file dari client ke browser Admin (hingga 50MB).
- Hapus file/folder client secara remote.

### 5. 🐚 Remote Shell Terminal (PowerShell / Bash)
- Eksekusi perintah command line langsung di PC client secara *real-time*.

### 6. 🔒 Kunci Input Client (Smart Remote Lock)
- Mengunci input fisik keyboard dan mouse di lokasi PC Client.
- Menampilkan banner peringatan di monitor fisik client:  
  `🔒 PERHATIAN: HAK AKSES CLIENT DIKUNCI OLEH ADMIN`
- Admin dari Remote Desktop (VNC / Dashboard) tetapmemiliki akses kontrol 100% penuh.

### 7. 📢 Broadcast Message & Fast Power Action
- **📢 Broadcast Message:** Kirim pesan pengumuman ke layar seluruh PC client.
- **⏻ Bulk Power Actions:** Shutdown Semua, Restart, Lock OS, dan Lock Input Semua dalam sekali klik.

---

## 🛠️ Persyaratan Sistem

### **Komputer Server (Admin / Guru):**
- Node.js v18.x atau versi lebih baru.
- OS: Windows, Linux, atau macOS.

### **Komputer Client (Siswa / User):**
- OS: Windows 10/11 (64-bit) atau Linux (Ubuntu/Debian).
- PowerShell 5.1+ (untuk Windows client).

---

## 🚀 Panduan Instalasi & Penggunaan

### 1. Instalasi Server (Komputer Admin)

1. **Clone repository ini:**
   ```bash
   git clone https://github.com/yusufburhani20/remoteallos.git
   cd remoteallos
   ```

2. **Install dependencies Node.js:**
   ```bash
   npm install
   ```

3. **Jalankan Server Dashboard:**
   ```bash
   npm start
   ```
   *Server akan berjalan di port `3000` (contoh: `http://192.168.1.33:3000`)*.

4. **Buka Dashboard di Browser Admin:**
   Buka `http://localhost:3000` atau `http://<IP_SERVER>:3000`  
   *(Login default: **Admin** / **admin123**)*.

---

### 2. Pemasangan Client Agent di PC Target (Windows Client)

1. **Buka PowerShell Administrator** di PC Client.
2. Jalankan perintah instalasi otomatis berikut (ganti IP dengan IP Server Admin Anda):
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force
   & "\\192.168.1.33\agent\install-windows.ps1" -ServerUrl "http://192.168.1.33:3000"
   ```
   *Skrip akan otomatis memasang agent, mengkonfigurasi TightVNC Server, membuka port firewall, dan mendaftarkan Scheduled Task yang berjalan otomatis saat pengguna logon.*

---

## 📁 Struktur Folder Project

```
remoteallos/
├── agent/                  # Modul Agent Client (Node.js & PowerShell)
│   ├── modules/            # Modul internal (metrics, screenshot, power, fileManager)
│   ├── index.js            # Entrypoint utama Agent Client
│   ├── install-windows.ps1 # Skrip installer otomatis Windows Client
│   └── lock_worker.ps1     # Modul pengunci input fisik & banner layar
├── dashboard/              # Antarmuka Dashboard Admin (Web Application)
│   ├── assets/             # Gambar & ikon
│   ├── css/style.css       # Design System Glassmorphism & Grid Wall Layout
│   ├── js/                 # Logic Dashboard (app.js, terminal.js, filemanager.js)
│   ├── index.html          # Halaman Login Admin
│   └── main.html           # Main Grid Wall & Control Panel
├── server/                 # Core Server (Socket.IO, VNC WebSocket Proxy, Authentication)
│   ├── index.js            # Node.js Express & WebSockets Server
│   └── websockify.js       # WebSocket Proxy untuk VNC
└── package.json            # Manifest Dependencies & Scripts
```

---

## 📜 Lisensi & Pengembang

Dikembangkan untuk manajemen laboratorium komputer terpusat yang aman, cepat, dan efisien.  
Repository: [https://github.com/yusufburhani20/remoteallos.git](https://github.com/yusufburhani20/remoteallos.git)
