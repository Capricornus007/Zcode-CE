# 162 · F11 账户菜单:查看套餐 + 复制用户 ID

> 状态：**已实现(X8 同批,工作树待提交)**。覆盖公告「账户菜单查看套餐 + 复制用户 ID」。

## 0. 读了什么 / 结论一致性

| 材料                                   | 结论                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX F11 行                     | **证实**。CE `WorkspaceSidebarFooter.tsx`(399 行)vs 上游(493 行):无 copyUserId、无套餐入口新增。                                                                                                                                                                                                                                                                             |
| 上游 `WorkspaceSidebarFooter.tsx` diff | **移植面 = +94 行中的三件事**:① `copyUserId`(`navigator.clipboard.writeText(user.id)` + toast,两条 i18n:`sidebar.profile.userIdCopied`/`userIdCopyFailed`,上游 locales 已有,CE locales 需补);② 套餐 badge —— CE **已有** `WorkspaceSidebarFooterPlanBadge`(在用,`footer.tsx:175`),套餐查看能力基线具备,仅需核对上游有无展示增量;③ 顺带上游把若干私有函数导出化(不影响行为)。 |
| 上游同文件中的 F1 件                   | **不搬**:`useOpenRewards`/`RewardsProvider`/`Gift`(F1 邀请好友,分类 C);上游用 `banner: ReactNode` 替换 CE 的 `remoteControlEntry` prop —— CE 保留自研 `RemoteControlEntryButton`(自托管 Web 控制的有意偏离,见 AGENTS.md 上游形态说明)。                                                                                                                                      |

## 1. 产品规则

1. **复制用户 ID 是兜底动作**:用户在排查/报障时需要提供身份;菜单项始终可用(登录态),失败 toast 明示。
2. **套餐查看不引入新状态源**:复用既有 usageSummaryState,只做展示对齐。
3. **不引入 rewards**:账户菜单里不出现邀请好友/奖励入口。

## 2. 状态所有者

| 状态             | 唯一所有者                   | 读取方                          |
| ---------------- | ---------------------------- | ------------------------------- |
| 剪贴板写入结果   | 浏览器 clipboard API + toast | footer 局部                     |
| 用户套餐展示状态 | 既有 usageSummaryState(基线) | WorkspaceSidebarFooterPlanBadge |

## 3. 接口

```ts
// packages/ui/src/WorkspaceSidebarFooter.tsx —— 新增局部动作
const copyUserId = async () => {
  if (!user?.id) return;
  try {
    await navigator.clipboard.writeText(user.id);
    toast(...userIdCopied);
  } catch {
    toast(...userIdCopyFailed);
  }
};
```

i18n:在 `i18n/locales/{en-US,zh-CN}.ts` 补 `sidebar.profile.userIdCopied`/`userIdCopyFailed`(从上游同名键搬运文案)。

## 4. 验收

- 登录态账户菜单出现「复制用户 ID」;点击后剪贴板内容 = user.id(测试可用 jest mock clipboard)。
- 未登录不渲染;失败路径走 fail toast。
- 不出现任何 rewards/邀请入口(grep 护栏)。

## 5. 搬运清单

- 逻辑片段(copyUserId + 菜单结构)源自上游 `packages/ui/src/WorkspaceSidebarFooter.tsx`,Apache-2.0;CE 文件内加 `Modified by ZCode:` 标记并登记。
