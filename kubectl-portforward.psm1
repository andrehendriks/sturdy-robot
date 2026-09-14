# Persistent kubectl port-forward module

function Start-KubectlPortForward {
    param(
        [string]$Namespace = 'airadio',
        [string]$Service = 'webui',
        [int]$LocalPort = 8081,
        [int]$RemotePort = 80
    )
    
    $logDir = "$env:USERPROFILE\.kube\logs"
    if (!(Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    $logFile = "$logDir\portforward-$Service.log"
    $pidFile = "$logDir\portforward-$Service.pid"
    
    # Check if already running
    if (Test-Path $pidFile) {
        $oldPid = Get-Content $pidFile
        $proc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "Port-forward already running (PID: $oldPid)" -ForegroundColor Green
            return
        }
    }
    
    # Start new port-forward
    $job = Start-Job -ScriptBlock {
        param($ns, $svc, $lport, $rport, $log)
        while ($true) {
            try {
                & kubectl port-forward -n $ns svc/$svc ${lport}:${rport} 2>&1 | Tee-Object -FilePath $log -Append
            } catch {
                Add-Content -Path $log -Value "$(Get-Date): Error - $_"
                Start-Sleep -Seconds 5
            }
        }
    } -ArgumentList $Namespace, $Service, $LocalPort, $RemotePort, $logFile
    
    $job.Id | Out-File -FilePath $pidFile
    Write-Host "Port-forward started (PID: $($job.Id))" -ForegroundColor Green
    Write-Host "Logs: $logFile" -ForegroundColor Cyan
}

function Stop-KubectlPortForward {
    param(
        [string]$Service = 'webui'
    )
    
    $pidFile = "$env:USERPROFILE\.kube\logs\portforward-$Service.pid"
    
    if (!(Test-Path $pidFile)) {
        Write-Host "No port-forward found for $Service" -ForegroundColor Yellow
        return
    }
    
    $pid = Get-Content $pidFile
    $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
    if ($proc) {
        Stop-Process -Id $pid -Force
        Write-Host "Stopped port-forward (PID: $pid)" -ForegroundColor Green
    }
    
    Remove-Item -Path $pidFile -Force
}

Export-ModuleMember -Function Start-KubectlPortForward, Stop-KubectlPortForward
