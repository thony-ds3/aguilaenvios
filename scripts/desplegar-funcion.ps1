# [BE] Despliegue de la Edge Function crear-usuario (PowerShell).
# Requisitos:
#   1) Supabase CLI instalado (o npx) y con sesión iniciada:  supabase login
#   2) Un token de acceso o sesión válida. No hace falta `supabase link`:
#      el script pasa --project-ref directamente.
#   3) Secretos (opcionales; la función ya trae orígenes conocidos y usa las claves
#      que inyecta la plataforma):
#        supabase secrets set AE_ALLOWED_ORIGINS="https://aguilaenvios.onrender.com,http://localhost:5173"
#        supabase secrets set AE_SECRET_KEY="sb_secret_..."   # solo si no usa SUPABASE_SECRET_KEYS
#
# Uso:  .\scripts\desplegar-funcion.ps1
#       .\scripts\desplegar-funcion.ps1 -Origenes "https://mi-dominio.com,http://localhost:5173"
#       .\scripts\desplegar-funcion.ps1 -Proyecto "otroref"
param(
  [string]$Origenes = "https://aguilaenvios.onrender.com,http://localhost:5173,http://127.0.0.1:5173",
  [string]$Proyecto = "ifbexbcoujmdfgvryzfm"
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $PSScriptRoot

# Usa la CLI instalada; si no está, cae a `npx supabase`.
$bin = $null
$pre = @()
if (Get-Command supabase -ErrorAction SilentlyContinue) {
  $bin = "supabase"
} elseif (Get-Command npx -ErrorAction SilentlyContinue) {
  $bin = "npx"
  $pre = @("--yes", "supabase")
} else {
  throw "No se encontró la CLI de Supabase ni npx. Instálala desde https://supabase.com/docs/guides/cli"
}

function Invoke-Cli {
  param([string[]]$Argumentos)
  & $bin @pre @Argumentos
  if ($LASTEXITCODE -ne 0) {
    throw "Falló: $bin $($Argumentos -join ' ') (código $LASTEXITCODE)"
  }
}

Push-Location $raiz
try {
  if ($Origenes) {
    Write-Host "Configurando AE_ALLOWED_ORIGINS..." -ForegroundColor Cyan
    Invoke-Cli @("secrets", "set", "AE_ALLOWED_ORIGINS=$Origenes", "--project-ref", $Proyecto)
  }

  Write-Host "Desplegando crear-usuario en $Proyecto..." -ForegroundColor Cyan
  # config.toml ya declara verify_jwt=false; se pasa explícito para que no dependa del archivo.
  Invoke-Cli @("functions", "deploy", "crear-usuario", "--project-ref", $Proyecto, "--no-verify-jwt")

  Write-Host "Listo. Prueba el alta desde /superadmin/usuarios." -ForegroundColor Green
}
finally {
  Pop-Location
}
