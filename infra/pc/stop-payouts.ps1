<#
.SYNOPSIS
  Stops the payout loop started by the "Hashcoin Payouts" task (it starts again at the next boot).

.DESCRIPTION
  powershell -ExecutionPolicy Bypass -File infra\pc\stop-payouts.ps1
  Stops the task and the loop process it started (stopping a task can leave its node process
  running). Stopping mid-round is safe: the next start checks on chain what was sent.
  To block every transaction without stopping anything, use the kill switch instead:
    powershell -ExecutionPolicy Bypass -File services\payouts\scripts\payouts.ps1 ctl kill "why"
  To keep it from starting at boot as well (run as administrator):
    Disable-ScheduledTask -TaskName "Hashcoin Payouts"
#>
param([string]$TaskName = "Hashcoin Payouts")
$ErrorActionPreference = "Continue"
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $TaskName }
# The restarter first (else it starts the loop again), then the loop, which runs as
# `tsx services/payouts/src/main.ts` from the repo root (run-payouts.ps1, payouts.ps1).
Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -match 'run-payouts\.ps1' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
$loops = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'services[\\/]payouts[\\/]src[\\/]main\.ts' -and $_.CommandLine -notmatch '--dry-run' }
foreach ($p in $loops) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
Write-Host "Stopped the task and $(@($loops).Count) loop process(es)."
Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Format-Table -AutoSize TaskName, State
