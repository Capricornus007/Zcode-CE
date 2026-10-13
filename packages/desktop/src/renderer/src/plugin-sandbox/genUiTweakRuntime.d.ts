// Modified by ZCode: 搬自上游 zai-org/ZCode aac47556 (Apache-2.0);插件 UI 沙箱(F5),与上游一致,仅随本仓 shared/构建入口路径调整。
import type { GenUiTweakMessage, GenUiTweakResult } from "@zcode/shared/gen-ui";

/** 类型边界由 Gen UI 消息 schema 校验；函数体保留上游 JavaScript。 */
export function installGenUiTweakRuntime(
  callTool: (
    name: "__zcode_visualization_annotations__",
    message: GenUiTweakMessage,
  ) => Promise<GenUiTweakResult>,
): void;
