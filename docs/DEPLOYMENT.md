# 单商户部署与上线指南

更新：2026-10-09。与实际代码配套；旧 CloudPay、多商户、库存、自提部署说明已退役。决策以用户 D1–D6 为准。代码本地验收不等于生产上线验收。

## 1. 上线前必须填写

确认实际售卖品类、小程序主体、认证与类目资质、隐私协议数据项、售后时限、退货地址、真实客服电话和客服人员。当前仅快递、无库存控制、免运费、整单退款；已发货需管理员确认收到退货，完成订单不开放自动退款。不得把样例商品或客服页示例承诺当成实际经营承诺：按真实业务修改品牌、服务时间、FAQ 和商品描述。

确认普通商户号已绑定本小程序，已开通 JSAPI，具备订单发货信息管理及相关接口权限。支付采用 API v3 直连。先在独立空测试环境走通，再上线；生产不允许模拟支付。历史只有可丢弃测试数据，不执行自动清库。

## 2. 本地准备和回归

在仓库根目录执行：

```powershell
npm ci
npm run build
node scripts/bundle-functions.js
node scripts/run-tests.js
npm --prefix admin-web ci --ignore-scripts
npm --prefix admin-web run build
node scripts/init-db.js --json work/cloud-seed/database-manifest.json
node scripts/export-cloud-seed.js
node scripts/seed-admin.js
```

最后一条须先通过当前进程环境设置 INITIAL_ADMIN_PASSWORD（12–128 位），不在命令历史中填写真实密码。只生成哈希文件，不上传云端。种子商品默认下架；导入后必须重新保存、完成内容审核再上架。work/cloud-seed 输出不得当作生产交易数据。

common 源码只能改 cloudfunctions/common；改后必须重新打包。小程序改 TS/WXML/WXSS/JSON，再运行构建产生 JS；云函数 JS 和后台 TSX 本身是源码。

## 3. 数据库先行

新建目标 CloudBase 环境，记录环境 ID。以 cloudfunctions/common/schema.js 和导出的 manifest 为唯一集合及索引清单，共 25 个集合。在控制台逐项创建并读取核对；部署 cloudfunctions/database.rules.json 中的私有规则，禁止客户端直接读写，业务访问必须走服务端鉴权。

node scripts/init-db.js 只导出清单，--apply 会拒绝伪执行。node scripts/apply-indexes.js 默认打印命令；真实应用要求 TCB_ENV_ID 与 --apply。Windows 的 CLI 包装器兼容性尚未云端验证，失败时按 manifest 在控制台创建，不能忽略错误。建立索引后保存实际索引截图/导出，尤其是订单超时、微信同步、退款轮询和内容审核队列索引。

导入需要的分类、真实商品、SKU 和 admins.json（单条 JSON）；其余交易集合保持空。superadmin 首次登录后更改密码。不要导入旧商户、旧子单、库存或自提集合。生产不部署 initDb；该函数仅隔离环境且需要 ALLOW_DATABASE_INIT=true。

## 4. 云函数和环境变量

在控制台秘密配置中设置，切勿写进 Git、前端或日志：

| 变量 | 要求 |
| --- | --- |
| APP_ENV | 生产为 production；隔离测试 cloud-test；生产禁止 ENABLE_TEST_PAYMENTS=true |
| ADMIN_JWT_SECRET | 随机至少 32 字符；所有鉴权函数一致，轮换会使现有会话失效 |
| WECHAT_APP_ID | 实际小程序 AppID，与商户绑定一致 |
| WECHAT_APP_SECRET | 仅服务端 REST 接口回退使用，不进入小程序包 |
| WECHAT_PAY_MCH_ID | 自有普通商户号 |
| WECHAT_PAY_SERIAL_NO | 商户签名证书序列号 |
| WECHAT_PAY_PRIVATE_KEY_BASE64 | 商户私钥 PEM 的 Base64；也支持 WECHAT_PAY_PRIVATE_KEY，二选一 |
| WECHAT_PAY_API_V3_KEY | 恰好 32 字节 |
| WECHAT_PAY_PLATFORM_KEYS_JSON | JSON：微信平台证书序列号或公钥 ID → 对应 PEM 公钥；必须与响应 serial 匹配 |
| WECHAT_PAY_NOTIFY_URL | 支付 HTTP 回调 HTTPS URL |
| WECHAT_REFUND_NOTIFY_URL | 退款 HTTP 回调 HTTPS URL |
| WECHAT_EVENT_TOKEN | 小程序消息推送 Token |
| WECHAT_EVENT_AES_KEY | 消息推送 EncodingAESKey，43 字符 |
| CONTENT_SECURITY_OPENID | 真实管理员微信 openid，满足微信内容安全接口最近访问要求；失效须重新访问小程序 |

公钥映射需建立轮换操作：提前加入新公钥，联调验证后再移除旧公钥。未知 serial 验签失败，订单保持待核实，不得绕过验签。

部署共 20 个正式函数：addresses、adminAuth、adminBanners、adminCategories、adminGateway、adminOrders、adminProducts、adminUsers、activation、ads、auth、cart、orders、orderTimeoutJob、payment、paymentCallback、refundCallback、wechatEvents、contentReviewJob、products。ads 保留禁用响应以兼容前端，不发奖励。

```powershell
./scripts/deploy-cloud.ps1 -EnvId '<实际环境ID>' -CliPath '<微信开发者工具cli.bat绝对路径>'
```

脚本自动先打包；失败停止。也可开发者工具逐个选择“上传并部署：云端安装依赖”。生产不带 IncludeTestPayment，不部署 testPayment/initDb。cloudbaserc.json 的占位环境 ID 必须按目标填写。读取每个函数的版本、状态、权限、环境变量及超时，不以上传成功代替运行验证。

## 5. HTTP 回调与微信官方能力

为 paymentCallback、refundCallback 分别创建公开 HTTPS HTTP 触发入口，只接收微信 POST。必须传入未修改的原始 body 字符串、原始 Wechatpay-* 头、httpMethod、isBase64Encoded；网关不得先解析再序列化 JSON，否则验签失败。把完整 URL 填入环境变量。成功落账后才返回 200；验签、金额或数据库失败返回 500，让微信重试。不可用 cloud.callFunction 普通 JSON 代替原始 HTTP 通知。

为 wechatEvents 配置 GET/POST HTTPS 入口；微信公众平台消息推送选择 JSON、安全模式，填写相同 Token/AESKey。GET 验签返回 echostr，POST 校验 msg_signature 并解密，AppID 校验后处理异步图片审核。不得选择明文或 XML 模式。接口验签和后台启用都要实际通过。

核对各 config.json 的 OpenAPI 权限：adminProducts/auth 的文本与媒体安全、orders 的文本安全和发货查单、adminOrders/orderTimeoutJob 的发货上传和查单、contentReviewJob 的媒体异步安全。如果云调用不可用，REST 回退还需要正确 AppSecret、服务端网络及微信 IP 白名单配置；不得在不确定上传结果后盲目重复发货。

```powershell
./scripts/apply-openapi-permissions.ps1 -EnvId '<实际环境ID>'
./scripts/apply-openapi-permissions.ps1 -EnvId '<实际环境ID>' -Apply
```

第一条只打印核对清单，第二条创建定时器（不会自动授予权限）：内容审核每分钟；订单关单/退款/收货巡检每 15 分钟。已存在时请读回配置而非忽略失败。orderTimeoutJob/contentReviewJob 超时 60 秒。确认云端时区、cron 实际触发及日志；有待处理积压时告警。审核单次 3 个媒体任务，订单巡检分批处理，不能把一次运行当作全量完成。

商品保存强制下架并进入当前版本审核；全部图片通过才可手动上架。任一图片失败保持待处理；修改商品会废弃旧版本审核结果。微信余额纯抵扣订单没有现金交易号，无法上传微信支付发货信息；本地仍记录快递履约。如果业务要求每笔都出现在微信订单中心，须先调整余额策略后重新验收，不能伪造 transaction_id。

## 6. 小程序和后台

将 miniprogram/services/cloud.ts 中 CLOUD_ENV_ID 占位替换为实际环境，ENABLE_LOCAL_GATEWAY 保持 false；检查 project.config.json AppID。配置真实品牌及 miniprogram/config/store.ts 客服电话。未配置电话时不展示，在线客服使用官方 contact 按钮，需在平台配置接待人员。客服电话、服务时间、退换货条款按实际业务填写。

微信公众平台补全实际类目及资质、隐私保护指引（地址、电话、头像等实际收集项）、隐私授权配置、内容安全与发货信息管理、客服、用户反馈、服务协议。小程序使用 requirePrivacyAuthorize/openPrivacyContract，体验版真机验证用户拒绝授权时不收集数据。低版本接口不可用时提示，不应降级绕过授权。

后台用 admin-web 构建 dist，按既有托管方案部署 HTTPS；配置 adminGateway HTTP 入口及前端环境变量（见 admin-web/.env.example），禁止公网无鉴权直写。核对仅 SUPER_ADMIN 可登录，退出/禁用/重置密码让旧会话失效。收货操作调用微信官方订单确认页面，再以服务端查单确认，不能只靠客户端成功回调。

在微信数据分析配置事件 product_view、order_submit、payment_start、payment_confirmed，核对报表中收到事件；不上传 openid、地址和电话。

## 7. 真实联调验收，逐项保存证据

1. 真机登录、拒绝隐私授权、同意后维护地址；购物车增改、商品下架后拒绝下单。
2. 同 requestId 重复下单仅一单；篡改价格无效；金额全程整数分；他人订单/购物车不可访问。
3. 小额真实微信支付，前端支付成功但回调延迟仍可靠查单；原始通知验签、重复通知、数据库失败重试后仅落账一次。
4. 取消及超时订单先查单/关微信单；支付与取消并发不双记账。CLOSING 等待核实不得手动改成未付款。
5. 真实快递公司及运单发货，上传微信发货信息；超时先查询已有发货结果再重试。微信状态 3/4 才确认收货，5/6 不得误判已收货；完成后评价进行内容安全审核。
6. 未发货整单退款、已发货退货确认后退款；现金按 payAmount、余额按 balanceAmount 分别退，凭微信 SUCCESS 才终结。重复退款通知仅入账一次；PROCESSING/CLOSED/ABNORMAL 保持核实，不给用户虚假成功。CLOSED/ABNORMAL 当前需人工查账和后续恢复处理，后台不能强制标为 REFUNDED。
7. 商品文本拒绝、图片异步全部通过、单图拒绝、旧版本回调均测试；队列定时器实际工作。头像检查及消息安全模式通过。
8. 超管禁用、最后一个超管保护、密码重置和旧 JWT、伪造 role/adminJwtSecret 越权均拒绝；旧商户凭证失效。
9. 对账订单、支付记录、refund_records、balance_transactions 与微信商户后台；查看所有异常及队列积压。保留测试单号、金额、通知结果、状态变化，隐去个人信息与密钥。

本地已有 23 项测试，不能代替上述真机与实际 CloudBase 事务/索引/权限验证。当前未执行云部署、真实支付退款或提审。

## 8. 退役、提审、发布与回滚

先备份并确认旧环境只有测试数据。停止旧定时器，控制台显式停用/删除 merchantAuth、adminInventory、pickupPoints 等旧入口及不再使用的测试函数；本地删除目录不会删除云函数。清除旧商户/子单/库存/自提数据时须确认目标环境，禁止脚本自动跨环境清库。

上传体验版，按第 7 节验收完成后提交审核；填真实类目、资质、隐私与服务说明，提供审核人员可访问的路径和商品。生产密钥与测试隔离。发版后关注支付失败、通知失败、CLOSING/REFUNDING 长时间停留、发货上传失败、审核队列积压、超管异常操作。每天核对资金流水。

依赖检查还存在既有后台依赖风险（本次 npm audit：6 项，含 3 high；涉及 xlsx、Vite、react-router、source-map-js）。上线前按锁文件实际版本重新 audit，制定兼容升级或替换方案并构建回归，不使用强制主版本升级掩盖问题。

回滚前保存当前代码、云函数版本、权限、数据库备份及配置版本。不要回滚到旧多商户支付/退款逻辑；遇资金异常先暂停下单和退款，保留回调及对账，按已确认的交易证据人工处置。任何云端退款/余额修正必须留操作记录，禁止直接编辑订单假装完成。

## 9. 官方文档入口

接口及准入以微信当前官方配置为准，部署时再次核对：[微信支付 API v3](https://pay.weixin.qq.com/doc/v3/merchant/4012062524)、[小程序内容安全](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/sec-center/sec-check/msgSecCheck.html)、[发货信息管理](https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/order-shipping/order-shipping.html)、[消息推送](https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html)、[隐私授权](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/privacy/wx.requirePrivacyAuthorize.html)。本次已对照官方原始参数，最终账号准入仍须控制台验证。

## 10. 2026-10-09 全源码复核后的部署补充

本轮运行时缺陷与修复清单见《代码复核报告.md》，其验收更新覆盖旧测试数。正式adminGateway必须设置 ADMIN_ALLOWED_ORIGINS 为真实后台Origin（例如 https://实际后台域名，不带路径，多域名逗号分隔），不接受通配符，不默认信任所有腾讯云托管域名。Base64 HTTP JSON已兼容；必须做实际浏览器跨域预检。

adminBanners/adminCategories新增 security.msgSecCheck 权限；分类文字图标文字审核后生效，分类图片、轮播及专区图片进入共用内容队列，REVIEWING不会对用户发布；通过后恢复 desiredStatus。保存后台内容前确保 CONTENT_SECURITY_OPENID 最近访问小程序，并实际验证每种内容的通过/拒绝/旧版本回调。旧专区 promo_cards 回退、重置商品规格与不经过审核的图片迁移接口已移除。普通商品编辑保留原规格矩阵；界面的基准售价作用于所有保留规格，显式skus请求可单独设价。

补建 manifest 新增 user_updated、user_created、buyer_created、buyer_status_created 索引。地址最多50条，购物车最多100款，均为明确服务端限制；不涉及商品库存。订单数量统计由服务端对全部本人订单计数。

source-map-js已通过兼容升级修复；最新后台 npm audit 为5项（3 moderate、2 high），剩余Vite/esbuild、react-router及xlsx需要主版本升级或替换后专项回归。当前版本不应公网暴露开发服务器；xlsx仅用于导出、不读取导入文件。此风险未伪装为已修复。

## 11. 依赖修复最终验收（覆盖第10节暂存告警）

依赖兼容升级完成：Vite7.3.7、plugin-react5.2.0、React Router7.18.4、SheetJS官方CDN0.20.3，锁文件包含integrity；source-map-js保持修复版。后台npm audit最新0告警；生产构建、真实Excel导出/序列化和路由API导航smoke通过。构建主机须Node ^20.19.0或>=22.12.0，package.json已明确engines。本次未新增另一套导出库。

首次部署构建按锁文件npm ci --ignore-scripts，需要访问npm及cdn.sheetjs.com；不能改回npm上的旧xlsx版本。保持完整浏览器流程验收；约673kB入口大包提示尚存，可后续拆包，不影响本次构建通过。其他真实交易与微信准入门禁不变。

## 12. 公司水果与逐件拆单部署增量（2026-10-09）

此节覆盖旧“规格矩阵”“单主订单”和免运费描述：每商品仅一条有效SKU；同批次一笔普通JSAPI付款，每件生成独立订单。未付款取消任一分单会取消全批次，已付款后各分单独立履约与退款。不要直接修改历史订单快照或删除旧SKU关联。

- 现在26个集合，新增store_settings为服务端私有；按common/schema.js生成最新manifest并创建新增索引，尤其付款汇总/分单查询、退款requiresAction/lastCheckedAt、审核updatedAt轮转索引。需部署后读回权限及索引，不以本地检查替代。
- cloudbaserc.json中的8处ADMIN_JWT_SECRET为环境引用。原密钥若真实使用须轮换并核验会话失效；最终AppID/CloudBase环境/后台Origin仍需统一。CloudBase环境变量更新可能替换全表，先备份核对完整变量，勿将空变量表覆盖支付参数；不要把密钥提交仓库或日志。
- 重新打包22个函数，正式仍部署20个，initDb/testPayment仅隔离环境。orderTimeoutJob超时改180秒，实际定时触发与关单/发货/退款三阶段预算需验收。
- 后台“商家与配送”配置真实主体、执照公开地址、备案、客服及省市区运费；区县精确规则优先，其次市、省、默认规则。填写名称须与地址数据一致。生产没有配送规则会拒绝下单；未替商家配置全国配送或虚构运费。运费为首件加续件，不是重量计费。
- 一次结算最多10种、每种5件；退款引用原交易总现金金额、分单现金退款金额与原退款号，不改原交易金额。不同分单退款间隔至少一分钟；结果未知先查原号再同号重试。CLOSED/ABNORMAL只进入人工核实，未实现自动新号恢复。
- 微信发货依据原支付交易汇总不同包裹，最多15个；同运单可关联多个分单。必须实测分批上传、共用运单、全批发完、部分退款及收货限制。官方拆分发货页面未成功读取，不能用本地测试替代真实平台接口兼容验收。纯额度订单没有微信现金交易，保留本地履约，不伪造关联。
- 付款后48小时发货按核验的微信success_time起算；售后允许收货完成后质量申请和有审计的免退货批准。售后照片当前走既有客服，不存在代码附件上传或自动补发。
- 本轮53项本地回归、小程序与后台构建通过；本机实际Node18/Vite5与仓库较新声明环境不一致，部署主机仍按第11节要求统一锁文件/Node并重新audit、构建。本轮未复跑audit，不沿用历史0告警结论；后台大包提示保留。

完成项和全部剩余门槛见《上线流程与待完善清单.md》。本轮未部署、未提审、未操作真实资金。
