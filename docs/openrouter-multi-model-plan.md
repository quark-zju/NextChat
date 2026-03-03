# NextChat OpenRouter 多模型改造方案（面向家长场景）

## 目标

在不追上游、不大改架构的前提下，基于当前项目实现：

1. 后端统一配置 OpenRouter 账号（用户端不接触 API Key）。
2. 前端可选模型（Gemini、Claude、GPT 等）。
3. 可选展示模型“思考过程”文本（如果提供方支持并返回）。
4. 对思考过程做分段翻译（英文 -> 中文），降低家长理解门槛。

## 当前代码现状（已确认）

- 请求链路：`app/requests.ts` -> `/api/openai` 或 `/api/chat-stream` -> `app/api/common.ts` 反向代理。
- 鉴权：`middleware.ts` 强制注入 `OPENAI_API_KEY` 到 `token` header。
- 模型列表：`app/store/app.ts` 中 `ALL_MODELS` 硬编码，且 `limitModel` 限制只能选白名单。
- 流式解析：`app/api/chat-stream/route.ts` 只读取 `choices[0].delta.content`，忽略 reasoning 等其它字段。

结论：目前是“OpenAI 兼容代理 + 单一文本输出”架构，具备改造成 OpenRouter 的基础。

## 方案原则

- 最小侵入：沿用现有 `/api/openai` 与 `/api/chat-stream`，不重写整套 SDK。
- 服务端托管密钥：继续只在服务端持有 key，家长端不暴露。
- 分阶段上线：先保证可用，再逐步加“思考展示/翻译”。

## 阶段 1（MVP）：接入 OpenRouter + 模型选择可用

### 1) 鉴权与代理层

修改 `middleware.ts` + `app/api/common.ts`：

- `middleware.ts` 的 `matcher` 扩展到新增接口，确保统一走 `CODE` 校验。
  - 当前：`/api/openai`、`/api/chat-stream`
  - 增加：`/api/reasoning-translate`（以及后续内部接口）
- 默认 provider 固定为 OpenRouter：
  - key 来源：`OPENROUTER_API_KEY`
  - base url 固定：`openrouter.ai/api`
  - 可选 headers：`HTTP-Referer`、`X-Title`
- 允许后端按模型名硬编码路由到 OpenAI（不新增 ENV）：
  - 例如在 `app/api/common.ts` 维护 `OPENAI_DIRECT_MODELS` 集合
  - 命中集合时：
    - base url 切到 `api.openai.com`
    - key 切到 `OPENAI_API_KEY`
  - 未命中时继续走 OpenRouter

### 2) 模型配置方式

修改 `app/store/app.ts` + `app/components/settings.tsx`：

- 保留现有下拉，模型列表直接在代码中维护（你可直接改代码，不依赖 ENV）。
- 示例：在 `app/store/app.ts` 定义你实际要给家长开放的模型数组。
- `limitModel` 改为“若不在列表则回退到第一个模型”。

### 3) 兼容参数处理

修改 `app/requests.ts`：

- 删除当前强绑定 `gpt-4 -> gpt-4o`、`gpt-5 -> gpt-5.2-chat-latest` 的映射逻辑。
- 仅保留通用字段（`temperature`、`max_tokens` 等），按 provider 做轻量参数兜底。

> 结果：家长可选多模型，默认全走 OpenRouter；你可在后端代码中把少数模型定向走 OpenAI，以利用价格差。

## 阶段 2：思考过程展示（可选开关）

### 1) 数据结构

修改 `app/store/app.ts` 的 `Message`：

- 新增字段：
  - `reasoning?: string`
  - `reasoningTranslated?: string`
  - `reasoningVisible?: boolean`

### 2) 流式解析升级

修改 `app/api/chat-stream/route.ts`：

- 目前仅解析 `delta.content`。
- 改为同时收集：
  - `delta.content` -> 正文
  - `delta.reasoning` / `delta.thinking` / provider 扩展字段 -> 思考内容
- 用统一内部事件格式回传给前端（例如 JSONL）：
  - `{type:"content", text:"..."}`
  - `{type:"reasoning", text:"..."}`
  - `{type:"done"}`

### 3) 前端展示

修改 `app/requests.ts` + `app/store/app.ts` + `app/components/chat.tsx`：

- 让 `requestChatStream` 能区分内容与 reasoning 增量。
- UI 在助手消息下增加“查看思考过程”折叠区。
- 默认折叠，避免干扰家长。

> 注意：不同模型对 reasoning 的支持差异很大，需要按模型能力降级（无则不显示）。

## 阶段 3：思考过程自动分段翻译

### 1) 翻译策略

新增服务端接口（建议）：`/api/reasoning-translate`，并纳入 `middleware.ts` 的 `matcher`，复用同一套权限校验。

- 输入：reasoning 原文（长文本按段切分）。
- 使用一个低成本模型翻译（例如 OpenRouter 上的 mini 模型）。
- 输出：与原段落一一对应的中文。

### 2) 分段规则

优先简单稳定：

- 按空行/句号切段。
- 每段限制 token 长度（如 400-600 字符）避免超长失败。
- 失败段落原文回退，不阻断主回答。

### 3) 交互方式

设置项新增：

- `显示思考过程`（默认关）
- `自动翻译思考过程`（默认关）

聊天区展示：

- 原文/译文切换标签。
- 在译文上标注“机翻，仅供参考”。

## 文件级改造清单（建议顺序）

1. `middleware.ts`：扩展 matcher，保证新增接口统一权限校验。
2. `app/api/common.ts`：默认 OpenRouter + 按模型硬编码切 OpenAI。
3. `app/store/app.ts`：代码内模型列表、模型校验、message 新字段。
4. `app/components/settings.tsx`：模型下拉与开关设置项。
5. `app/requests.ts`：请求参数通用化 + 流解析事件化。
6. `app/api/chat-stream/route.ts`：SSE 字段扩展解析。
7. `app/components/chat.tsx`：reasoning 折叠展示。
8. `app/locales/*.ts`：新增文案。

## 风险与规避

- 提供商字段不统一：
  - 规避：后端做“多字段兜底提取 + 能力探测”，前端只消费统一事件。
- 模型参数不兼容：
  - 规避：按 provider/model 黑名单剔除不支持参数。
- 路由策略随代码变更引发行为漂移：
  - 规避：将“直连 OpenAI 模型集合”集中定义并加注释，改动时同步记录在变更说明。
- 翻译成本上升：
  - 规避：仅用户展开时触发翻译，或仅翻译前 N 段。

## 推荐落地节奏

1. 先做阶段 1，上线可用的多模型聊天（1-2 天）。
2. 再做阶段 2，让 reasoning 可展示（1 天）。
3. 最后做阶段 3，增加分段翻译和开关（1-2 天）。

这样你可以先给家长用起来，再逐步增强体验，且每一步都可独立回滚。
