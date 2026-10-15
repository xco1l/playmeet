$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$taskNode = Get-Command node -ErrorAction SilentlyContinue
if ($taskNode) {
    & $taskNode.Source node_modules/vite/bin/vite.js --host 127.0.0.1
} else {
    throw 'Node.js is unavailable. Install Node.js 24, then run pnpm install and pnpm dev.'
}
exit $LASTEXITCODE
