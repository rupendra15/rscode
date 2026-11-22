$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is not installed. Install Docker Desktop, restart Windows, then run this script again."
}

Write-Host "Starting Vistaar-Biz PostgreSQL + Java backend + Next.js frontend..." -ForegroundColor Cyan
docker compose up --build
