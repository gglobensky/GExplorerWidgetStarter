param([string]$ReleaseRoot)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ReleaseRoot) {
    $ReleaseRoot = Join-Path (Split-Path -Parent (Split-Path -Parent $projectRoot)) 'GEM Shell/Gexplorer/GExplorer/bin/Release/net8.0/win-x64'
}
$release = (Resolve-Path -LiteralPath $ReleaseRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $release 'GExplorer.exe'))) { throw 'Expected a GEM Shell release containing GExplorer.exe.' }
$publicRoot = Join-Path $release 'wwwroot'
if (-not (Test-Path -LiteralPath (Join-Path $publicRoot 'runtime-widgets'))) { throw 'Release runtime-widgets folder is missing.' }
$source = Join-Path $projectRoot 'dist/runtime-widgets/treeview/index.js'
if (-not (Test-Path -LiteralPath $source)) { throw 'Build first: pnpm build:treeview' }
$targetDirectory = Join-Path $publicRoot 'runtime-widgets/treeview'
$target = Join-Path $targetDirectory 'index.js'
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
$sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
if (Test-Path -LiteralPath $target) {
    $oldHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    if ($oldHash -ne $sourceHash) {
        $backup = Join-Path $targetDirectory ('index.js.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
        Copy-Item -LiteralPath $target -Destination $backup
    }
}
Copy-Item -LiteralPath $source -Destination $target -Force
if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $sourceHash) { throw 'Copied bundle hash does not match.' }
Write-Output "Tree View copied and SHA-256 verified: $target"
Write-Output 'Restart GEM Shell, then add Tree View using the sidebar widget picker.'
