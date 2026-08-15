/**
 * Browser implementation of the four `plugin:websocket|*` commands.
 *
 * `relayClientSession.ts` never touches a WebSocket directly — it asks the
 * Tauri websocket plugin to open one and streams frames back through a
 * `Channel`. Reimplementing that contract here means the entire relay client
 * (auth, subscription replay, reconnect/backoff, stall watchdog, rate-limit
 * gating — ~2,000 lines) runs unchanged in the browser.
 *
 * Frame shapes must match what the plugin emits, because the client
 * discriminates on them (`getTextPayload`, `isWebSocketClose`,
 * `isServiceRestartClose`, `isWebSocketError`):
 *   text  -> { type: "Text",  data: string }
 *   close -> { type: "Close", data: { code, reason } }
 *   error -> { type: "Error", data: string }
 */
import type { AdapterChannel, InvokeArgs } from "@web/platform/adapter";

interface Connection {
  socket: WebSocket;
  channel: AdapterChannel<unknown>;
}

const connections = new Map<number, Connection>();
let nextConnectionId = 1;

function isChannel(value: unknown): value is AdapterChannel<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "send" in value &&
    typeof (value as AdapterChannel).send === "function"
  );
}

export async function wsConnect(args: InvokeArgs): Promise<number> {
  const url = args.url;
  const onMessage = args.onMessage;
  if (typeof url !== "string") {
    throw new Error("plugin:websocket|connect requires a string url");
  }
  if (!isChannel(onMessage)) {
    throw new Error("plugin:websocket|connect requires an onMessage Channel");
  }

  const socket = new WebSocket(url);
  const id = nextConnectionId++;

  return new Promise<number>((resolve, reject) => {
    let settled = false;

    socket.onopen = () => {
      settled = true;
      connections.set(id, { socket, channel: onMessage });
      resolve(id);
    };

    socket.onmessage = (event) => {
      // Relay frames are always text; ignore binary rather than mis-parsing it.
      if (typeof event.data === "string") {
        onMessage.send({ type: "Text", data: event.data });
      }
    };

    socket.onerror = () => {
      // The browser withholds error detail for cross-origin sockets; a close
      // frame always follows, which is what drives the client's reconnect.
      if (!settled) {
        settled = true;
        reject(new Error(`WebSocket connection to ${url} failed.`));
        return;
      }
      onMessage.send({ type: "Error", data: "websocket error" });
    };

    socket.onclose = (event) => {
      connections.delete(id);
      if (!settled) {
        settled = true;
        reject(new Error(`WebSocket to ${url} closed before opening.`));
        return;
      }
      onMessage.send({
        type: "Close",
        data: { code: event.code, reason: event.reason },
      });
    };
  });
}

export async function wsSend(args: InvokeArgs): Promise<void> {
  const id = args.id;
  const message = args.message as { type?: string; data?: unknown } | undefined;
  if (typeof id !== "number") {
    throw new Error("plugin:websocket|send requires a numeric id");
  }
  const connection = connections.get(id);
  if (!connection) {
    throw new Error(`WebSocket ${id} is not connected.`);
  }
  if (message?.type !== "Text" || typeof message.data !== "string") {
    throw new Error("plugin:websocket|send only supports Text frames");
  }
  connection.socket.send(message.data);
}

export async function wsDisconnect(args: InvokeArgs): Promise<void> {
  const id = args.id;
  if (typeof id !== "number") return;
  const connection = connections.get(id);
  if (!connection) return;
  connections.delete(id);
  // 1000 = normal closure, so the client does not treat it as a service restart.
  connection.socket.close(1000, "client disconnect");
}

export async function wsDisconnectAll(): Promise<void> {
  for (const [id, connection] of connections) {
    connections.delete(id);
    connection.socket.close(1000, "client disconnect");
  }
}

export const WEBSOCKET_HANDLERS = {
  "plugin:websocket|connect": wsConnect,
  "plugin:websocket|send": wsSend,
  "plugin:websocket|disconnect": wsDisconnect,
  "plugin:websocket|disconnect_all": wsDisconnectAll,
} as const;
