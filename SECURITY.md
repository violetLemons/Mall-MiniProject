# 安全政策 (Security Policy)

本项目致力于提供安全、可靠、工业级的微信小程序电商模板。因电商交易涉及真实资金与商户敏感凭证，使用本项目时请务必遵循以下安全规范。

---

## 一、严禁在 Git 中提交任何商户私钥与凭据

**绝对禁止**将以下敏感凭据通过 Commit、Pull Request 或 GitHub Issue 提交至公共代码仓库：

1. **微信支付商户 API 私钥**（`apiclient_key.pem`、`*.pem`、`*.key`、`*.p12`）
2. **微信支付 APIv3 密钥**（`WECHAT_PAY_API_V3_KEY`）
3. **微信小程序 AppSecret**（`WECHAT_APP_SECRET`）
4. **腾讯云 CloudBase 密钥**（`SecretId` / `SecretKey`）
5. **数据库密码与管理员 Token**
6. **真实用户的手机号码、收货地址与 OPENID**

> [!WARNING]
> **私钥泄露风险**：若不慎将微信支付商户私钥上传至公共仓库，不仅会导致商户账户面临被盗刷、资金流失的高危风险，微信官方安全巡检系统也将主动熔断并限制您的商户号交易权限。若发生泄漏，必须立即登录 [微信支付商户平台](https://pay.weixin.qq.com) 吊销并更换新的 API 证书！

---

## 二、商户私钥的安全托管最佳实践

推荐通过**服务端环境变量**托管私钥，源码与版本库零接触：

1. 在本地使用命令行将您的 `apiclient_key.pem` 转为 Base64 单行文本：
   ```bash
   # Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("apiclient_key.pem"))

   # Linux / macOS
   base64 -w 0 apiclient_key.pem
   ```
2. 登录 **腾讯云开发控制台 (CloudBase)** $\rightarrow$ **云函数** $\rightarrow$ **环境配置** $\rightarrow$ **环境变量**；
3. 将 Base64 字符串填入 `WECHAT_PAY_PRIVATE_KEY_BASE64` 环境变量中；
4. 云函数运行时会在内存中安全还原并解密签名，无需将物理 `.pem` 文件置于云函数代码包内。

---

## 三、漏洞报告 (Reporting a Vulnerability)

如果您在本项目中发现了潜在的安全漏洞或逻辑缺陷，请不要在 GitHub 公开 Issues 中披露。请通过电子邮件向项目维护者发送私密报告，我们将在 48 小时内进行评估并发布修复补丁。
