import { TID_V4_SESSION_PANE, TID_V4_TIMELINE, testId } from "@zcode/shared";
import { clearAppData } from "../helpers/desktop-app.js";
import {
  UPSTREAM_MODEL,
  UPSTREAM_PROVIDER_ID,
  ensureUpstreamModelForE2E,
  selectUpstreamModelById,
} from "../helpers/upstream-provider.js";
import {
  V4_MAIN_PANE_ID,
  prepareV4ConversationE2E,
  sendV4Prompt,
  waitForV4ComposerText,
  waitForV4ConversationState,
  waitForV4TimelineContaining,
} from "../helpers/v4-conversation.js";

/**
 * ```qimen 围栏 → 原生盘面 全链 E2E 回归护栏（spec: docs/development/138-qimen-pan-fence.md）。
 *
 * 背景：速度药丸同类事故——升级 merge 整版覆盖 renderer 文件时，CE 渲染接线静默消失
 * （1dd6e557 重植）。消息级单测锁组件链，本用例锁「真实会话流式回复 → 时间线 → 盘面 DOM」
 * 的最终消费点：assistant 回复携带 qimen 围栏时，时间线必须出现九宫盘面而非原始 JSON 代码块。
 * 回复内容为合成 fixture（确定性），不依赖真实模型是否按约定输出围栏。
 *
 * 本地实跑注意（CI 受控环境不适用）：
 * 1. shell 里残留 ELECTRON_RENDERER_URL（如从 dev 终端启动的 agent）会被 staged app
 *    继承，加载无测试桥的 dev 渲染器 → bridge preflight 必挂。运行前须 unset。
 * 2. 宿主机真实凭据缓存可能在首启触发「会话需重新认证」alert 与更新重启流，
 *    干扰窗口生命周期（已加 Escape 防御，更强的隔离属 runner 环境职责）。
 */

const SEED = "E2E_QIMEN_PAN_FENCE";
const REPLY_DETAIL = "详断：用神离宫";

/**
 * 本地环境可能在启动期弹出全局 alert（如缓存 OAuth 会话需重新认证——真实凭据状态
 * 决定，与用例无关）。按产品支持的 Escape 路径关闭（settleAlert(false)，不伪造记录），
 * 让用例对宿主环境差异免疫；CI 隔离 home 下通常不弹。
 */
async function dismissStartupAlertDialogIfPresent() {
  const overlay = await $('[data-slot="alert-dialog-overlay"]');
  if (await overlay.isExisting()) {
    await browser.keys("Escape");
    await overlay.waitForExist({ reverse: true, timeout: 15_000 });
  }
}

describe("qimen 围栏原生盘面 E2E", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("assistant 回复携带 qimen 围栏时时间线渲染九宫盘面而非原始 JSON", async function () {
    this.timeout(180_000);
    await prepareV4ConversationE2E();
    await ensureUpstreamModelForE2E(UPSTREAM_MODEL);
    await selectUpstreamModelById(UPSTREAM_MODEL, {
      includePlainModelFallback: false,
      providerId: UPSTREAM_PROVIDER_ID,
    });

    const prompt = `${SEED}_${Date.now()}`;
    await dismissStartupAlertDialogIfPresent();
    await sendV4Prompt(prompt);
    await waitForV4ComposerText("", `${prompt} 发送后输入框没有清空`);
    await waitForV4TimelineContaining(prompt, 30_000);
    await waitForV4TimelineContaining(REPLY_DETAIL, 60_000);
    await waitForV4ConversationState(
      (state) => !state.canStop,
      `${prompt} 完成后没有回到 idle`,
      60_000,
    );

    // 最终消费点断言：主 pane 时间线内出现原生盘面 DOM（ palace 数据齐全）。
    const panProbe = await browser.execute(
      (paneTestId, timelineTestId) => {
        const pane = document.querySelector<HTMLElement>(`[data-testid="${paneTestId}"]`);
        const timeline = pane?.querySelector<HTMLElement>(`[data-testid="${timelineTestId}"]`);
        const pan = timeline?.querySelector<HTMLElement>('[data-qimen-pan=""]');
        return {
          panExists: Boolean(pan),
          palaceCount: pan?.querySelectorAll("[data-qimen-palace]").length ?? 0,
          timelineText: timeline?.innerText ?? "",
        };
      },
      testId(TID_V4_SESSION_PANE, V4_MAIN_PANE_ID),
      TID_V4_TIMELINE,
    );
    expect(panProbe.panExists).toBe(true);
    expect(panProbe.palaceCount).toBe(2);
    // 原始 JSON 不应以代码正文出现（盘面替换了代码块）。
    expect(panProbe.timelineText).not.toContain("protocolVersion");
    expect(panProbe.timelineText).toContain("阴遁6局·拆补·上元");
  });
});
