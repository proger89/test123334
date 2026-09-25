param([ValidateSet('start','stop','dev','test')][string]$Command='start')
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(!(Test-Path -LiteralPath '.env')) {
  $key=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
  $password=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  "APP_NAME=VSM`nAPP_ENV=local`nAPP_KEY=base64:$key`nAPP_URL=http://127.0.0.1:8180`nDB_PASSWORD=$password`nSESSION_SECURE_COOKIE=false" | Set-Content -Encoding utf8NoBOM .env
}
if(-not (Select-String -Path '.env' -Pattern '^EDITOR_ACCESS_CODE=' -Quiet)) {
  $editorCode=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
  Add-Content -Encoding utf8NoBOM .env "EDITOR_ACCESS_CODE=$editorCode"
}
switch($Command){
 'start' { docker compose up --build -d --wait web worker }
 'stop' { docker compose -f compose.yaml -f compose.dev.yaml stop }
 'dev' { docker compose -f compose.yaml -f compose.dev.yaml up --build -d --wait web worker frontend-dev }
 'test' {
   docker compose build api
   if($LASTEXITCODE -ne 0){throw 'Не удалось собрать приложение для проверки'}
   docker compose -p vsm-hackathon-test -f compose.test.yaml run --rm tests
 }
}
if($LASTEXITCODE -ne 0){throw "Docker command failed ($LASTEXITCODE)"}
