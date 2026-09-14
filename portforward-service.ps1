# Task Scheduler startup script for kubectl port-forward
# This runs at system startup via Task Scheduler

$modulePath = "$env:USERPROFILE\Documents\PowerShell\Modules\kubectl-portforward"
$logFile = "$env:USERPROFILE\.kube\logs\portforward-startup.log"
$logDir = Split-Path -Parent $logFile

# Create log directory if it doesn't exist
if (!(Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

# Log startup
Add-Content -Path $logFile -Value "$(Get-Date): Starting kubectl port-forward at system startup"

try {
    # Import and start port-forward
    if (Test-Path $modulePath) {
        Import-Module kubectl-portforward -Force
        Start-KubectlPortForward -Namespace airadio -Service webui -LocalPort 8081 -RemotePort 80
        Add-Content -Path $logFile -Value "$(Get-Date): Port-forward started successfully"
    } else {
        Add-Content -Path $logFile -Value "$(Get-Date): ERROR - Module not found at $modulePath"
    }
} catch {
    Add-Content -Path $logFile -Value "$(Get-Date): ERROR - $_"
}

# Keep the process alive
while ($true) {
    Start-Sleep -Seconds 60
}
