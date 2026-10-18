<#
.SYNOPSIS
  Runs the Hashcoin payout loop (services/payouts) on this PC and restarts it if it stops.

.DESCRIPTION
  Settings come from an env file outside the repo (default: %USERPROFILE%\.hashcoin\payouts.env),
  one NAME=value per line, # for comments. Its contents: docs/LAUNCH-RUNBOOK.md, step 7.
  Without that file it doesn't start: the loop must never run on default settings.

  Started at boot by the "Hashcoin Payouts" scheduled task (payouts-autostart.ps1), or by hand:
    powershell -ExecutionPolicy Bypass -File infra\pc\run-payouts.ps1
  Output goes to loop.log in HASH_DATA_DIR (from the env file; default services\payouts\data).

  Restarting is safe: the loop looks up on chain what it sent before it stopped (payouts, buys,
  harvests) and never sends one twice. A second live copy (this and a payouts.ps1 window) refuses
  to start and is retried here every 5 minutes, so close the window and this one takes over.
#>
param([string]$EnvFile = (Join-Path $env:USERPROFILE ".hashcoin\payouts.env"))
$ErrorActionPreference = "Continue"
$Repo = Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "..\..")

$found = Test-Path $EnvFile
if ($found) {
  foreach ($line in Get-Content $EnvFile) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith("#") -or -not $t.Contains("=")) { continue }
    $i = $t.IndexOf("=")
    [Environment]::SetEnvironmentVariable($t.Substring(0, $i).Trim(), $t.Substring($i + 1).Trim(), "Process")
  }
}
$Data = if ($env:HASH_DATA_DIR) { $env:HASH_DATA_DIR } else { Join-Path $Repo "services\payouts\data" }
New-Item -ItemType Directory -Force -Path $Data | Out-Null
$Log = Join-Path $Data "loop.log"
# UTF-8 without a BOM, like the loop's own output (Add-Content and >> would mix encodings).
function Note($msg) { [IO.File]::AppendAllText($Log, "$(Get-Date -Format s) $msg`r`n") }
if (-not $found) { Note "no ${EnvFile}: not starting (docs/LAUNCH-RUNBOOK.md, step 7)"; exit 1 }

# The loop prints UTF-8 (arrows, $HASH); read it as such.
try { [Console]::OutputEncoding = New-Object Text.UTF8Encoding $false } catch {}
$npx = (Get-Command npx.cmd -ErrorAction SilentlyContinue).Source
if (-not $npx) { $npx = Join-Path $env:ProgramFiles "nodejs\npx.cmd" }

# From the repo root, so stop-payouts.ps1 can tell this process from the API (both run a src/main.ts).
Set-Location $Repo
$wait = 15
while ($true) {
  if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 20MB) { Move-Item -Force $Log "$Log.1" }
  Note "starting the payout loop"
  $started = Get-Date
  # stderr lines arrive as error records: keep their text only.
  & $npx --yes tsx services/payouts/src/main.ts 2>&1 | ForEach-Object {
    $text = if ($_ -is [Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
    [IO.File]::AppendAllText($Log, "$text`r`n")
  }
  $code = $LASTEXITCODE
  # A quick exit (a settings problem, another copy running) backs off up to 5 minutes instead of spinning.
  if (((Get-Date) - $started).TotalMinutes -gt 10) { $wait = 30 } else { $wait = [Math]::Min($wait * 2, 300) }
  Note "the payout loop stopped (exit $code); restarting in $wait s"
  Start-Sleep -Seconds $wait
}
