import { afterEach, describe, expect, it, vi } from "vitest";
import { AddressInfo } from "node:net";
import {
  ServiceCollection,
  IBotsService,
  type IBotsService as BotsService,
} from "@zcode/services";
import { createHttpServer } from "../src/http.js";
import { DEFAULT_BOT_COMMANDS } from "@zcode/shared";
import { ICredentialService } from "@zcode/services";

describe("bots HTTP callback", () => {
  const servers: Array<{ close(callback?: (err?: Error) => void): void }> = [];

  // Windows 上 listen 绑定是异步的：address() 在 listening 事件前返回 null
  // （Linux 绑定同步完成，官方 CI 观察不到）。统一等待 listening 再取端口。
  const waitForListening = (server: {
    address(): unknown;
    once(event: string, listener: () => void): unknown;
  }) =>
    server.address() === null
      ? new Promise<void>((resolve) => server.once("listening", resolve))
      : Promise.resolve();

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error?: Error) => {
              if (error) {
                reject(error);
                return;
              }
              resolve();
            });
          }),
      ),
    );
    servers.length = 0;
  });

  // ---- 官方 3.15.1 用例适配：回调路由已由 /api/bots/:provider 重设计为 /bot/** 门控入站
  // （BOT-INGRESS-SPEC 方案 D1·task-97）。端点、凭据（x-zcode-bot-secret + 逐 bot
  // webhookSecretRef）、payload 形状（+rawBody/webhookSecret）随 CE 门语义；四条官方断言
  // （转发 / 不支持 provider / 业务失败可重试 / 非 webhook 拒绝）逐条映射到新端点。----

  const SECRET = "bots-http-test-secret";
  const botFixture = (id = "webhook-1") => ({
    id,
    name: id,
    provider: "webhook",
    enabled: true,
    providerUserId: "user-1",
    allowedWorkspaces: ["*"],
    allowedCommands: { ...DEFAULT_BOT_COMMANDS },
    currentOptions: {},
    replyMode: "assistant_changes",
    webhookSecretRef: "bot:" + id + ":webhook-secret",
  });

  async function gatedServer(
    services: ServiceCollection,
  ): Promise<{ server: ReturnType<typeof createHttpServer>; port: number }> {
    const server = createHttpServer(services, 0, { botIngress: { enabled: true } });
    servers.push(server);
    await waitForListening(server);
    const address = server.address() as AddressInfo;
    return { server, port: address.port };
  }

  it("forwards provider payload and webhook secret to the bots service", async () => {
    const handleProviderCallbackResponse = vi.fn(async () => ({
      ok: true,
      replies: [
        {
          botId: "webhook-1",
          provider: "webhook",
          providerUserId: "user-1",
          text: "ok",
        },
      ],
    }));
    const credentialLoad = vi.fn(async (ref: string) =>
      ref === "bot:webhook-1:webhook-secret" ? SECRET : null,
    );
    const services = new ServiceCollection()
      .register(IBotsService, {
        listBots: async () => [botFixture()],
        handleProviderCallbackResponse,
      } as unknown as BotsService)
      .register(ICredentialService, { load: credentialLoad } as never);
    const { port } = await gatedServer(services);

    const rawBody = JSON.stringify({
      botId: "webhook-1",
      userId: "user-1",
      text: "/status",
    });
    const response = await fetch(`http://127.0.0.1:${port}/bot/webhook/webhook-1`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-zcode-bot-secret": SECRET },
      body: rawBody,
    });

    await expect(response.json()).resolves.toEqual({
      ok: true,
      replies: [
        {
          botId: "webhook-1",
          provider: "webhook",
          providerUserId: "user-1",
          text: "ok",
        },
      ],
    });
    expect(handleProviderCallbackResponse).toHaveBeenCalledWith(
      "webhook",
      expect.objectContaining({
        botId: "webhook-1",
        userId: "user-1",
        text: "/status",
        rawBody,
        webhookSecret: SECRET,
      }),
    );
    // 凭据按 ref 读取（逐 bot 存储于 credentialService）。
    expect(credentialLoad).toHaveBeenCalledWith("bot:webhook-1:webhook-secret");
  });

  it("rejects unsupported bot providers", async () => {
    // CE 门语义：listBots 里没有该 bot ⇒ 未注册 provider 拒绝（fail-closed）。
    const services = new ServiceCollection()
      .register(IBotsService, {
        listBots: async () => [],
        handleProviderCallbackResponse: vi.fn(),
      } as unknown as BotsService)
      .register(ICredentialService, { load: async () => SECRET } as never);
    const { port } = await gatedServer(services);

    const response = await fetch(`http://127.0.0.1:${port}/bot/unknown/unknown-1`, {
      method: "POST",
      headers: { "x-zcode-bot-secret": SECRET },
      body: "{}",
    });

    // provider 判定先于凭据：400 调用方错误，不回显支持列表。
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported provider: unknown",
    });
  });

  it("returns a retryable HTTP status when bot business handling fails", async () => {
    const services = new ServiceCollection()
      .register(IBotsService, {
        listBots: async () => [botFixture()],
        handleProviderCallbackResponse: vi.fn(async () => ({
          ok: false,
          replies: [],
          status: 503,
        })),
      } as unknown as BotsService)
      .register(ICredentialService, { load: async () => SECRET } as never);
    const { port } = await gatedServer(services);

    const response = await fetch(`http://127.0.0.1:${port}/bot/webhook/webhook-1`, {
      method: "POST",
      headers: { "x-zcode-bot-secret": SECRET },
      body: "{}",
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
  });

  it("rejects non-webhook providers on the HTTP callback endpoint", async () => {
    // CE 门只服务 webhook HTTP 回调；feishu 走各自长连接/网关，不经本端点。
    const services = new ServiceCollection()
      .register(IBotsService, {
        listBots: async () => [
          { ...botFixture("feishu-1"), provider: "feishu", webhookSecretRef: undefined },
        ],
        handleProviderCallbackResponse: vi.fn(),
      } as unknown as BotsService)
      .register(ICredentialService, { load: async () => SECRET } as never);
    const { port } = await gatedServer(services);

    const response = await fetch(`http://127.0.0.1:${port}/bot/feishu/feishu-1`, {
      method: "POST",
      body: "{}",
    });

    // provider 判定先于凭据：feishu 非 webhook ⇒ 400（不回显支持列表）。
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported provider: feishu",
    });
  });
});
