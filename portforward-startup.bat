@echo off
REM kubectl port-forward startup script
REM This runs automatically at Windows startup from the Startup folder

setlocal enabledelayedexpansion

set LOG_DIR=%USERPROFILE%\.kube\logs
if not exist "!LOG_DIR!" mkdir "!LOG_DIR!"

set LOG_FILE=!LOG_DIR!\portforward-startup.log

echo [%DATE% %TIME%] Starting kubectl port-forward >> "!LOG_FILE!"

REM Wait for Docker and Kubernetes to be ready
timeout /t 15 /nobreak > nul 2>&1

REM Run PowerShell to start the port-forward
powershell -NoProfile -ExecutionPolicy Bypass -Command "Import-Module '%USERPROFILE%\Documents\PowerShell\Modules\kubectl-portforward' -Force; Start-KubectlPortForward -Namespace airadio -Service webui -LocalPort 8081 -RemotePort 80" >> "!LOG_FILE!" 2>&1

echo [%DATE% %TIME%] Port-forward initialization complete >> "!LOG_FILE!"

REM Exit silently
exit /b 0
