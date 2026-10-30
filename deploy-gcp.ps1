<#
.SYNOPSIS
  Automated Google Cloud Run deployment script for Epako Voice (Backend + Frontend).

.DESCRIPTION
  This script deploys the FastAPI speech gateway and the React Router SSR web app
  to Google Cloud Run, connects them securely, and outputs your live HTTPS URLs.
#>

param (
    [Parameter(Mandatory=$false)]
    [string]$ProjectId,

    [Parameter(Mandatory=$false)]
    [string]$Region = "us-central1"
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "   Epako Voice - Google Cloud Run Deployment Setup        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Check gcloud CLI
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Error "Google Cloud SDK (gcloud) is not installed. Please install it from: https://cloud.google.com/sdk/docs/install"
    exit 1
}

# 2. Confirm Project ID
if (-not $ProjectId) {
    $currentProject = (gcloud config get-value project 2>$null)
    if ($currentProject -and $currentProject -ne "(unset)") {
        $ProjectId = $currentProject
    } else {
        $ProjectId = Read-Host "Enter your Google Cloud Project ID"
    }
}

Write-Host "[+] Using Google Cloud Project: $ProjectId" -ForegroundColor Green
Write-Host "[+] Deployment Region: $Region" -ForegroundColor Green
gcloud config set project $ProjectId --quiet

# 3. Read environment variables from .env if available
$supabaseUrl = ""
$supabaseAnon = ""
$supabaseService = ""

if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match "^SUPABASE_URL=(.*)") { $supabaseUrl = $matches[1].Trim() }
        if ($_ -match "^SUPABASE_ANON_KEY=(.*)") { $supabaseAnon = $matches[1].Trim() }
        if ($_ -match "^SUPABASE_SERVICE_ROLE_KEY=(.*)") { $supabaseService = $matches[1].Trim() }
    }
}

if (-not $supabaseUrl) {
    $supabaseUrl = Read-Host "Enter your SUPABASE_URL (e.g. https://xxx.supabase.co)"
}
if (-not $supabaseAnon) {
    $supabaseAnon = Read-Host "Enter your SUPABASE_ANON_KEY"
}

# 4. Check / Deploy Backend Speech Gateway
$backendUrl = ""
$existingBackend = (gcloud run services describe epako-backend --region $Region --format "value(status.url)" 2>$null)

if ($existingBackend -and ($existingBackend.Trim() -ne "")) {
    $backendUrl = $existingBackend.Trim()
    Write-Host "`n[OK] Backend already online at: $backendUrl" -ForegroundColor Green
    $rebuild = Read-Host "Do you want to re-deploy the backend? (y/N)"
    if ($rebuild -eq "y" -or $rebuild -eq "Y") {
        $backendUrl = ""
    }
}

if (-not $backendUrl) {
    Write-Host "`n[+] Step 1/2: Deploying Backend Speech API to Cloud Run..." -ForegroundColor Yellow
    gcloud run deploy epako-backend `
        --source . `
        --platform managed `
        --region $Region `
        --allow-unauthenticated `
        --memory 8Gi `
        --cpu 4 `
        --min-instances 1 `
        --no-cpu-throttling `
        --cpu-boost `
        --timeout 300 `
        --set-env-vars "SUPABASE_URL=$supabaseUrl,SUPABASE_KEY=$supabaseAnon,SUPABASE_SERVICE_ROLE_KEY=$supabaseService"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Backend deployment failed."
        exit 1
    }
    
    $backendUrl = (gcloud run services describe epako-backend --region $Region --format "value(status.url)").Trim()
}

Write-Host "[OK] Using Backend URL: $backendUrl" -ForegroundColor Green

# 5. Deploy Frontend Web App
Write-Host "`n[+] Step 2/2: Deploying Frontend SSR Server to Cloud Run..." -ForegroundColor Yellow

Push-Location web
try {
    gcloud run deploy epako-web `
        --source . `
        --platform managed `
        --region $Region `
        --allow-unauthenticated `
        --memory 1Gi `
        --cpu 1 `
        --set-env-vars "API_URL=$backendUrl,VITE_API_URL=$backendUrl,VITE_SUPABASE_URL=$supabaseUrl,VITE_SUPABASE_ANON_KEY=$supabaseAnon,VITE_TURNSTILE_SITE_KEY=0x4AAAAAAFkURGHLWXu2hUx_"
    
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Frontend deployment to Cloud Run failed."
        exit 1
    }

    $rawUrl = (gcloud run services describe epako-web --region $Region --format "value(status.url)" 2>$null)
    if ($rawUrl) {
        $frontendUrl = $rawUrl.Trim()
        Write-Host "[OK] Frontend deployed successfully at: $frontendUrl" -ForegroundColor Green
    } else {
        Write-Error "Could not retrieve URL for service epako-web."
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [OK] Deployment Complete! Your website is live on Google: " -ForegroundColor Green
Write-Host "     Website URL: $frontendUrl" -ForegroundColor Yellow
Write-Host "     Backend URL: $backendUrl" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "`nNext Step: In your Supabase Dashboard -> Authentication -> URL Configuration:"
Write-Host "  1. Set Site URL to: $frontendUrl"
Write-Host "  2. Add Redirect URL: $($frontendUrl)/**"
