@echo off
REM Abre los puertos 8080 (WebSocket) y 8081 (panel movil) SOLO para tu red local.
REM Hay que ejecutarlo como administrador (clic derecho -> Ejecutar como administrador).
net session >nul 2>&1
if errorlevel 1 (
    echo Este archivo necesita permisos de administrador.
    echo Clic derecho -^> Ejecutar como administrador.
    pause
    exit /b 1
)

netsh advfirewall firewall delete rule name="RemoteTab Control" >nul 2>&1
netsh advfirewall firewall add rule name="RemoteTab Control" dir=in action=allow protocol=TCP localport=8080,8081 remoteip=localsubnet profile=any

echo.
echo Listo. Puertos 8080 y 8081 abiertos para la red local.
pause
