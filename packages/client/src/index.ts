export { RemoteServiceAccess } from "./remoteServiceAccess.js";
export { connectViaProtocol, connectViaWebSocket } from "./websocket.js";
export type { WebSocketConnectionCloseEvent } from "./websocket.js";
export { connectViaMessagePort, createMessagePortServiceConnection } from "./messageport.js";
export type { MessagePortServiceConnection } from "./messageport.js";
// 遥测/云端 relay 清理（CE 政策）：WebRemoteControl 的 acknowledged relay 协议族
// （webRemoteControlRelayProtocol / AcknowledgedRelay* / RelayPayloadSerializer）
// 是官方云 relay 的传输面，CE 不提供中继，故整族不导出。
