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
# netstat, not Get-NetTCPConnection: that WMI class is missing on some PCs (it fails with "Invalid
# class"), which left the old API running and the new one failing with EADDRINUSE.
function PortOwners { netstat -ano | Select-String "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+(\d+)" | ForEach-Object { [int]$_.Matches[0].Groups[1].Value } | Sort-Object -Unique }
foreach ($id in PortOwners) {
  Write-Host "Ending process $id on port $Port (and what it started)"
  taskkill /PID $id /T /F | Out-Null
}
Start-Sleep -Seconds 2
if (PortOwners) { Write-Host "Something still holds port $Port; end it in Task Manager (node.exe) and run this again." -ForegroundColor Red; exit 1 }
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
