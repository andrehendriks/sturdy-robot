# PowerShell startup script for kubectl port-forward
# Save as: $PROFILE\portforward-startup.ps1

# Import the port-forward module
$modulePath = "$env:USERPROFILE\Documents\PowerShell\Modules\kubectl-portforward"
if (Test-Path $modulePath) {
    Import-Module kubectl-portforward -Force
    Start-KubectlPortForward -Namespace airadio -Service webui -LocalPort 8081 -RemotePort 80
    Write-Host "Webui port-forward initialized at http://localhost:8081" -ForegroundColor Green
}
