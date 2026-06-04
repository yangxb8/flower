# Deploy Website Keyword Monitor to hosted Supabase
# Prerequisites: npx, supabase login (or SUPABASE_ACCESS_TOKEN env var)

param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectRef = $env:SUPABASE_PROJECT_REF,

    [switch]$SkipFunctions,
    [switch]$SkipDb,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

$Supabase = "npx --yes supabase@latest"

function Invoke-Supabase {
    param([string[]]$Args)
    $cmd = "$Supabase $($Args -join ' ')"
    Write-Host "> $cmd" -ForegroundColor Cyan
    if ($DryRun) { return }
    Invoke-Expression $cmd
    if ($LASTEXITCODE -ne 0) { throw "Command failed: $cmd" }
}

# Auth check
if (-not $env:SUPABASE_ACCESS_TOKEN) {
    Write-Host "Checking Supabase CLI login..." -ForegroundColor Yellow
    $list = Invoke-Expression "$Supabase projects list 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host @"

Not logged in. Run ONE of:

  1. Interactive login (opens browser):
     npx supabase login

  2. Personal access token (CI / non-interactive):
     `$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
     # Create at https://supabase.com/dashboard/account/tokens

"@ -ForegroundColor Red
        exit 1
    }
}

if (-not $ProjectRef) {
    Write-Host @"

Set your project ref (Dashboard URL: .../project/<project_ref>):

  `$env:SUPABASE_PROJECT_REF = 'your-project-ref'
  .\scripts\deploy-supabase.ps1

Or pass -ProjectRef explicitly.

"@ -ForegroundColor Red
    exit 1
}

Write-Host "Linking project $ProjectRef ..." -ForegroundColor Green
Invoke-Supabase @("link", "--project-ref", $ProjectRef)

if (-not $SkipDb) {
    Write-Host "Pushing database migrations ..." -ForegroundColor Green
    Invoke-Supabase @("db", "push")
}

if (-not $SkipFunctions) {
    $envFile = Join-Path $RepoRoot "supabase\.env"
    if (Test-Path $envFile) {
        Write-Host "Setting secrets from supabase\.env ..." -ForegroundColor Green
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([A-Z_][A-Z0-9_]*)=(.*)$' -and $_ -notmatch '^\s*#') {
                $name = $matches[1]
                $value = $matches[2].Trim().Trim('"').Trim("'")
                if ($name -in @(
                    'ALERT_EMAIL', 'RESEND_API_KEY', 'RESEND_FROM',
                    'MONITOR_CRON_SECRET', 'FETCH_TIMEOUT_MS'
                )) {
                    Invoke-Supabase @("secrets", "set", "${name}=${value}")
                }
            }
        }
    } else {
        Write-Host "No supabase\.env — set secrets manually:" -ForegroundColor Yellow
        Write-Host "  npx supabase secrets set ALERT_EMAIL=... RESEND_API_KEY=... RESEND_FROM=... MONITOR_CRON_SECRET=..."
    }

    Write-Host "Deploying monitor-check Edge Function ..." -ForegroundColor Green
    Invoke-Supabase @("functions", "deploy", "monitor-check", "--no-verify-jwt")
}

Write-Host @"

Done. Next steps:
  1. Table Editor → monitored_pages (seed URLs should exist)
  2. Dashboard → Edge Functions → monitor-check → Schedules (hourly + x-monitor-secret header)
  3. Test: curl POST .../functions/v1/monitor-check with x-monitor-secret

"@ -ForegroundColor Green
