export type RequestVerificationConfig = Readonly<Record<string, unknown>>;
export type RequestVerificationProof = Record<never, never>;
export type RequestVerificationClientConfig = Record<never, never>;
export const requestVerificationReasons = ["model-request"] as const;
export type RequestVerificationReason = (typeof requestVerificationReasons)[number];
export const requestVerificationTimeoutMessage =
  "Provider runtime headers request timed out. Please send your message again.";
export const REQUEST_VERIFICATION_REQUIRED = "request_verification_unavailable";
export function readRequestVerificationConfig(
  _configs: RequestVerificationClientConfig | null | undefined,
): RequestVerificationConfig | null {
  return null;
}
export function requestVerificationClaimHeaders(
  _proof: RequestVerificationProof,
): Record<string, string> {
  return {};
}
export function withoutRequestVerificationHeaders(
  headers: Record<string, string> | undefined,
): Record<string, string> {
  return { ...headers };
}
export function allowRequestVerificationHeaders(
  _headers: Record<string, string>,
): Record<string, string> {
  return {};
}
/**
 * CE 版（spec 130，docs/development/130-start-plan-captcha-spec.md）：start-plan 的
 * 验证码挑战需要渲染层交互（host 不得短路自答），其余账号形态零交互。
 * 官方开源版为恒 false（不启用该链路）；两版测试按此判据分支。
 */
export function requiresRequestVerification(access: { mode: string } | undefined): boolean {
  return access?.mode === "start-plan";
}
export function isRequestVerificationMessage(_message: string): boolean {
  return false;
}
export function summarizeRequestVerificationHeaders(
  _headers: Record<string, string>,
): Record<string, unknown> {
  return {};
}
export function requestVerificationDiagnostics(
  _input: Record<string, unknown>,
): Record<string, unknown> {
  return {};
}

export const requestVerificationInteractionAvailable = false;
