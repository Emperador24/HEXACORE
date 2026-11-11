# Arranca HEXACORE completo en Windows, con Docker Desktop y nada más.
#
#   .\iniciar.ps1                 todo en este computador
#   .\iniciar.ps1 -DatosDemo      con datos de ejemplo (solo sobre instalación vacía)
#   .\iniciar.ps1 -Parar          baja todo, conservando los datos
#
# Es la versión para PowerShell del modo "todo" de iniciar.sh. El reparto en
# dos computadores, las réplicas y el despliegue desde el registro siguen en
# iniciar.sh (Git Bash o WSL).
#
# Si PowerShell se niega a ejecutarlo por la política de scripts:
#   powershell -ExecutionPolicy Bypass -File .\iniciar.ps1 -DatosDemo

param(
  [switch]$DatosDemo,
  [switch]$Parar
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
$compose = @('compose', '-f', 'docker-compose.yml', '--profile', 'servicios')

function Escribir($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Escribir 'Docker no está instalado o no está en el PATH.' Red; exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Escribir 'Docker está instalado pero no responde. ¿Está abierto Docker Desktop?' Red; exit 1
}

if ($Parar) {
  Escribir 'Parando HEXACORE (los datos se conservan)' White
  docker @compose down
  Escribir 'Listo. Para borrar también los datos: docker compose -f docker-compose.yml --profile servicios down -v' Green
  exit 0
}

Escribir 'HEXACORE — arranque' White
Escribir '  Compilando y levantando datos, servicios, gateway y portales (la primera vez tarda varios minutos)'
# --wait espera a que cada contenedor esté sano, con las mismas sondas que usa iniciar.sh.
docker @compose up -d --build --wait
if ($LASTEXITCODE -ne 0) {
  Escribir "Algún servicio no llegó a estar sano. Mira: docker $($compose -join ' ') logs" Red; exit 1
}
Escribir '  Servicios listos' Green

if ($DatosDemo) {
  Escribir 'Datos de ejemplo (solo sobre instalación vacía)' White
  docker @compose --profile demo run --rm --no-deps --build datos-demo
  if ($LASTEXITCODE -ne 0) { Escribir '  Falló la carga de datos de ejemplo. Mira la salida de arriba.' Red; exit 1 }
  Escribir '  Datos de ejemplo listos' Green
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
  Select-Object -First 1).IPAddress
if (-not $ip) { $ip = 'localhost' }

Escribir ''
Escribir 'HEXACORE en marcha' White
Escribir "  API Gateway:          http://${ip}:8080/api/v1"
Escribir "  Portal de clientes:   http://${ip}:4200"
Escribir "  Portal administrativo: http://${ip}:4201"
Escribir "  Correos simulados:    http://${ip}:3098/correos"
Escribir ''
Escribir '  Parar:  .\iniciar.ps1 -Parar'
