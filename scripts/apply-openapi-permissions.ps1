param(
  [Parameter(Mandatory=$true)][string]$EnvId,
  [switch]$Apply
)
$ErrorActionPreference='Stop'
if ($EnvId -notmatch '^[a-zA-Z0-9_-]+$') { throw '环境 ID 无效' }
Write-Host "目标环境：$EnvId"
Write-Host '云调用权限需在部署后读回核对 config.json；不得以部署成功推断权限生效。'
Write-Host 'adminProducts/auth: security.msgSecCheck, security.mediaCheckAsync'
Write-Host 'adminBanners/adminCategories: security.msgSecCheck；图片交由contentReviewJob队列'
Write-Host 'orders: security.msgSecCheck, wxa.sec.order.getOrder'
Write-Host 'adminOrders/orderTimeoutJob: wxa.sec.order.uploadShippingInfo, wxa.sec.order.getOrder'
Write-Host 'contentReviewJob: security.mediaCheckAsync；每分钟处理3个图片任务'
Write-Host '定时器：orderTimeoutJob，每15分钟，0 */15 * * * * *'
if ($Apply) {
  & tcb fn trigger create contentReviewJob --trigger-name contentReviewQueue --cron '0 */1 * * * * *' -e $EnvId
  if ($LASTEXITCODE -ne 0) { throw '内容审核定时器创建未确认，请读回配置' }
  & tcb fn trigger create orderTimeoutJob --trigger-name cancelExpiredOrdersAndSyncShippingCron --cron '0 */15 * * * * *' -e $EnvId
  if ($LASTEXITCODE -ne 0) { throw '定时器创建未确认；请读回已有配置，不能忽略错误' }
} else { Write-Host '仅打印配置；未部署、未创建定时器。显式 -Apply 才创建。' }
