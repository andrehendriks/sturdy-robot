# Create Task Scheduler job for kubectl port-forward startup

$taskName = "kubectl-portforward-webui"
$scriptPath = "Z:\KuberNetes\portforward-service.ps1"
$logDir = "$env:USERPROFILE\.kube\logs"

# Create log directory
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

# Check if task already exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Write-Host "Task already exists. Removing old version..." -ForegroundColor Yellow
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# Create the action
$action = New-ScheduledTaskAction `
    -Execute "PowerShell.exe" `
    -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$scriptPath`""

# Create the trigger (at system startup)
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create task settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -MultipleInstances IgnoreNew

# Create the task
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Start kubectl port-forward for webui at system startup"

# Register the task (requires admin)
try {
    Register-ScheduledTask -TaskName $taskName -InputObject $task -Force
    Write-Host "Task created successfully: $taskName" -ForegroundColor Green
    Write-Host "The port-forward will start automatically on next boot" -ForegroundColor Green
    Write-Host "Logs: $logDir\portforward-startup.log" -ForegroundColor Cyan
} catch {
    Write-Host "ERROR: Failed to create task. You may need to run this script as Administrator." -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}
