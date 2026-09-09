@echo off
REM Cierra el servidor iniciado con start_server.bat usando el PID guardado
setlocal
set BASE=%~dp0
set PIDFILE=%BASE%server_pid.txt

if not exist "%PIDFILE%" (
    exit
)

for /f %%i in (%PIDFILE%) do (
    taskkill /PID %%i /F >nul 2>&1
)

del "%PIDFILE%"
exit
