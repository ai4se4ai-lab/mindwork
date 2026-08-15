/**
 * Browser signers.
 *
 * Desktop keeps the secret key in the Rust keystore and signs across the IPC
 * boundary. The browser has two options, in preference order:
 *
 *   1. NIP-07 extension — the key never enters the page. Preferred.
 *   2. In-browser key — unlocked into page memory. Weaker; gate behind an
 *      explicit warning and never make it the silent default.
 */
import type {
  NostrSigner,
  SignedNostrEvent,
  UnsignedNostrEvent,
} from "@web/platform/adapter";

interface Nip07Provider {
  getPublicKey(): Promise<string>;
  signEvent(event: UnsignedNostrEvent): Promise<SignedNostrEvent>;
  nip44?: {
    encrypt(pubkey: string, plaintext: string): Promise<string>;
    decrypt(pubkey: string, ciphertext: string): Promise<string>;
  };
}

declare global {
  interface Window {
    nostr?: Nip07Provider;
  }
}

export class Nip07Unavailable extends Error {
  constructor() {
    super("A NIP-07 browser extension (Alby, nos2x) is required to sign in.");
    this.name = "Nip07Unavailable";
  }
}

export function hasNip07(): boolean {
  return typeof window !== "undefined" && window.nostr != null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** NIP-07-backed signer. */
export class Nip07Signer implements NostrSigner {
  readonly kind = "nip07" as const;

  private provider(): Nip07Provider {
    const provider = typeof window === "undefined" ? undefined : window.nostr;
    if (!provider) throw new Nip07Unavailable();
    return provider;
  }

  getPublicKey(): Promise<string> {
    return this.provider().getPublicKey();
  }

  async sign(template: UnsignedNostrEvent): Promise<SignedNostrEvent> {
    const signed = await this.provider().signEvent(template);
    // A malicious or buggy extension could return a different event than the
    // one presented; reject rather than publish something unintended.
    if (
      signed.kind !== template.kind ||
      signed.content !== template.content ||
      signed.created_at !== template.created_at ||
      JSON.stringify(signed.tags) !== JSON.stringify(template.tags)
    ) {
      throw new Error("The extension returned a different event than signed.");
    }
    return signed;
  }

  /** NIP-42 relay auth (kind 22242). */
  signAuth(challenge: string, relayUrl: string): Promise<SignedNostrEvent> {
    return this.sign({
      kind: 22242,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["relay", relayUrl],
        ["challenge", challenge],
      ],
      content: "",
    });
  }

  /** NIP-98 HTTP auth (kind 27235). */
  async httpAuthHeader(
    url: string,
    method: string,
    body?: string,
  ): Promise<string> {
    const tags = [
      ["u", url],
      ["method", method.toUpperCase()],
    ];
    if (body !== undefined) {
      tags.push(["payload", await sha256Hex(body)]);
    }
    const event = await this.sign({
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: "",
    });
    return `Nostr ${btoa(JSON.stringify(event))}`;
  }

  async encryptToSelf(plaintext: string): Promise<string> {
    const provider = this.provider();
    if (!provider.nip44) {
      throw new Error("This extension does not support NIP-44 encryption.");
    }
    return provider.nip44.encrypt(await this.getPublicKey(), plaintext);
  }

  async decryptFromSelf(ciphertext: string): Promise<string> {
    const provider = this.provider();
    if (!provider.nip44) {
      throw new Error("This extension does not support NIP-44 decryption.");
    }
    return provider.nip44.decrypt(await this.getPublicKey(), ciphertext);
  }
}
