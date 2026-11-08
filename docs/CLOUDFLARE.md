# 从 GitHub 部署到 Cloudflare

仓库默认使用 **Cloudflare Workers Static Assets + Git 集成**。Cloudflare 托管 Vite 生成的静态文件；DSL 求值、文件处理、公式渲染和 PPTX 导出都在访客浏览器运行，不需要 Worker 脚本、数据库、API Key 或运行时环境变量。

## 连接仓库并首次部署

在 Cloudflare 控制台进入 **Workers & Pages → Create application → 连接 GitHub 仓库**，选择 `Jw-23/easy-slide`，使用 Workers 部署流程。

| 设置                             | 值                                                   |
| -------------------------------- | ---------------------------------------------------- |
| Worker 名称                      | `easy-slide`，与 `wrangler.jsonc` 的 name 一致       |
| 生产分支                         | `main`；预览未合并更新可选 `feat/local-slide-studio` |
| 根目录                           | 仓库根目录，保持默认                                 |
| 构建命令                         | **留空**                                             |
| 部署命令                         | `npx wrangler deploy`                                |
| 非生产分支部署命令（如显示此项） | `npx wrangler versions upload`                       |
| Node.js                          | 仓库的 `.node-version` / `.nvmrc` 指定 Node 22       |
| 构建变量、运行时变量             | 无需设置                                             |

构建命令留空是因为 `wrangler.jsonc` 的 `build.command` 已定义 `npm run build`。Wrangler 在部署前自动运行 TypeScript 检查和 Vite 构建，然后从 `dist` 上传静态文件。无需在控制台重复配置同一个构建命令。

Cloudflare 的 Git 集成会安装仓库锁定的依赖并在后续推送时自动部署。Wrangler 版本已固定在 package.json 和 package-lock.json 中。

基础编辑器与 Cloudflare 配置已经合并到 `main`。PWA 更新合并前，需选择 `feat/local-slide-studio` 体验安装与离线功能；合并后可使用 `main`。创建项目时若使用其他名称，应同时修改 wrangler.jsonc 的 name，以保持一致。

首次连接 GitHub 需要你在 Cloudflare 页面授权仓库访问。仓库配置本身不会代替账户授权或创建 Cloudflare 项目。

部署成功后使用 Cloudflare 返回的 workers.dev 地址。功能示例地址为该域名加 `/?example=features`。自定义域名可在 Worker 的域名设置中添加。

## 仓库配置

- `wrangler.jsonc`：静态输出目录、构建命令、兼容日期与 SPA 回退。
- `.node-version`、`.nvmrc`、package.json engines：使用兼容 Vite 和 Wrangler 的 Node 版本。
- `public/_headers`：构建时复制到 dist；HTML、安装清单和 Service Worker 每次访问重新验证，带哈希的 assets 与 Workbox 运行库允许长期缓存。
- package-lock.json：锁定构建依赖。

单页应用回退通过 `assets.not_found_handling` 完成：优先提供真实静态文件，其他页面导航回退到 index.html。`/?example=features` 等查询参数由前端读取。

本项目是纯静态部署，不要把浏览器端 `src/main.tsx` 填成 Worker 入口文件，也不要把 Sites 专用的 `.openai/hosting.json` 当作 Cloudflare 配置。

## 本地检查与可选手动部署

```sh
npm ci
npm run cf:check
```

cf:check 会执行构建并进行 Wrangler dry-run，验证配置和静态部署产物，不发布到你的账户。

使用 Cloudflare 本地运行时验证静态文件与响应头：

```sh
npm run cf:dev
```

打开 `http://127.0.0.1:8787`。

若要手动发布，可在自己电脑上通过 `npx wrangler login` 登录，然后执行 `npm run deploy`。Git 集成部署无需把 Cloudflare token 写入仓库。

## 数据与浏览器

Cloudflare 的 HTTPS 地址支持 PWA 安装。首次访问后缓存应用资源，安装入口位于工具栏。发布新版本后，旧页面联网检查更新，并提示「保存并更新」；只有用户点击后才保存草稿并刷新当前窗口，其他窗口不会被强制刷新。无需额外开启 Cloudflare 服务或增加 Worker 代码。不要为 `/sw.js` 或 `/manifest.webmanifest` 额外配置长期强缓存规则。

线上依然将工程保存在访客浏览器。不同域名使用不同的 IndexedDB，因此从 ChatGPT Sites 换到 Cloudflare 时，可先在旧域名导出完整工程，再到新域名导入。

目录读取需要支持 File System Access 的浏览器，并由访客选择授权目录；Cloudflare HTTPS 页面支持所需的安全上下文。纯静态托管不会直接读取访客磁盘。

## 参考

- [Workers Git 构建配置](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Wrangler 自定义构建](https://developers.cloudflare.com/workers/wrangler/custom-builds/)
- [Workers 静态资源](https://developers.cloudflare.com/workers/static-assets/)
- [静态资源响应头](https://developers.cloudflare.com/workers/static-assets/headers/)
