param(
    [Parameter(Mandatory = $true)]
    [string]$TaskFile,
    [string]$Model = "opencode/deepseek-v4.1-flash-free",
    [string]$Agent = "bitacora",
    [string]$OutputDirectory = "trabajo-opencode/resultados"
)

$ErrorActionPreference = "Stop"
$repository = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$task = (Resolve-Path $TaskFile).Path
$taskName = [IO.Path]::GetFileNameWithoutExtension($task)
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputRoot = Join-Path $repository $OutputDirectory
$sessionRoot = Join-Path $repository ".opencode-runtime-$taskName"
$log = Join-Path $outputRoot "$taskName-$stamp.log"
$metadata = Join-Path $outputRoot "$taskName-$stamp.json"

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
New-Item -ItemType Directory -Force -Path $sessionRoot | Out-Null
$env:XDG_DATA_HOME = Join-Path $sessionRoot "data"
$env:XDG_CACHE_HOME = Join-Path $sessionRoot "cache"
$env:XDG_CONFIG_HOME = Join-Path $sessionRoot "config"

if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    throw "OpenCode no está disponible en PATH."
}

$prompt = Get-Content -LiteralPath $task -Raw
$started = Get-Date
Push-Location $repository
try {
    & opencode run --model $Model --agent $Agent --title $taskName $prompt 2>&1 |
        Tee-Object -FilePath $log
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

[ordered]@{
    task = $taskName
    model = $Model
    agent = $Agent
    startedAt = $started.ToString("o")
    finishedAt = (Get-Date).ToString("o")
    exitCode = $exitCode
    log = $log
    gitHead = (git -C $repository rev-parse HEAD)
    gitStatus = @(git -C $repository status --short)
} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $metadata -Encoding utf8

if ($exitCode -ne 0) { throw "OpenCode terminó con código $exitCode. Revisa $log" }
Write-Host "Resultado: $log"
Write-Host "Metadatos: $metadata"
