<#
.SYNOPSIS
  Restarts the Hashcoin API so it picks up new code or settings.
.DESCRIPTION
  Run in PowerShell opened with "Run as administrator", from the repo folder:
    powershell -ExecutionPolicy Bypass -File infra\pc\restart-api.ps1
  Stops the "Hashcoin API" task, ends the process listening on the API port (stopping the task
  can leave it running), starts the task again and checks the API answers.
#>
param([string]$TaskName = "Hashcoin API", [int]$Port = 8787)
$ErrorActionPreference = "Stop"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Open PowerShell with 'Run as administrator' and run this again." -ForegroundColor Red; exit 1 }

Stop-ScheduledTask -TaskName $TaskName
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object {
  Write-Host "Ending process $($_.OwningProcess) on port $Port"
  Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName $TaskName
Write-Host "Started; waiting for the API..."
foreach ($i in 1..30) {
  Start-Sleep -Seconds 2
  try {
    $keys = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/v1/keys" -TimeoutSec 3
    Write-Host "The API is up. Signing key: $(($keys.PSObject.Properties.Name) -join ', ')" -ForegroundColor Green
    exit 0
  } catch {}
}
Write-Host "The API didn't answer within a minute. Its log: services\api\data\api.log" -ForegroundColor Red
exit 1
