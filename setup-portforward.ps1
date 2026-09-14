# Setup script for persistent kubectl port-forward

# 1. Create PowerShell Modules directory if it doesn't exist
$modulePath = "$env:USERPROFILE\Documents\PowerShell\Modules\kubectl-portforward"
New-Item -ItemType Directory -Path $modulePath -Force | Out-Null

# 2. Copy the module files
Copy-Item -Path ".\kubectl-portforward.psm1" -Destination $modulePath -Force
Copy-Item -Path ".\kubectl-portforward.psd1" -Destination $modulePath -Force

Write-Host "Module installed to: $modulePath" -ForegroundColor Green

# 3. Get the PowerShell profile path
$profilePath = $PROFILE
$profileDir = Split-Path -Parent $profilePath

# Create profile directory if it doesn't exist
if (!(Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

# 4. Add startup code to PowerShell profile
$startupCode = @"

# kubectl port-forward startup
`$modulePath = "`$env:USERPROFILE\Documents\PowerShell\Modules\kubectl-portforward"
if (Test-Path `$modulePath) {
    Import-Module kubectl-portforward -Force
    Start-KubectlPortForward -Namespace airadio -Service webui -LocalPort 8081 -RemotePort 80 2>&1 | Out-Null
}
"@

# Check if already in profile
if (!(Select-String -Path $profilePath -Pattern "kubectl-portforward" -ErrorAction SilentlyContinue)) {
    Add-Content -Path $profilePath -Value $startupCode
    Write-Host "Added port-forward startup to PowerShell profile: $profilePath" -ForegroundColor Green
} else {
    Write-Host "Port-forward startup already in profile" -ForegroundColor Yellow
}

# 5. Create a log directory
$logDir = "$env:USERPROFILE\.kube\logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

Write-Host "`nSetup complete!" -ForegroundColor Green
Write-Host "Logs will be stored in: $logDir" -ForegroundColor Cyan
Write-Host "Restart PowerShell and webui will be accessible at http://localhost:8081" -ForegroundColor Cyan
