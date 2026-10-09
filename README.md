# 单商户微信商城

原生微信小程序（TypeScript）+ React 管理后台 + CloudBase 云函数。当前实现采用单一 orders 主表、自有普通商户号 API v3、SUPER_ADMIN 管理。仅快递配送，无库存与自提逻辑；去掉商户审核工单和抽成，保留微信内容安全审核。

```powershell
npm ci
npm run build
node scripts/bundle-functions.js
node scripts/run-tests.js
npm --prefix admin-web ci --ignore-scripts
npm --prefix admin-web run build
```

改 cloudfunctions/common 后必须重新打包；小程序 JS 是编译产物。金额使用整数分，密钥只通过服务端环境变量配置。

请按 [单商户改造书](docs/单商户改造书.md)、[验收记录](docs/accepted.md)、[数据库结构](docs/database-schema.md)、[部署上线指南](docs/DEPLOYMENT.md) 操作。D6 明确覆盖历史方案的库存、自提建议。

本地测试与构建通过；云端部署、真机微信支付退款、账号资质、微信提审仍须实际验收。云环境 ID 已配置为 `cloud1-d3gffg6ok96e6cf3f`；不自动清库、不自动部署。退款首版整单，已发货需确认退货，完成订单不开放自动退款。广告奖励禁用。真实品牌、客服电话和服务条款必须上线前填写。
