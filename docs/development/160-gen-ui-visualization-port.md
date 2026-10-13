# 160 · F4 可视化交互界面：gen-ui 投影 + stream-animate 开发工具的取舍

> 状态：**已实现(完整渲染链)：gen-ui 全域(contract + domain + app + components + adapters 3 + host + module + hooks/useGenGui)搬入且类型门禁全通过。前置全部就位:plugin-ui 72 文件域(本成员)、IGenUiService(task-13)、shared gen-ui 契约(task-11)、TID(task-16)。conversationProjectionStore 的 onLiveDeltas 链已补(供 pluginUiResourceDeltaFeed)。**覆盖 v3.15.1 公告条目「可视化交互界面(消息流直观展示)」的 UI 侧移植。
> 数据来源：上游 worktree `.reverse/91-upstream-checkout/zai-org-ZCode-3151`(aac47556)与 CE HEAD `003870d` 的逐文件对比。

## 0. 读了什么 / 结论一致性

| 材料                                                   | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.reverse/104-v3151/reports/PORT-MATRIX.md` F4 行      | **部分推翻**。矩阵把 F4 定为「新建 packages/stream-animate(从上游搬运)并集成 AssistantPreviewCards」。实测:(a) CE 的 `AssistantPreviewCards.tsx`/`ToolCallBlocks.tsx` **自 fork 基线就带 `data-zcode-stream-animate` 属性**(CE 2 处引用,非矩阵所写 3 处;第 3 处是上游 `MessageChangeSummaryPanel.tsx`,CE 无此文件) —— 「集成 AssistantPreviewCards」不需要做;(b) stream-animate 是**独立开发工具**,不被任何运行时代码引用(上游引用方仅 gen-ui-fixture、e2e 探针、third-party/inventory.json);(c) 真正的 F4 用户面载体是 `packages/ui/src/gen-ui/`(上游独有 18 文件)。 |
| 上游 `packages/stream-animate/`(22 文件)               | **证实**为 3.15.1 新进开源仓(git log 仅 aac47556)。形态:独立 HTTP 服务(默认 127.0.0.1:5187)+ Vite 前端,`deepseekRunner.ts` 直连 `https://api.deepseek.com/chat/completions`(需 API key),按 60/120fps bucket 测流式帧时序,数据落 `.stream-animate-data/`。                                                                                                                                                                                                                                                                                                             |
| 上游 `packages/ui/src/gen-ui/CONTRACT.md`              | **新增事实**：F4 用户面 = 助手输出中的 `::visualize{path="..." title="..." mode="wide"}` 引用 → 有边界的 desktop sandbox 页面;「window page owner 与 MCP 页面共享 admission/eviction 容量」⇒ **gen-ui 与 F5 plugin-ui 强耦合**(F5 契约由 task-1/desktop-host-port 负责)。                                                                                                                                                                                                                                                                                             |
| 上游 `packages/ui/src/AssistantPreviewCards.tsx` vs CE | **新增事实**：上游相对 CE 的增量是 `compactForRemoteControl`(远控紧凑渲染)与若干函数导出化 —— 属远控紧凑渲染,**不是**可视化新增;与 F4 公告无直接对应。                                                                                                                                                                                                                                                                                                                                                                                                                |

## 1. 产品规则(待 Lead 裁决的判断分歧)

1. **stream-animate 定位为开发工具,不进产品分发**(判断分歧,已按 AGENTS.md「判断分歧先与人对齐」标注):
   - 依据:它需要用户自备 DeepSeek API key 并直连外部 API;上游自身也只在脚本/e2e 里用。按 AGENTS.md「能力来源与取舍」属**可选增强**三条(① 无它核心能力完整 ✓ ② 如实声明 ✓ ③ 用户明确要求时才装 ✓)。
   - 备选方案 A(推荐):搬入 `packages/stream-animate/` 作为 workspace 内 dev-only 包,加入 `pnpm typecheck` 覆盖,**不**进桌面打包;Apache-2.0 标记 + 登记。
   - 备选方案 B:不搬,在本 spec 记录「已查证为开发工具,CE 暂不需要」。
2. **gen-ui 是 F4 用户面的真身,依赖 F5**:CE 当前 0 文件。移植边界:`gen-ui/` 18 文件(ui 层)+ 它依赖的 page owner/admission 机制与 plugin-ui 共享。**本 spec 暂不实现 gen-ui**,待 task-1 的 mcp-ui 契约 + desktop-host-port 的 plugin-sandbox 落地后,由本成员接 UI 集成层。
3. **不搬上游 rewards/marketing-touch/cloud-content-dialog**:F1(邀请好友)分类 C,与之共用的 `CodingPlanBillingDiscount.tsx` 等运营件不搬。

## 2. 状态所有者

| 状态                                       | 唯一所有者                                                    | 读取方                 |
| ------------------------------------------ | ------------------------------------------------------------- | ---------------------- |
| 基准运行记录(runs / ndjson / summary.json) | stream-animate 自身 `dataStore.ts`(`.stream-animate-data/`)   | 其 Vite 前端(仅开发态) |
| gen-ui 页面实例(若移植)                    | desktop page owner(与 MCP 页面共享,属 desktop-host-port 边界) | 消息组件按 lease 引用  |

## 3. 接口

- stream-animate(若采用方案 A):无跨包接口;脚本入口 `pnpm --filter @zcode/stream-animate run:sample`、服务入口 `STREAM_ANIMATE_PORT` 环境变量。
- gen-ui:接口契约见上游 `gen-ui/CONTRACT.md`;`collectGenUiSourcePaths`/`matchesGenUiSourcePath` 为投影边界。

## 4. 验收

- 方案 A:typecheck 覆盖 stream-animate;README/spec 如实声明「需要用户自备 DeepSeek API key,直连 api.deepseek.com」;不进入桌面构建产物(verify 打包产物 0 命中)。
- gen-ui(后置):`::visualize` 引用能在会话中投影出 sandbox 页面;不含重复 HTML 预览卡(按 CONTRACT 的去重规则)。

## 5. 依赖与回传

- 依赖 task-1:mcp-ui 契约(gen-ui 与 MCP 页面共享 admission/eviction)。
- 已记录的搬运清单(交 release-integrator):如采用方案 A,`packages/stream-animate/` 全量 22 文件(上游路径同名),Apache-2.0,文件头加 `Modified by ZCode:` 标记(仅在实际修改时)。
