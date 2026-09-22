param(
  [Parameter(Mandatory = $true)][string]$EnvId,
  [string]$ProjectPath,
  [string]$CliPath,
  [switch]$IncludeTestPayment
)

$ErrorActionPreference = 'Stop'
if (-not $ProjectPath) { $ProjectPath = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path }

# 自动定位微信开发者工具命令行 (cli.bat)，覆盖常见安装位置
if ([string]::IsNullOrWhiteSpace($CliPath)) {
  $searchRoots = @(
    'D:\Program Files (x86)\Tencent',
    'C:\Program Files (x86)\Tencent',
    'D:\Program Files\Tencent',
    'C:\Program Files\Tencent',
    (Join-Path $env:LOCALAPPDATA '微信开发者工具'),
    (Join-Path $env:LOCALAPPDATA '微信web开发者工具'),
    (Join-Path $env:LOCALAPPDATA 'Programs\微信开发者工具'),
    (Join-Path $env:LOCALAPPDATA 'Programs\微信web开发者工具')
  )
  foreach ($root in $searchRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    $candidate = Get-ChildItem -LiteralPath $root -Filter 'cli.bat' -Recurse -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) { $CliPath = $candidate.FullName; break }
  }
}

# 找不到 CLI 时给出清晰提示，而不是抛出「空字符串」之类的晦涩报错
if ([string]::IsNullOrWhiteSpace($CliPath)) {
  Write-Host '[Deploy] 未找到微信开发者工具命令行 cli.bat。'
  Write-Host '  方案1: 用 -CliPath 参数指定 cli.bat 完整路径后重试。'
  Write-Host '  方案2: 改用微信开发者工具界面，逐个右键云函数目录，选择「上传并部署：云端安装依赖」。'
  throw '未找到微信开发者工具 CLI (cli.bat)'
}

if (-not (Test-Path -LiteralPath $CliPath)) { throw "微信开发者工具 CLI 不存在: $CliPath" }
if (-not (Test-Path -LiteralPath $ProjectPath)) { throw "项目目录不存在: $ProjectPath" }

Push-Location -LiteralPath $ProjectPath
try {
  node scripts/bundle-functions.js
  if ($LASTEXITCODE -ne 0) { throw 'bundle-functions.js 执行失败' }

  # Test payment is deliberately opt-in. Production deployments must never
  # expose a simulated payment/refund entry point.
  $functions = @('addresses', 'adminAuth', 'adminBanners', 'adminCategories', 'adminGateway', 'adminInventory', 'adminOrders', 'adminProducts', 'adminUsers', 'activation', 'auth', 'cart', 'orders', 'orderTimeoutJob', 'payment', 'paymentCallback', 'pickupPoints', 'products')
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
