<#
.SYNOPSIS
  Starts a Claude Code session that listens to Slack (the slack-channel plugin), in its own Windows Terminal window.

.DESCRIPTION
  The session is an ordinary interactive Claude Code session with the Slack channel loaded. While custom channels are a
  research preview, Claude Code asks once per start to confirm the development channel: press Enter in the window.
  The window can be minimised; closing it stops the session (and the bot says so in Slack when announce is set).

  -Register adds a Windows scheduled task that runs this script when you sign in; -Unregister removes it.

.EXAMPLE
  powershell -File start.ps1 -Dir C:\Users\me\source\repos -AddDir D:\Github
  powershell -File start.ps1 -Register -Dir C:\Users\me\source\repos -AddDir D:\Github
#>
param(
  [string]$Dir = (Join-Path $HOME 'source\repos'),
  [string[]]$AddDir = @(),
  [string]$Plugin = 'plugin:slack-channel@carnufex',
  [switch]$Register,
  [switch]$Unregister
)
$ErrorActionPreference = 'Stop'
$taskName = 'Claude Code Slack channel'

if ($Unregister) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
  "Removed the scheduled task '$taskName'."
  return
}

if ($Register) {
  $argList = @('-NoProfile', '-WindowStyle', 'Hidden', '-File', "`"$PSCommandPath`"", '-Dir', "`"$Dir`"", '-Plugin', $Plugin)
  foreach ($d in $AddDir) { $argList += @('-AddDir', "`"$d`"") }
  $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ($argList -join ' ')
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description 'Starts Claude Code with the Slack channel at sign-in (slack-channel plugin).' -Force | Out-Null
  "Registered '$taskName': it starts at sign-in in $Dir."
  return
}

# A program Windows Terminal can start: claude.exe, or the npm shim claude.cmd. Never claude.ps1, which only PowerShell
# can run (wt fails with 0x800700c1).
$claude = Get-Command claude -CommandType Application -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -in '.exe', '.cmd' } | Select-Object -First 1 -ExpandProperty Source
if (-not $claude) { throw 'claude.exe or claude.cmd is not on PATH' }
# Only this session listens to Slack: the plugin's server in every other session stays off Socket Mode.
$cfgDir = Join-Path $HOME '.claude\channels\slack'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$sessionSettings = Join-Path $cfgDir 'listen-settings.json'
Set-Content -Path $sessionSettings -Value '{ "env": { "SLACK_CHANNEL_LISTEN": "1" } }' -Encoding ascii
$claudeArgs = @('--settings', $sessionSettings, '--dangerously-load-development-channels', $Plugin)
foreach ($d in $AddDir) { $claudeArgs += @('--add-dir', $d) }

$wt = (Get-Command wt.exe -ErrorAction SilentlyContinue).Source
if ($wt) {
  & $wt -w claude-slack new-tab --title 'Claude <-> Slack' -d $Dir $claude @claudeArgs
} else {
  Start-Process -FilePath $claude -ArgumentList $claudeArgs -WorkingDirectory $Dir
}
