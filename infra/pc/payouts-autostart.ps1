<#
.SYNOPSIS
  Starts the Hashcoin payout loop when Windows starts, before anyone signs in (so payouts come back
  by themselves after a Windows Update restart or a power cut).

.DESCRIPTION
  Run in PowerShell opened with "Run as administrator", from the repo folder.
  T-24h (docs/LAUNCH-RUNBOOK.md): set it up, switched off, so a restart before launch can't start it:
    powershell -ExecutionPolicy Bypass -File infra\pc\payouts-autostart.ps1
  T-0, after the dry run: switch it on and start it now:
    powershell -ExecutionPolicy Bypass -File infra\pc\payouts-autostart.ps1 -Start

  Creates the scheduled task "Hashcoin Payouts", which runs infra\pc\run-payouts.ps1 as your Windows
  account (no password stored; it can use the internet and your files). run-payouts.ps1 reads
  %USERPROFILE%\.hashcoin\payouts.env, restarts the loop if it stops and logs to loop.log in the
  loop's data folder. The task itself is restarted every minute if it fails.
  Stop it:   powershell -ExecutionPolicy Bypass -File infra\pc\stop-payouts.ps1
  Remove it: Unregister-ScheduledTask -TaskName "Hashcoin Payouts" -Confirm:$false
#>
param([switch]$Start, [string]$TaskName = "Hashcoin Payouts")
$ErrorActionPreference = "Stop"
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Host "Open PowerShell with 'Run as administrator' and run this again." -ForegroundColor Red; exit 1 }
$envFile = Join-Path $env:USERPROFILE ".hashcoin\payouts.env"
if (-not (Test-Path $envFile)) { Write-Host "Missing $envFile (docs/LAUNCH-RUNBOOK.md, step 7). Make it first." -ForegroundColor Red; exit 1 }

$script = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "run-payouts.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger = New-ScheduledTaskTrigger -AtStartup
# After the network (and the API's task, 30 s) are up.
$trigger.Delay = "PT1M"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
# No time limit, keep running on battery, restart if the task itself fails, never two at once.
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -StartWhenAvailable
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null

if (-not $Start) {
  # Re-running the setup keeps it on if it was already on (after launch).
  if (-not $existing -or $existing.State -eq "Disabled") { Disable-ScheduledTask -TaskName $TaskName | Out-Null }
  Get-ScheduledTask -TaskName $TaskName | Format-Table -AutoSize TaskName, State
  Write-Host "Set up. At T-0, after the dry run: powershell -ExecutionPolicy Bypass -File infra\pc\payouts-autostart.ps1 -Start"
  exit 0
}

# A loop running in a window keeps this one waiting (only one may run); close that window first.
Enable-ScheduledTask -TaskName $TaskName | Out-Null
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 20
Get-ScheduledTask -TaskName $TaskName | Format-Table -AutoSize TaskName, State
$data = (Get-Content $envFile | Where-Object { $_ -match '^\s*HASH_DATA_DIR\s*=' }) -replace '^\s*HASH_DATA_DIR\s*=\s*', ''
$log = if ($data) { Join-Path $data.Trim() "loop.log" } else { "services\payouts\data\loop.log" }
Write-Host "Started. It survives restarts now. Log: $log (Get-Content -Wait `"$log`" to watch)."
