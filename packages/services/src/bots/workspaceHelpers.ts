import { ALL_BOT_WORKSPACES, type BotConfig, type BotWorkspaceRef } from "@zcode/shared";

export function getWorkspaceKey(workspacePath: string, workspaceIdentity?: string): string {
  return workspaceIdentity?.trim() || workspacePath;
}

export function getWorkspaceLabel(workspacePath: string): string {
  return workspacePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? workspacePath;
}

export function createWorkspaceRef(
  workspacePath: string,
  workspaceIdentity?: string,
): BotWorkspaceRef {
  const id = getWorkspaceKey(workspacePath, workspaceIdentity);
  return {
    id,
    label: getWorkspaceLabel(workspacePath),
    workspacePath,
    workspaceIdentity,
  };
}

function isAllWorkspacesAllowed(allowedWorkspaces: readonly string[]): boolean {
  return allowedWorkspaces.length === 0 || allowedWorkspaces.includes(ALL_BOT_WORKSPACES);
}

export function normalizeAllowedWorkspaces(allowedWorkspaces: readonly string[]): string[] {
  const workspaceIds = allowedWorkspaces.map((item) => item.trim()).filter(Boolean);
  if (isAllWorkspacesAllowed(workspaceIds)) {
    return [ALL_BOT_WORKSPACES];
  }
  return [...new Set(workspaceIds)];
}

export function isWorkspaceAllowed(
  workspaceId: string,
  allowedWorkspaces: readonly string[],
): boolean {
  return isAllWorkspacesAllowed(allowedWorkspaces) || allowedWorkspaces.includes(workspaceId);
}

export function filterAllowedWorkspaces(
  workspaces: BotWorkspaceRef[],
  allowedWorkspaces: readonly string[],
): BotWorkspaceRef[] {
  return isAllWorkspacesAllowed(allowedWorkspaces)
    ? workspaces
    : workspaces.filter((workspace) => allowedWorkspaces.includes(workspace.id));
}

function resolveCanonicalWorkspaceId(
  value: string | undefined,
  workspaces: readonly BotWorkspaceRef[],
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  // CE 修復（spec 131）保留：exact 命中殼 entry（無 workspaceIdentity）而同路徑存在唯一
  // 帶 identity 的實體時，升級到實體，避免把請求落在殼上；其余走上游 3.16 的擴展匹配
  // （identity 直等 / 無 identity 時 rootPaths 包含 / workspacePath 等值）。
  const exact = workspaces.find((workspace) => workspace.id === trimmed);
  if (exact) {
    if (!exact.workspaceIdentity) {
      const identityCandidates = workspaces.filter(
        (workspace) => workspace.workspacePath === trimmed && workspace.workspaceIdentity,
      );
      if (identityCandidates.length === 1) {
        return identityCandidates[0]!.id;
      }
    }
    return exact.id;
  }
  const candidates = workspaces.filter(
    (workspace) =>
      workspace.workspaceIdentity === trimmed ||
      (!workspace.workspaceIdentity && workspace.rootPaths?.includes(trimmed)) ||
      workspace.workspacePath === trimmed,
  );
  return candidates.length === 1 ? candidates[0]!.id : trimmed;
}

export function normalizeConfiguredAllowedWorkspaces(
  allowedWorkspaces: readonly string[],
  workspaces: readonly BotWorkspaceRef[],
): string[] {
  const normalized = normalizeAllowedWorkspaces(allowedWorkspaces);
  if (isAllWorkspacesAllowed(normalized)) {
    return [ALL_BOT_WORKSPACES];
  }
  return [
    ...new Set(
      normalized.map(
        (workspaceId) => resolveCanonicalWorkspaceId(workspaceId, workspaces) ?? workspaceId,
      ),
    ),
  ];
}

export function firstAllowedWorkspace(
  workspaceRefs: BotWorkspaceRef[],
  bot: BotConfig,
): BotWorkspaceRef | null {
  const allowedWorkspaces = filterAllowedWorkspaces(workspaceRefs, bot.allowedWorkspaces);
  return allowedWorkspaces[0] ?? null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveWorkspaceByValue(
  workspaceRefs: BotWorkspaceRef[],
  value: string,
  allowedIds: string[],
): BotWorkspaceRef | null {
  const trimmed = value.trim();
  const index = Number.parseInt(trimmed, 10);
  const workspaces = filterAllowedWorkspaces(workspaceRefs, allowedIds);
  if (Number.isFinite(index) && index > 0) {
    return workspaces[index - 1] ?? null;
  }
  const normalized = normalizeText(trimmed);
  const exact = workspaces.find((workspace) => workspace.id === trimmed);
  if (exact) return exact;
  const matches = workspaces.filter(
    (workspace) =>
      normalizeText(workspace.label) === normalized ||
      workspace.workspacePath === trimmed ||
      getWorkspaceKey(workspace.workspacePath, workspace.workspaceIdentity) === trimmed,
  );
  return matches.length === 1 ? matches[0]! : null;
}
