param(
  [ValidateSet("dev", "prod")]
  [string]$Mode = "dev"
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$title = "PROJECT_JANUS_APP"
$npmCmd = if ($Mode -eq "prod") { "npm run start" } else { "npm run dev" }
$argumentList = "/k title $title && $npmCmd"

$proc = Start-Process -FilePath "cmd.exe" -ArgumentList $argumentList -WorkingDirectory $repoRoot -PassThru
Write-Output $proc.Id
