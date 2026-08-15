/**
 * Relay-backed command handlers.
 *
 * These replace Rust commands that were themselves thin wrappers over relay
 * queries. Each one must return the *same shape* the desktop command returned —
 * `desktop/src/shared/api/types.ts` is the contract, not the Rust struct.
 *
 * This file starts with the connection- and identity-level commands that
 * everything else depends on; feature commands are added per milestone as
 * described in docs/FEATURE_PARITY.md.
 */
import type { CommandHandler } from "@web/platform/adapter";
import { httpToWs } from "@web/platform/relay-http";

const get_relay_http_url: CommandHandler<string> = (_args, ctx) =>
  ctx.relay.baseUrl;

const get_relay_ws_url: CommandHandler<string> = (_args, ctx) =>
  httpToWs(ctx.relay.baseUrl);

const get_default_relay_url: CommandHandler<string> = (_args, ctx) =>
  ctx.relay.baseUrl;

/** Desktop returns the signed event as a JSON string; match that exactly. */
const sign_event: CommandHandler<string> = async (args, ctx) => {
  const signed = await ctx.signer.sign({
    kind: Number(args.kind),
    content: String(args.content ?? ""),
    created_at: Number(args.createdAt ?? Math.floor(Date.now() / 1000)),
    tags: (args.tags as string[][]) ?? [],
  });
  return JSON.stringify(signed);
};

const create_auth_event: CommandHandler<string> = async (args, ctx) => {
  const signed = await ctx.signer.signAuth(
    String(args.challenge),
    String(args.relayUrl),
  );
  return JSON.stringify(signed);
};

const get_identity: CommandHandler<{ pubkey: string } | null> = async (
  _args,
  ctx,
) => {
  try {
    return { pubkey: await ctx.signer.getPublicKey() };
  } catch {
    return null;
  }
};

const nip44_encrypt_to_self: CommandHandler<string> = (args, ctx) =>
  ctx.signer.encryptToSelf(String(args.plaintext));

const nip44_decrypt_from_self: CommandHandler<string> = (args, ctx) =>
  ctx.signer.decryptFromSelf(String(args.ciphertext));

/** Browser sessions never gate on a shared-machine identity. */
const is_shared_identity: CommandHandler<boolean> = () => false;

export const RELAY_COMMAND_HANDLERS: Record<string, CommandHandler> = {
  get_relay_http_url: get_relay_http_url as CommandHandler,
  get_relay_ws_url: get_relay_ws_url as CommandHandler,
  get_default_relay_url: get_default_relay_url as CommandHandler,
  sign_event: sign_event as CommandHandler,
  create_auth_event: create_auth_event as CommandHandler,
  get_identity: get_identity as CommandHandler,
  nip44_encrypt_to_self: nip44_encrypt_to_self as CommandHandler,
  nip44_decrypt_from_self: nip44_decrypt_from_self as CommandHandler,
  is_shared_identity: is_shared_identity as CommandHandler,
};
