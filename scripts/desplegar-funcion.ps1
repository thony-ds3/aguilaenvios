# [BE] Despliegue de la Edge Function crear-usuario (PowerShell).
# Requisitos:
#   1) Supabase CLI instalado y con sesión iniciada:  supabase login
#   2) Proyecto enlazado:                             supabase link --project-ref ifbexbcoujmdfgvryzfm
#   3) Secretos configurados (una sola vez):
#        supabase secrets set AE_ALLOWED_ORIGINS="https://tu-dominio.com,http://localhost:5173"
#        supabase secrets set AE_SECRET_KEY="sb_secret_..."   # opcional si la plataforma ya inyecta la clave
#
# Uso:  .\scripts\desplegar-funcion.ps1
#       .\scripts\desplegar-funcion.ps1 -Origenes "https://aguilaenvios.vercel.app"
param(
  [string]$Origenes = ""
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

Push-Location $raiz
try {
  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    throw "No se encontró la CLI de Supabase. Instálala desde https://supabase.com/docs/guides/cli"
  }

  if ($Origenes) {
    Write-Host "Configurando AE_ALLOWED_ORIGINS..." -ForegroundColor Cyan
    supabase secrets set "AE_ALLOWED_ORIGINS=$Origenes"
  }

  Write-Host "Desplegando crear-usuario..." -ForegroundColor Cyan
  supabase functions deploy crear-usuario

  Write-Host "Listo. Prueba el alta desde /superadmin/usuarios." -ForegroundColor Green
}
finally {
  Pop-Location
}
