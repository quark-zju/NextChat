# NextChat 项目导览（给协作 Agent）

这份文档用于帮助新加入的 Agent 快速定位代码。它不是业务规范，只聚焦「主要文件在哪里」。

## 1. 根目录关键文件

- `package.json`：依赖与脚本入口（`dev/build/start/lint`）。
- `next.config.js`：Next.js 构建与运行配置。
- `middleware.ts`：请求中间件（路由级预处理）。
- `README.md` / `README_CN.md`：项目说明与部署文档。
- `docs/`：补充文档与截图。
- `scripts/`：辅助脚本（如 prompt 拉取、环境初始化）。

## 2. 应用入口（App Router）

- `app/layout.tsx`：全局布局、全局样式引入、`<head>` 元信息。
- `app/page.tsx`：首页路由入口，渲染 `Home` 组件。
- `app/polyfill.ts`：客户端 polyfill。
- `app/constant.ts`：常量定义（仓库地址、更新地址等）。

## 3. 页面与 UI 组件

主要都在 `app/components/`：

- `home.tsx`：主壳层，管理侧边栏、设置页与聊天页切换。
- `chat.tsx`：聊天主流程（消息展示、输入、流式响应、导出等）。
- `settings.tsx`：设置页（主题、提交键、模型参数、访问配置等）。
- `chat-list.tsx`：会话列表与会话切换。
- `markdown.tsx`：消息 Markdown 渲染。
- `ui-lib.tsx`：通用 UI 组件（Modal、Input、Toast 等）。

配套样式文件：

- 组件级样式在 `app/components/*.module.scss`。
- 全局样式在 `app/styles/`（`globals.scss`、`markdown.scss`、`highlight.scss` 等）。

## 4. 状态管理（Zustand）

主要在 `app/store/`：

- `app.ts`：核心聊天状态（会话、消息、模型配置、归档、压缩逻辑）。
- `access.ts`：访问控制状态（access code / token / notice 状态）。
- `prompt.ts`：提示词状态与搜索索引（Fuse）。
- `screen.ts`：屏幕尺寸与响应式状态。
- `update.ts`：更新检查相关状态。
- `index.ts`：store 聚合导出。

## 5. API 与请求链路

服务端路由在 `app/api/`：

- `openai/route.ts`：统一代理入口，转发至上游并清理响应头。
- `chat-stream/route.ts`：流式对话代理，解析 SSE 并输出内容/推理事件。
- `usage/route.ts`：用量查询接口。
- `reasoning-translate/route.ts`：推理文本翻译接口。
- `common.ts`：服务端请求公共逻辑（上游请求封装）。
- `access.ts`、`usage.ts`：服务端访问/用量工具函数。

客户端请求在：

- `app/requests.ts`：封装 `requestChat` / `requestChatStream` / `requestUsage` 等。

## 6. 国际化与资源

- `app/locales/`：中英文文案（`cn.ts`、`en.ts`）与语言选择逻辑（`index.ts`）。
- `app/icons/`：SVG 图标资源。
- `public/`：静态资源与 PWA 文件（`site.webmanifest`、service worker、favicon）。

## 7. 建议阅读顺序（快速理解项目）

1. `app/page.tsx` + `app/layout.tsx`：先看入口与整体结构。
2. `app/components/home.tsx`：看页面框架如何拼装。
3. `app/components/chat.tsx`：看核心聊天交互。
4. `app/store/app.ts`：看状态与业务逻辑主干。
5. `app/requests.ts` + `app/api/*/route.ts`：看请求与后端代理链路。
6. `app/components/settings.tsx`：看可配置项与用户侧控制面板。

## 8. 修改时的落点建议

- 改 UI 行为：优先看 `app/components/` + 对应 `*.module.scss`。
- 改聊天逻辑：优先看 `app/store/app.ts` 与 `app/components/chat.tsx`。
- 改模型或请求参数：优先看 `app/requests.ts`、`app/store/app.ts`。
- 改接口转发：优先看 `app/api/openai/route.ts`、`app/api/chat-stream/route.ts`、`app/api/common.ts`。
- 改文案与多语言：优先看 `app/locales/`。
