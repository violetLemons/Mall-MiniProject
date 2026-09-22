# 贡献指南 (Contributing Guide)

感谢您关注并参与微信小程序商城开源模板项目！无论您是提出建议、改进文档、修复 Bug 还是贡献新特性，我们都热烈欢迎。

---

## 贡献流程 (Workflow)

1. **Fork 本项目** 到您自己的 GitHub 账号下。
2. **克隆代码** 到本地：
   ```bash
   git clone https://github.com/YOUR_USERNAME/wechat-miniprogram-mall-template.git
   cd wechat-miniprogram-mall-template
   ```
3. **安装依赖**：
   ```bash
   npm install
   cd admin-web && npm install && cd ..
   ```
4. **新建分支**（分支命名推荐以 `feat/` 或 `fix/` 开头）：
   ```bash
   git checkout -b feat/your-feature-name
   ```
5. **本地开发与测试**：
   - 确保通过本地 TypeScript 类型校验：`npm run build`
   - 确保管理后台编译通过：`cd admin-web && npm run build`
   - **绝对禁止提交任何真实商户密钥、证书或隐私数据**。
6. **提交变更**：
   ```bash
   git commit -m "feat: add some amazing feature"
   ```
7. **推送分支并发起 Pull Request**：
   ```bash
   git push origin feat/your-feature-name
   ```
   并在 GitHub 上点击「New Pull Request」。

---

## 代码规范与准则

- 保持代码整洁，尽量遵循既有代码的缩进、命名和架构分层规范。
- 微信小程序端遵循原生组件与生命周期规范，避免滥用第三方厚重框架。
- 云函数严格遵循原子性与权限隔离机制，所有敏感操作必须具备服务端鉴权。
