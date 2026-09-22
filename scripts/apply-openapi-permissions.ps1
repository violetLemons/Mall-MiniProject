param(
  [string]$EnvId = 'cloud1-d3gffg6ok96e6cf3f',
  [string]$ProjectPath
)

# 落地「多商家发货/退款」所需的云函数配置。实测结论：
#   - timeout           -> tcb fn deploy（读 cloudbaserc.json 的 functions[].timeout）
#   - 定时触发器        -> tcb fn trigger create
#   - openapi 云调用权限 -> 任何 CLI 都无法写入（inc-deploy/deploy 都只传代码、不应用 config.json），只能 GUI 手动勾选
$ErrorActionPreference = 'Stop'

if (-not $ProjectPath) {
  $ProjectPath = (Resolve-Path (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..')).Path
}

Push-Location -LiteralPath $ProjectPath
try {
  Write-Host '[1/3] bundle 同步 common 共享模块'
  node scripts/bundle-functions.js
  if ($LASTEXITCODE -ne 0) { throw 'bundle-functions.js 失败' }

  Write-Host '[2/3] 部署 timeout（读 cloudbaserc.json）'
  foreach ($name in @('adminOrders', 'orderTimeoutJob')) {
    tcb fn deploy $name --dir "cloudfunctions/$name" --force --install-dependency true -e $EnvId
    if ($LASTEXITCODE -ne 0) { throw "deploy 失败: $name" }
  }

  Write-Host '[3/3] 创建定时触发器 orderTimeoutJob（每 15 分钟对账/取消超时单）'
  tcb fn trigger create orderTimeoutJob --trigger-name cancelExpiredOrdersAndSyncShippingCron --cron "0 */15 * * * * *" -e $EnvId
  if ($LASTEXITCODE -ne 0) { Write-Host '（触发器可能已存在，忽略）' }

  Write-Host ''
  Write-Host '=== 剩余唯一手动步骤：openapi 云调用权限 ==='
  Write-Host '在微信开发者工具中，对 adminOrders 和 orderTimeoutJob 各自右键 -> 上传并部署（云端安装依赖）。'
  Write-Host '只有开发者工具会读取 config.json 的 permissions.openapi 并写入云函数权限（tcb CLI 不会）。'
  Write-Host 'config.json 已声明以下接口（无需手选，上传即生效）：'
  Write-Host '  [ ] wxa.sec.order.uploadShippingInfo'
  Write-Host '  [ ] wxa.sec.order.getOrder'
  Write-Host '  [ ] wxa.sec.order.getOrderList'
}
finally {
  Pop-Location
}
