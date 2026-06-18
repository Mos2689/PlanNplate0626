# Supabase Automation Script for Windows
param (
    [string]$ProjectRef = "",
    [switch]$DeployFunctions,
    [switch]$PushDb,
    [switch]$GenTypes
)

$ErrorActionPreference = "Stop"

Write-Host "--- Supabase Automation ---" -ForegroundColor Cyan

# 1. Check if linked
if (-not (Test-Path ".supabase/project-id") -and ($ProjectRef -eq "")) {
    Write-Host "Error: Project not linked. Please provide -ProjectRef 'your-ref' or run 'npx supabase link' first." -ForegroundColor Red
    exit 1
}

if ($ProjectRef -ne "") {
    Write-Host "Linking project $ProjectRef..." -ForegroundColor Yellow
    npx supabase link --project-ref $ProjectRef
}

# 2. Push Database Migrations
if ($PushDb) {
    Write-Host "Pushing database migrations..." -ForegroundColor Yellow
    npx supabase db push
}

# 3. Deploy Edge Functions
if ($DeployFunctions) {
    Write-Host "Deploying Edge Functions..." -ForegroundColor Yellow
    # Detect functions in the functions directory
    $functions = Get-ChildItem -Directory -Path "supabase/functions" | Where-Object { $_.Name -notmatch "^_" }
    foreach ($func in $functions) {
        Write-Host "Deploying function: $($func.Name)..."
        npx supabase functions deploy $func.Name
    }
}

# 4. Generate Types
if ($GenTypes) {
    Write-Host "Generating TypeScript types..." -ForegroundColor Yellow
    # Determine project ref from .supabase/project-id if not provided
    $currentRef = $ProjectRef
    if ($currentRef -eq "" -and (Test-Path ".supabase/project-id")) {
        $currentRef = Get-Content ".supabase/project-id" -Raw
    }
    
    if ($currentRef -ne "") {
        npx supabase gen types typescript --project-id $currentRef > src/lib/supabase-generated.ts
        Write-Host "Types generated at src/lib/supabase-generated.ts" -ForegroundColor Green
    } else {
        Write-Host "Skipping type gen: No project ref found." -ForegroundColor Gray
    }
}

Write-Host "Done!" -ForegroundColor Green
