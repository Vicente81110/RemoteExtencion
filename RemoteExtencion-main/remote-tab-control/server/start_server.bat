@echo off
REM Inicia el servidor de forma silenciosa (sin ventana de consola visible)
REM y guarda su PID para poder cerrarlo despues con stop_server.bat
setlocal
set BASE=%~dp0
set PIDFILE=%BASE%server_pid.txt

if exist "%PIDFILE%" del "%PIDFILE%"

powershell -WindowStyle Hidden -Command "$p = Start-Process 'pythonw' -ArgumentList '\"%BASE%server.py\"' -WorkingDirectory '%BASE%' -WindowStyle Hidden -PassThru; $p.Id" > "%PIDFILE%"

exit
