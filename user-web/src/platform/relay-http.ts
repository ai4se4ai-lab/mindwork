/**
 * Relay HTTP client — the browser equivalent of what `buzz-cli`'s `client.rs`
 * does natively.
 *
 * Everything goes through the relay's generic Nostr bridge (`POST /events`,
 * `POST /query`, `POST /count`) rather than feature-specific JSON endpoints,
 * which is the pattern `AGENTS.md` prescribes.
 */
import type {
  NostrFilter,
  NostrSigner,
  PublishResult,
  RelayHttp,
  SignedNostrEvent,
} from "@web/platform/adapter";

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/** `https://relay.example` -> `wss://relay.example`. */
export function httpToWs(url: string): string {
  return url.replace(/^http/, "ws");
}

export class RelayHttpClient implements RelayHttp {
  readonly baseUrl: string;
  readonly wsUrl: string;

  constructor(
    baseUrl: string,
    private readonly signer: NostrSigner,
  ) {
    this.baseUrl = stripTrailingSlash(baseUrl);
    this.wsUrl = httpToWs(this.baseUrl);
  }

  async query<T = unknown>(filters: NostrFilter[]): Promise<T[]> {
    // Relay queries must specify `kinds` — an open-ended filter trips the
    // p-gate and returns 403. Fail here with a clear message instead.
    for (const filter of filters) {
      if (!filter.kinds || filter.kinds.length === 0) {
        throw new Error(
          "Relay queries must specify `kinds`; an open filter is rejected (403).",
        );
      }
    }
    const response = await this.fetchAuthed("/query", {
      method: "POST",
      body: JSON.stringify(filters),
    });
    if (!response.ok) {
      throw new Error(`POST /query failed: ${response.status}`);
    }
    return (await response.json()) as T[];
  }

  async count(filters: NostrFilter[]): Promise<number> {
    const response = await this.fetchAuthed("/count", {
      method: "POST",
      body: JSON.stringify(filters),
    });
    if (!response.ok) {
      throw new Error(`POST /count failed: ${response.status}`);
    }
    const body = (await response.json()) as { count?: number };
    return body.count ?? 0;
  }

  async publish(event: SignedNostrEvent): Promise<PublishResult> {
    const response = await this.fetchAuthed("/events", {
      method: "POST",
      body: JSON.stringify(event),
    });
    const body = (await response.json()) as Partial<PublishResult>;
    return {
      event_id: body.event_id ?? event.id,
      accepted: body.accepted ?? response.ok,
      message: body.message ?? response.statusText,
    };
  }

  async fetchAuthed(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? init.body : undefined;
    const authorization = await this.signer.httpAuthHeader(url, method, body);

    return fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        Authorization: authorization,
      },
    });
  }

  fetchPublic(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, init);
  }
}
