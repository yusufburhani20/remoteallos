@echo off
title Instalasi Lab Remote Agent (Windows)
color 0B

:: Cek apakah dijalankan sebagai Administrator
net session >nul 2>&1
if %errorLevel% == 0 (
    goto :INSTALL
) else (
    echo Meminta Hak Akses Administrator...
    powershell -Command "Start-Process cmd -ArgumentList '/c %~dpnx0' -Verb RunAs"
    exit
)

:INSTALL
echo ===================================================
echo     Menginstal Lab Remote Agent dari GitHub...
echo ===================================================
echo.
echo Sedang mengunduh dan mengatur sistem, mohon tunggu...
echo.

powershell -ExecutionPolicy Bypass -Command "$hash = (Invoke-RestMethod -Uri 'https://api.github.com/repos/yusufburhani20/remoteallos/commits/main').sha; Invoke-RestMethod -Uri \"https://raw.githubusercontent.com/yusufburhani20/remoteallos/$hash/agent/install-windows.ps1\" | Invoke-Expression"

echo.
echo Selesai! Anda bisa menutup jendela ini sekarang.
pause
