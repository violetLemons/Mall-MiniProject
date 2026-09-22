param(
  [Parameter(Mandatory = $true)][string]$EnvId,
  [string]$ProjectPath,
  [string]$CliPath,
  [switch]$IncludeTestPayment
)

$ErrorActionPreference = 'Stop'
if (-not $ProjectPath) { $ProjectPath = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path }
if (-not $CliPath) {
  $candidate = Get-ChildItem -LiteralPath 'D:\Program Files (x86)\Tencent' -Filter 'cli.bat' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($candidate) { $CliPath = $candidate.FullName }
}
if (-not (Test-Path -LiteralPath $ProjectPath)) { throw "项目目录不存在: $ProjectPath" }
if (-not (Test-Path -LiteralPath $CliPath)) { throw "未找到微信开发者工具 CLI: $CliPath" }

Push-Location -LiteralPath $ProjectPath
try {
  node scripts/bundle-functions.js
  # Test payment is deliberately opt-in. Production deployments must never
  # expose a simulated payment/refund entry point.
  $functions = @('addresses', 'adminAuth', 'adminBanners', 'adminCategories', 'adminGateway', 'adminInventory', 'adminOrders', 'adminProducts', 'adminUsers', 'auth', 'cart', 'orders', 'orderTimeoutJob', 'payment', 'paymentCallback', 'pickupPoints', 'products')
  if ($IncludeTestPayment) { $functions += 'testPayment' }
  foreach ($name in $functions) {
    Write-Host "[CloudBase] incremental deploy: $name"
    & $CliPath cloud functions inc-deploy --env $EnvId --project $ProjectPath --name $name --file .
    if ($LASTEXITCODE -ne 0) { throw "云函数部署失败: $name" }
  }
  Write-Host '[CloudBase] all functions deployed; run cloud functions info to verify Active.'
}
finally {
  Pop-Location
}
