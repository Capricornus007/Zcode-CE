# 167 · X8 额度已满看不到重置机会入口(干净移植 + 恢复接线)

> 状态：**已实现(6 项测试通过,工作树待提交)**。矩阵 X8 主责为我;上游修复已精确定位。

## 0. 读了什么 / 结论一致性

| 材料                                            | 结论                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PORT-MATRIX X8 行                               | 「65 vs 63」为无口径计数,**推翻**:实际判据是上游在 3.15.1 **删除了 quotaFull 门控并简化本地对账**。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 上游 `buildCodingPlanQuotaResetDialogConfig.ts` | 修复:去掉 `quotaFull` 参数与「额度满 100% 则隐藏整行」门控(上游注释:核销会把剩余改写成 100%,同类型仍有余下机会时 entry 回到 available,门控把余下的卡一起藏掉 ⇒ 用户以为机会丢失)。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 上游 `CodingPlanQuotaResetDialog.tsx`           | 修复:删除本地对账状态机(`ResetRowCount`/`rowCounts`,双数据源 bug:核销后余下行拿到空到期,渲染「0 分 0 秒后过期」),改为只读 config + `resetItemsRef` 延迟读最新配置 + `isResetItemUsable`;`expiresAt === null` 时用不换行空格占位保行高。                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| CE 现状(关键)                                   | CE 两文件与 fork 基线 `872ad960` **逐字节一致**(ResetDialog 已实测 SAME;基线 quotaFull 计数=5,CE=5,上游=0)⇒ **CE 无自研改动,X8 是干净移植**。CE 组件组 `components/coding-plan-quota-reset/`(5 文件)存在,接线核对(修正我首轮 grep 误判):CE 3 个消费方均存在且都带 X8 bug 门控(`fiveHourQuotaFull`/`weeklyQuotaFull` 由 `isCodingPlanQuotaLimitFull` 计算,用于隐藏机会徽标与重置行)——CodingPlanContextUsage.tsx:308 与 StatusCards.tsx:837 有 `buildCodingPlanQuotaResetDialogConfig` 调用;**CodingPlanUsagePanel.tsx 只有 state+hook+门控(321 行起),缺 `buildCodingPlanQuotaResetDialogConfig` 调用**(上游 423 行有)。**X8 移植面 = 采纳上游修复版 2 文件 + 3 个消费方去门控 + 补齐 UsagePanel 的 dialog 接线**。 |

## 1. 产品规则

1. **机会是用户资产**:`opportunityVisible`(有未过期可用张数)即展示,满额时是否核销由用户判断(上游口径)。
2. **单一数据源**:张数/到期/能否展示只读 config,不在 UI 另记对账副本。
3. **核销后余下机会留在原位恢复可点击**(不整行消失、不需重开弹框)。
4. **完成态如实携带余下机会**:服务端 completed status 携带剩余张数/到期。

## 2. 状态所有者

| 状态                | 唯一所有者                         | 读取方              |
| ------------------- | ---------------------------------- | ------------------- |
| 机会余额(张数/到期) | 服务端 status(经 hooks)            | Dialog config       |
| 核销进行态          | hooks(`useCodingPlanQuotaResetUi`) | Dialog 按钮 loading |
| 动画态(成功/收起)   | Dialog 局部                        | 行去留              |

## 3. 接口

- `buildCodingPlanQuotaResetDialogConfig(params)`:删除 `fiveHourQuotaFull`/`weekQuotaFull` 参数(调用方同步改)。
- Dialog props 不变;`createResetItem` 的可见性条件改为 `!opportunityVisible` 单门控。

## 4. 验收

- 额度满时入口仍可见(反 X8 回归测试:quotaFull 场景下 dialog 入口不隐藏)。
- 多张机会核销一张后:行保留、张数 -1、到期来自最新 config、无「0 分 0 秒后过期」。
- 单元测试覆盖:`isResetItemUsable`、`expiresAt===null` 占位、多张计数。

## 5. 搬运清单

`components/coding-plan-quota-reset/{CodingPlanQuotaResetDialog,buildCodingPlanQuotaResetDialogConfig}.`(采用上游 3.15.1 版;另 3 文件 CE 与上游一致,不动)+ 3 个调用方接线补齐(Apache-2.0)。
