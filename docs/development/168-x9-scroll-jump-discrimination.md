# 168 · X9 窗口大小变化时对话滚动跳动(先判别)

> 状态：**判别完成 + 已实现(hunk 精确提取,工作树待提交)**。

## 0. 读了什么 / 结论一致性

| 材料              | 结论                                                                                                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX X9 行 | 「1 vs 1」无指引意义。**实测推翻**:上游 `v4/timelineScrollAnchor.ts` 相对 CE 的 70 行 diff **全部是 export 可见性调整与 oxfmt 格式化(`const`→`export const`、换行),零逻辑变化**;`timelineRowHeightCache.ts` 8 行、`conversationTimelineLiveTail.ts` 2 行 diff 同样微小。⇒ **滚动跳动修复不在锚点纯函数模块**,不能照搬该文件解决问题。 |
| CE 现状           | CE 有 `v4/timelineScrollAnchor.ts`(跟随态状态机:following/用户滚动权/程序化贴底不改变意图),机制与上游同源。                                                                                                                                                                                                                           |

## 1. 判别实验设计(先判别,不实现)

1. **复现**:窗口 resize 时录制 `{scrollTop, clientHeight, scrollHeight, following}` 序列;找跳动的帧(contentHeight 变化后 scrollTop 未补偿 / 补偿方向错误)。
2. **候选拉动源**:(a) 虚拟列表测高补偿(`timelineRowHeightCache`)在 resize 时重新测高,若锚定项的 offset 变了而 scrollTop 未跟随;(b) `contentWidthChanging` 门控(`shouldAdjustScrollPosition` 里 width 变化时跳过调整,resize 恰是 width 变化);(c) CSS 布局重排导致行高集体变化。
3. **判据**:定位到具体拉动源后再决定实现;若 CE 无法复现(resize 步进下均稳定),记录「CE 不适用」并回传。

## 2. 交付口径

- 判别结论 + 录制数据;实现面可能是 `timelineRowHeightCache` 或 `ConversationTimeline.tsx` 的 resize 处理(非锚点模块本身)。

## 3. 判别结论(已提交,2026-10-13)

**拉动源已定位**：视口 resize 时虚拟列表测高的**异步提交与吸底跨帧追赶**。上游 3.15.1 修复落在
`ConversationTimeline.tsx`(调用方)的 ResizeObserver 批量测高提交策略,证据为
`git diff 29628c9a aac47556 -- packages/ui/src/v4/ConversationTimeline.tsx` 的 hunk:

1. RO 同时观察视口(`observer.observe(scrollRef.current)`)与内容列;
2. 视口高度变化时先 `reconcileFollowingForContentAnchor` 结算 following;
3. 在底部时暂停 messageLayer 蒙层 RO,同一批次内同步测高(`measureElement`)+ `flushSync` 提交 + 吸底
   ——旧实现先按旧占位高度吸底、下一帧测高提交后再跳一次,即为「跳动」直接成因;
4. `contentWidthResizeSettleTimer` 对宽度变化去抖;`virtualizer.resizeItem` 批量提交。

CE 现状:`ConversationTimeline.tsx`(1963 行)与基线逐字节一致;已有
`contentWidthResizeSettleTimerRef`/`reconcileFollowingForContentAnchor`/`commitFollowing`/
`markLayoutScrollGuard`/`measureElement`,缺 X9 新增的 `committingMeasuredLayoutRef`、
`messageLayerMaskObserverRef`、`observeContentFrame`。上游 +159 行里**混合了遥测等其他功能的
增量,不能整文件覆盖**,实现时须只提取上述 4 组 hunk。

判别推翻了「修复在锚点模块」的初始假设(该模块 diff 为纯格式化),也证实矩阵「1 vs 1」无指引意义。
