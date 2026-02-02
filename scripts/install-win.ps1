# Requires PowerShell 5+.
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
$ErrorActionPreference = "Stop"

function Test-Command($name) {
  return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# Basic prereq: git
if (-not (Test-Command "git")) {
  Write-Host "Git is required. Install Git first and re-run this script." -ForegroundColor Red
  exit 1
}

# Assume repo already cloned and script is run from repo root
if (-not (Test-Path "package.json")) {
  Write-Host "Run this script from the repo root (package.json not found)." -ForegroundColor Red
  exit 1
}

# Install Node.js LTS if missing
if (-not (Test-Command "node")) {
  if (Test-Command "winget") {
    Write-Host "Installing Node.js LTS via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
  } elseif (Test-Command "choco") {
    Write-Host "Installing Node.js LTS via Chocolatey..."
    choco install nodejs-lts -y
  } else {
    Write-Host "No package manager found. Downloading Node.js LTS installer..."
    $base = "https://nodejs.org/dist/latest-v20.x/"
    $index = Invoke-WebRequest -UseBasicParsing $base
    $msi = ($index.Links | Where-Object { $_.href -match "x64\.msi$" } | Select-Object -First 1).href
    if ([string]::IsNullOrWhiteSpace($msi)) {
      Write-Host "Could not locate Node.js installer. Install Node.js LTS from https://nodejs.org and re-run." -ForegroundColor Red
      exit 1
    }
    $url = $base + $msi
    $tmp = Join-Path $env:TEMP $msi
    Invoke-WebRequest -Uri $url -OutFile $tmp
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$tmp`" /qn /norestart"
  }
}

# Install app dependencies
npm install

Write-Host ""
Write-Host "Setup complete."
Write-Host "To launch the app:" 
Write-Host "  npm run dev"

Write-Host ""
$packageNow = Read-Host "Do you want to package the app now? (y/N)"
if ($packageNow -match '^(y|Y|yes|YES)$') {
  npm run package:win
}
