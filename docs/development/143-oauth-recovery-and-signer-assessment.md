# 143 — OAuth 损坏会话清理容错（A2）与签名器 disposed 守卫（A3）评估

## 背景（闭源 3.15.3 差异报告 §3）

上游闭源 3.15.3 修复了两处：

- A2 OAuth 损坏会话清理容错：host 组合根的 onCorruptOAuthSessionCleared 回调里派生 provider 刷新失败时，await Promise.all 整体抛错会阻断清理本身 → 设置页连接套餐失败、要求重新登录；3.15.3 改为 .catch 收敛到 oauth-credential-recovery 日志域。
- A3 请求签名器 scope 级 disposed 守卫：ClientRequestSigningV4Manager.createFetch 的 disposed 检查提为 scope 级，provider 配置变更/凭据刷新 dispose 后，已创建的 fetch 闭包入口即抛明确错误而非签名深处失败。

## A2：改（照上游形态，CE 有同构缺陷）

- 证据：packages/services/src/node.ts:1488 的回调与上游 3.15.1 形态同构（await Promise.all、无 catch）。
- CE 已有的等价容错：oauthCredentialRepo.ts 的 clearCorruptOAuthSession 把回调调用包在 try/catch 里（派生清理失败不阻断 OAuth 恢复），本次改动补**回调级**的两侧：失败收敛到独立日志域 oauth-credential-recovery（本仓此前 0 命中），与上游 3.15.3 形态一致；保持 repo 层 try/catch 不动（双层语义不同：repo 层保证清理不被阻断，回调层给出可定位的日志）。
- 不引入重试/退避：派生 provider 凭据随下次账号同步自然重建，重试只刷日志。

## A3：不改（无对等实现可守卫）

- 复现命令（供 Lead 复核）：
  - cd /home/sixiao/aicode/fix/ZCode-CE && pnpm -r exec grep -l "ClientRequestSigningV4Manager" src 2>/dev/null || true
  - 或 ripgrep 口径：rg -c "SigningV4|resolveSigner" packages/ apps/ → 0 命中
- CE 全仓（packages + apps）无 ClientRequestSigningV4Manager / resolveSigner（2026-10-13 实测 0 命中）。请求签名 V4 逻辑只存在于闭源 glm 网关（.reverse/104-v3151/unpack/*/extracted/opt/ZCode/resources/glm/zcode.cjs），CE 不随包分发该二进制，也没有自研 V4 签名器。无可守卫对象 ⇒ 不照搬闭源补丁。

## 验收

- node.ts 改动后 packages/services typecheck + 相关测试通过。
- 日志域 oauth-credential-recovery 在本仓出现且仅出现在这一处容错路径。
- 报告写明 A2 证据行号与 A3 零命中复现命令。
