import type { Duplex } from "node:stream";
import type { RemoteTarget } from "@zcode/shared";
import type { IRemoteBackend } from "@zcode/server/remote/backend.js";
import type { RemoteExecResult } from "./sourceServerTransportRuntime.js";

export interface SourceServerProbeResult {
  platform: string;
  arch: string;
  installed: boolean;
  installPath?: string;
  installedVersion?: string;
  installedArchiveSha256?: string;
  /** 当前 release 由显式降级安装时，被替换的版本。 */
  downgradedFrom?: string;
  daemonStatus?: Record<string, unknown> & { state: string; port?: number };
}

export interface SourceServerProbeOptions {
  includeReleaseIdentity?: boolean;
}

export interface SourceServerIngressInfo {
  port: number;
  ingressToken: string;
  reusedProbeStatus?: boolean;
}

export interface ServerReleaseAsset {
  localArchivePath?: string;
  target: string;
  version: string;
  sha256: string;
  sizeBytes: number;
  urls: string[];
}

export interface TransportContext {
  signal?: AbortSignal;
  onLog?: (event: {
    phase: string;
    message: string;
    progress?: number;
    level?: "info" | "warn" | "error";
  }) => void;
}

export interface SourceServerInstallOrUpdateOptions {
  force?: boolean;
}

export interface SourceServerEnsureDaemonOptions {
  observedStatus?: SourceServerProbeResult["daemonStatus"];
  forceRestart?: boolean;
}

export type SourceServerFileTransfer = Pick<IRemoteBackend, "exec" | "upload">;

export interface SourceServerTransportAdapter {
  readonly kind: "ssh" | "wsl" | "docker";
  createFileTransfer(target: RemoteTarget): SourceServerFileTransfer;
  cancel?(target: RemoteTarget): void;
  probe(target: RemoteTarget, context: TransportContext, options?: SourceServerProbeOptions): Promise<SourceServerProbeResult>;
  installOrUpdate(target: RemoteTarget, release: ServerReleaseAsset, context: TransportContext, options?: SourceServerInstallOrUpdateOptions): Promise<void>;
  ensureDaemon(target: RemoteTarget, context: TransportContext, options?: SourceServerEnsureDaemonOptions): Promise<SourceServerIngressInfo>;
  openChannel(target: RemoteTarget, ingress: SourceServerIngressInfo, context: TransportContext): Promise<Duplex>;
  exec(target: RemoteTarget, argv: string[], context: TransportContext): Promise<RemoteExecResult>;
  dispose?(): void;
}

export interface CreateSourceServerTransportAdapterOptions {
  createBackend?: (target: RemoteTarget) => Promise<IRemoteBackend>;
}
