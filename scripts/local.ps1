param([ValidateSet('start','stop','dev','test')][string]$Command='start')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(!(Test-Path -LiteralPath '.env')) {
  $key=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  "APP_NAME=VSM`nAPP_ENV=local`nAPP_KEY=base64:$key`nAPP_URL=http://127.0.0.1:8180`nDB_PASSWORD=$password`nSESSION_SECURE_COOKIE=false" | Set-Content -Encoding utf8NoBOM .env
}
switch($Command){
 'start' { docker compose up --build -d --wait web worker }
 'stop' { docker compose stop }
 'dev' { docker compose up --build -d --wait web worker }
 'test' { docker compose exec api php artisan test }
}
if($LASTEXITCODE -ne 0){throw "Docker command failed ($LASTEXITCODE)"}
