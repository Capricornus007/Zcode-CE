import { ChannelClient, ChannelServer, createQueuePair } from "@zcode/rpc";
import { ISettingService, ITerminalService, ServiceCollection } from "@zcode/services";
import { describe, expect, it, vi } from "vitest";
import { ServiceChannels } from "@zcode/shared";
import {
  createWindowHostTerminalOwners,
  exposeWindowHostAttachmentServices,
  resolveWindowHostServiceExposurePolicy,
} from "../src/host/windowHostAttachmentRpcPolicy.js";

describe("Window Host attachment RPC policy", () => {
  it("allows only the reviewed channel contract for mobile attachments", () => {
    const policy = resolveWindowHostServiceExposurePolicy("web-remote-replayable");

    expect(policy?.allowedChannels.has(ServiceChannels.Setting)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.ZCodeTask)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.Terminal)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.SourceServerManagement)).toBe(false);
    expect(policy?.allowedChannels.has(ServiceChannels.ProviderProvisioningTarget)).toBe(false);
    expect(policy?.allowedChannels.has(ServiceChannels.ProviderSettings)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.ModelSelection)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.MediaPreview)).toBe(true);
    // 手机重建远程 Root 后会读引导记录；漏放行时调用超时，UI 回退 settings 判定而误弹引导。
    expect(policy?.allowedChannels.has(ServiceChannels.OnboardingRecord)).toBe(true);
    expect(policy?.allowedChannels.has("future-unreviewed-channel")).toBe(false);
    expect(policy?.allowedChannels.has(ServiceChannels.Project)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.TaskGroups)).toBe(true);
    expect(policy?.allowedChannels.has(ServiceChannels.RemoteProjects)).toBe(true);
    expect(policy?.allowedChannels.has("repo-wiki")).toBe(false);
    const registeredChannels = new Set<string>(Object.values(ServiceChannels));
    expect([...policy!.allowedChannels].every((channel) => registeredChannels.has(channel))).toBe(
      true,
    );
    expect(policy?.allowedChannels.size).toBe(47);
  });

  it("keeps the complete service surface for desktop attachments", () => {
    expect(resolveWindowHostServiceExposurePolicy("desktop-continuous")).toBeUndefined();
  });

  it("allows scoped Terminal RPC for mobile attachments", async () => {
    const terminalCreate = vi.fn(async () => ({ id: "terminal-1" }));
    const services = new ServiceCollection()
      .register(ISettingService, { get: async () => ({ locale: "zh-CN" }) } as never)
      .register(ITerminalService, { create: terminalCreate } as never);
    const [serverProtocol, clientProtocol] = createQueuePair();
    const server = new ChannelServer(serverProtocol, "host", 20);
    const client = new ChannelClient(clientProtocol);

    try {
      exposeWindowHostAttachmentServices({
        server,
        services,
        clientMode: "web-remote-replayable",
      });

      await expect(client.getChannel(ISettingService.channelName).call("get", [])).resolves.toEqual(
        {
          locale: "zh-CN",
        },
      );
      await expect(
        client
          .getChannel(ITerminalService.channelName)
          .call("create", [{ cols: 80, rows: 24, cwd: "/repo" }]),
      ).resolves.toEqual({ id: "terminal-1" });
      expect(terminalCreate).toHaveBeenCalledOnce();
    } finally {
      client.dispose();
      server.dispose();
    }
  });

  it("keeps Terminal RPC available to desktop attachments", async () => {
    const terminalCreate = vi.fn(async () => ({ id: "terminal-1" }));
    const services = new ServiceCollection().register(ITerminalService, {
      create: terminalCreate,
    } as never);
    const [serverProtocol, clientProtocol] = createQueuePair();
    const server = new ChannelServer(serverProtocol, "host", 20);
    const client = new ChannelClient(clientProtocol);

    try {
      exposeWindowHostAttachmentServices({
        server,
        services,
        clientMode: "desktop-continuous",
      });

      await expect(
        client
          .getChannel(ITerminalService.channelName)
          .call("create", [{ cols: 80, rows: 24, cwd: "/repo" }]),
      ).resolves.toEqual({ id: "terminal-1" });
      expect(terminalCreate).toHaveBeenCalledOnce();
    } finally {
      client.dispose();
      server.dispose();
    }
  });

  it("owner 换代先失效旧 scope 并回收已有和迟到 PTY", async () => {
    const exitListeners = new Map<string, (code: number) => void>();
    const pending = Promise.withResolvers<{ id: string }>();
    const base = {
      create: vi
        .fn()
        .mockResolvedValueOnce({ id: "terminal-1" })
        .mockImplementationOnce(() => pending.promise),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
      onDynamicData: vi.fn(() => () => ({ dispose: vi.fn() })),
      onDynamicExit: vi.fn((id: string) => (listener: (code: number) => void) => {
        exitListeners.set(id, listener);
        return { dispose: () => exitListeners.delete(id) };
      }),
    } as unknown as ITerminalService;
    const cleanupError = vi.fn();
    const owners = createWindowHostTerminalOwners(cleanupError);
    owners.setOwner("owner-1");
    const first = owners.bind("owner-1", "local", base);
    await first.create({ cols: 80, rows: 24, cwd: "/repo" });
    const late = first.create({ cols: 80, rows: 24, cwd: "/repo" });

    owners.setOwner("owner-2");
    await expect(first.write({ id: "terminal-1", data: "late" })).rejects.toThrow(
      "Terminal owner has ended",
    );
    pending.resolve({ id: "terminal-late" });
    await expect(late).rejects.toThrow("Terminal owner has ended");
    await vi.waitFor(() => {
      expect(base.dispose).toHaveBeenCalledWith({ id: "terminal-1" });
      expect(base.dispose).toHaveBeenCalledWith({ id: "terminal-late" });
    });
    expect(cleanupError).not.toHaveBeenCalled();
    expect(() => owners.bind("owner-1", "local", base)).toThrow("Terminal owner has ended");
  });
});
