# install-windows.ps1
# Script Instalasi Lab Remote Agent (1-Click) untuk Windows

$ErrorActionPreference = 'SilentlyContinue'

# ==========================================
# KONFIGURASI SERVER
# ==========================================
if (-not $ServerUrl) {
    $ServerUrl = "https://remote.nusambasingaparna.com"
}
$InstallDir = "C:\lab-agent"
$GithubBase = "https://raw.githubusercontent.com/yusufburhani20/remoteallos/main/agent"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "  Lab Remote Agent - Windows Installer" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Menghentikan agent jika sudah berjalan
Write-Host "[1/6] Menghentikan agent lama (jika ada)..." -ForegroundColor Yellow
Stop-Process -Name "node" -Force
Start-Sleep -Seconds 2

# 2. Membuat direktori instalasi
Write-Host "[2/6] Menyiapkan direktori instalasi ($InstallDir)..." -ForegroundColor Yellow
if (Test-Path -Path $InstallDir) {
    Remove-Item -Path $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\modules" | Out-Null

# Membuat config.js secara otomatis
$configContent = "module.exports = { SERVER_URL: process.env.SERVER_URL || '$ServerUrl' };"
Set-Content -Path "$InstallDir\config.js" -Value $configContent -Encoding Ascii

# 3. Mengunduh file-file agen dari server
Write-Host "[3/6] Mengunduh file agent dari GitHub ($GithubBase)..." -ForegroundColor Yellow
$files = @(
    "index.js",
    "package.json",
    "lock_worker.ps1",
    "modules/fileManager.js",
    "modules/metrics.js",
    "modules/power.js",
    "modules/screenshot.js",
    "modules/shell.js"
)

foreach ($file in $files) {
    $url = "$GithubBase/$file"
    $dest = "$InstallDir\$file"
    Write-Host "  -> Mengunduh $file..." -ForegroundColor Gray
    Invoke-WebRequest -Uri $url -OutFile $dest
}

# 4. Instalasi VNC Server (Untuk Fitur Remote)
Write-Host "[4/7] Menginstal VNC Server..." -ForegroundColor Yellow
$vncExe = "C:\Program Files\TightVNC\tvnserver.exe"
if (-not (Test-Path $vncExe)) {
    Write-Host "  -> Mengunduh TightVNC..." -ForegroundColor Gray
    Invoke-WebRequest -Uri "$GithubBase/tightvnc.msi" -OutFile "$InstallDir\tightvnc.msi"
    Write-Host "  -> Memasang TightVNC..." -ForegroundColor Gray
    Start-Process "msiexec.exe" -ArgumentList "/i `"$InstallDir\tightvnc.msi`" /quiet /norestart SET_USEVNCAUTHENTICATION=1 VALUE_OF_USEVNCAUTHENTICATION=1 SET_PASSWORD=1 VALUE_OF_PASSWORD=labpassword SET_USECONTROLAUTHENTICATION=1 VALUE_OF_USECONTROLAUTHENTICATION=1 SET_CONTROLPASSWORD=1 VALUE_OF_CONTROLPASSWORD=labpassword" -Wait -NoNewWindow
    if (Test-Path $vncExe) {
        Start-Process -FilePath $vncExe -ArgumentList "-install" -WindowStyle Hidden -Wait
        Start-Process -FilePath $vncExe -ArgumentList "-start" -WindowStyle Hidden
    }
} else {
    Write-Host "  -> VNC Server sudah terpasang, menyalakan layanan..." -ForegroundColor Gray
    Start-Process -FilePath $vncExe -ArgumentList "-start" -WindowStyle Hidden
}

# 5. Instalasi modul (npm install)
Write-Host "[5/7] Menginstal dependensi (membutuhkan koneksi internet)..." -ForegroundColor Yellow
Set-Location -Path $InstallDir
npm install

# 6. Konfigurasi Autostart (Background)
Write-Host "[6/7] Mengkonfigurasi agent berjalan otomatis di latar belakang..." -ForegroundColor Yellow
$nodeExe = (Get-Command node).Source
$vbsContent = 'Set objShell = WScript.CreateObject("WScript.Shell")' + "`r`n"
$vbsContent += 'objShell.Run """' + $nodeExe + '"" ""C:\lab-agent\index.js""", 0, False'
Set-Content -Path "$InstallDir\run-hidden.vbs" -Value $vbsContent -Encoding Ascii

$regPath = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run'
Set-ItemProperty -Path $regPath -Name 'LabRemoteAgent' -Value "wscript.exe `"$InstallDir\run-hidden.vbs`""

# 7. Menyalakan Agent
Write-Host "[7/7] Menyalakan Lab Remote Agent..." -ForegroundColor Yellow
Start-Process "wscript.exe" -ArgumentList "`"$InstallDir\run-hidden.vbs`"" -WorkingDirectory $InstallDir

Write-Host ""
Write-Host "=========================================" -ForegroundColor Green
Write-Host " INSTALASI BERHASIL! " -ForegroundColor Green
Write-Host " PC ini sekarang sudah bisa diremote" -ForegroundColor Green
Write-Host " dari Dashboard Server." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Start-Sleep -Seconds 3
