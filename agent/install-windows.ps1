# Lab Remote Manager - PC Agent Installer (Windows)
# Run as Administrator
# Usage: .\install-windows.ps1 -ServerUrl 'http://192.168.1.100:3000'

param(
  [string]$ServerUrl  = 'http://192.168.1.100:3000',
  [string]$InstallDir = 'C:\lab-agent'
)

$ErrorActionPreference = 'Continue'

Write-Host ''
Write-Host '============================================' -ForegroundColor Cyan
Write-Host '   Lab Remote Agent - Windows Installer    ' -ForegroundColor Cyan
Write-Host '============================================' -ForegroundColor Cyan
Write-Host ''

# --- Cek Admin ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host 'ERROR: Jalankan PowerShell sebagai Administrator!' -ForegroundColor Red
  exit 1
}
Write-Host 'OK: Running as Administrator' -ForegroundColor Green

# --- Cek / Install Node.js ---
$nodeOk = $false
try {
  $ver = & node --version 2>&1
  Write-Host ('Node.js sudah ada: ' + $ver) -ForegroundColor Green
  $nodeOk = $true
} catch {
  $nodeOk = $false
}

if (-not $nodeOk) {
  Write-Host 'Node.js tidak ditemukan. Mencari nodejs.msi di share...' -ForegroundColor Yellow

  $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
  $msiPath   = Join-Path $scriptDir 'nodejs.msi'

  if (-not (Test-Path $msiPath)) {
    Write-Host ('ERROR: nodejs.msi tidak ada di: ' + $msiPath) -ForegroundColor Red
    exit 1
  }

  Write-Host 'Menginstall Node.js, tunggu 1-2 menit...' -ForegroundColor Cyan
  $args = '/i "' + $msiPath + '" /quiet /norestart ADDLOCAL=ALL'
  $proc = Start-Process msiexec.exe -Wait -PassThru -ArgumentList $args
  if ($proc.ExitCode -ne 0) {
    Write-Host ('ERROR: Instalasi Node.js gagal (exit code: ' + $proc.ExitCode + ')') -ForegroundColor Red
    exit 1
  }

  # Refresh PATH supaya node bisa langsung dipakai tanpa restart
  $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $userPath    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path    = $machinePath + ';' + $userPath

  $ver = & node --version 2>&1
  Write-Host ('Node.js berhasil diinstall: ' + $ver) -ForegroundColor Green
}

# --- Buat folder install ---
Write-Host ('Membuat folder: ' + $InstallDir) -ForegroundColor White
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

# --- Stop task and kill node processes if already running ---
$svcName = 'LabRemoteAgent'
Stop-ScheduledTask -TaskName $svcName -ErrorAction SilentlyContinue | Out-Null
Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 1

# --- Copy file agent ---
Write-Host 'Menyalin file agent dari share...' -ForegroundColor White
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item -Path (Join-Path $scriptDir '*') -Destination $InstallDir -Recurse -Force
Write-Host 'File tersalin' -ForegroundColor Green

# --- Tulis config.js ---
$configPath    = Join-Path $InstallDir 'config.js'
$q             = "'"
$configContent = 'module.exports = { SERVER_URL: ' + $q + $ServerUrl + $q + ' };'
Set-Content -Path $configPath -Value $configContent -Encoding UTF8
Write-Host ('Config ditulis: SERVER_URL = ' + $ServerUrl) -ForegroundColor Green

# --- npm install ---
Write-Host 'Menginstall npm dependencies...' -ForegroundColor White
Push-Location $InstallDir
try {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  & npm install --omit=dev 2>&1 | Out-Null
  $ErrorActionPreference = $prev
  if ($LASTEXITCODE -ne 0) {
    Write-Host ('npm install gagal, exit code: ' + $LASTEXITCODE) -ForegroundColor Red
    exit 1
  }
  Write-Host 'Dependencies terinstall' -ForegroundColor Green
} finally {
  Pop-Location
}

# --- Install TightVNC Server (untuk Remote Desktop) ---
Write-Host 'Menginstall TightVNC Server...' -ForegroundColor White
$vncMsi = Join-Path $scriptDir 'tightvnc.msi'
if (Test-Path $vncMsi) {
  # Password VNC default: labpassword (bisa diganti)
  $vncPassword    = 'labpassword'
  $vncControlPass = 'labcontrol'
  $vncArgs = '/i "' + $vncMsi + '" /quiet /norestart ADDLOCAL=Server' +
             ' SET_USEVNCAUTHENTICATION=1' +
             ' VALUE_OF_USEVNCAUTHENTICATION=1' +
             ' SET_PASSWORD=1' +
             ' VALUE_OF_PASSWORD=' + $vncPassword +
             ' SET_CONTROLPASSWORD=1' +
             ' VALUE_OF_CONTROLPASSWORD=' + $vncControlPass +
             ' SET_ALLOWLOOPBACK=1' +
             ' VALUE_OF_ALLOWLOOPBACK=1'
  $proc = Start-Process msiexec.exe -Wait -PassThru -ArgumentList $vncArgs
  if ($proc.ExitCode -eq 0) {
    Write-Host 'TightVNC Server terinstall' -ForegroundColor Green
    # Buka port 5900 di firewall
    netsh advfirewall firewall add rule name='TightVNC-5900' dir=in action=allow protocol=TCP localport=5900 | Out-Null
    Write-Host 'Firewall port 5900 dibuka' -ForegroundColor Green
    # Start service
    Start-Service -Name 'tvnserver' -ErrorAction SilentlyContinue
  } else {
    Write-Host ('TightVNC install gagal (exit: ' + $proc.ExitCode + '), skip.') -ForegroundColor Yellow
  }
} else {
  Write-Host 'tightvnc.msi tidak ditemukan di share, skip VNC install.' -ForegroundColor Yellow
  Write-Host 'Remote Desktop tidak akan berfungsi tanpa VNC Server.' -ForegroundColor Yellow
}

# --- Daftarkan Scheduled Task (auto-start saat PC menyala / user logon) ---
Write-Host 'Mendaftarkan sebagai Scheduled Task...' -ForegroundColor White

$svcName     = 'LabRemoteAgent'
$nodeExe     = (Get-Command node -ErrorAction Stop).Source
$agentScript = Join-Path $InstallDir 'index.js'

$action    = New-ScheduledTaskAction -Execute $nodeExe -Argument $agentScript -WorkingDirectory $InstallDir
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Hours 0)
$principal = New-ScheduledTaskPrincipal -GroupId 'BUILTIN\Users' -RunLevel Highest

Register-ScheduledTask -TaskName $svcName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Lab Remote Manager Agent' -Force | Out-Null
Write-Host ('Scheduled Task terdaftar: ' + $svcName) -ForegroundColor Green

# --- Jalankan agent di sesi interaktif pengguna sekarang ---
Write-Host 'Menjalankan agent...' -ForegroundColor White
Start-Process -FilePath $nodeExe -ArgumentList $agentScript -WorkingDirectory $InstallDir -WindowStyle Hidden

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host '          INSTALASI SELESAI!               ' -ForegroundColor Green
Write-Host '============================================' -ForegroundColor Green
Write-Host ('  Server : ' + $ServerUrl) -ForegroundColor White
Write-Host ''
Write-Host 'Perintah berguna:' -ForegroundColor Gray
Write-Host ('  Status : Get-ScheduledTask -TaskName ' + $svcName) -ForegroundColor Gray
Write-Host ('  Stop   : Stop-ScheduledTask -TaskName ' + $svcName) -ForegroundColor Gray
Write-Host ('  Hapus  : Unregister-ScheduledTask -TaskName ' + $svcName + ' -Confirm:$false') -ForegroundColor Gray
Write-Host ''
