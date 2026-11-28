// A minimal JSON-RPC 2.0 connection over an MCP transport, plus a scripted fake server for tests.
// You do not need to change this file.
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "RpcError";
  }
}

type Pending = { resolve: (value: unknown) => void; reject: (error: Error) => void };

export class RpcConnection {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  closed = false;

  constructor(private readonly transport: Transport) {
    transport.onmessage = (message) => this.receive(message as Record<string, unknown>);
    transport.onclose = () => {
      this.closed = true;
      for (const { reject } of this.pending.values()) reject(new Error("connection closed"));
      this.pending.clear();
    };
  }

  start(): Promise<void> {
    return this.transport.start();
  }

  request<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (this.closed) return Promise.reject(new Error("connection closed"));
    const id = this.nextId++;
    const result = new Promise<T>((resolve, reject) => this.pending.set(id, { resolve: resolve as (value: unknown) => void, reject }));
    const message = { jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as JSONRPCMessage;
    this.transport.send(message).catch((error: Error) => this.pending.get(id)?.reject(error));
    return result;
  }

  notify(method: string, params?: Record<string, unknown>): Promise<void> {
    return this.transport.send({ jsonrpc: "2.0", method, ...(params ? { params } : {}) } as JSONRPCMessage);
  }

  close(): Promise<void> {
    return this.transport.close();
  }

  private receive(message: Record<string, unknown>): void {
    const id = message.id;
    if (typeof id !== "number" || !this.pending.has(id) || "method" in message) return; // server requests/notifications are ignored here
    const { resolve, reject } = this.pending.get(id)!;
    this.pending.delete(id);
    const error = message.error as { code: number; message: string; data?: unknown } | undefined;
    if (error) reject(new RpcError(error.message, error.code, error.data));
    else resolve(message.result);
  }
}

export type ScriptedReply = Record<string, unknown> | { error: { code: number; message: string } };

/** A fake MCP server: `handle(method, params)` returns a result, or `{ error }` for a JSON-RPC error. */
export function scriptedServer(
  transport: Transport,
  handle: (method: string, params: Record<string, unknown> | undefined) => ScriptedReply,
): { received: { method: string; params?: Record<string, unknown> }[]; closed: () => boolean } {
  const received: { method: string; params?: Record<string, unknown> }[] = [];
  let closed = false;
  transport.onclose = () => void (closed = true);
  transport.onmessage = (raw) => {
    const message = raw as { id?: number; method?: string; params?: Record<string, unknown> };
    if (!message.method) return;
    received.push({ method: message.method, ...(message.params ? { params: message.params } : {}) });
    if (message.id === undefined) return;
    const reply = handle(message.method, message.params);
    const body = "error" in reply ? { error: reply.error } : { result: reply };
    void transport.send({ jsonrpc: "2.0", id: message.id, ...body } as JSONRPCMessage);
  };
  void transport.start();
  return { received, closed: () => closed };
}
