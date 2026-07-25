import { createFileRoute } from "@tanstack/react-router";
import { applySyncPush, pushPayloadSchema } from "@/lib/sync.functions";

function cors(headers: HeadersInit = {}): HeadersInit {
  return {
    ...headers,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-zoom-out-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

// Constant-time string compare. Same-length short-circuit avoids leaking
// length via early return once the expected length is known.
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8 MiB

export const Route = createFileRoute("/api/public/sync/push")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors() }),
      POST: async ({ request }) => {
        const token = request.headers.get("x-zoom-out-token") ?? "";
        const expected = process.env.SYNC_TOKEN ?? "";
        if (!expected || !timingSafeEqual(token, expected)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: cors({ "content-type": "application/json" }),
          });
        }

        const contentLength = Number(request.headers.get("content-length") ?? "0");
        if (contentLength > MAX_BODY_BYTES) {
          return new Response(JSON.stringify({ error: "payload too large" }), {
            status: 413,
            headers: cors({ "content-type": "application/json" }),
          });
        }

        let body: unknown;
        try {
          const text = await request.text();
          if (text.length > MAX_BODY_BYTES) {
            return new Response(JSON.stringify({ error: "payload too large" }), {
              status: 413,
              headers: cors({ "content-type": "application/json" }),
            });
          }
          body = JSON.parse(text);
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: cors({ "content-type": "application/json" }),
          });
        }

        const parsed = pushPayloadSchema.safeParse(body);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid payload", issues: parsed.error.issues }),
            { status: 400, headers: cors({ "content-type": "application/json" }) },
          );
        }
        try {
          const result = await applySyncPush(parsed.data);
          return new Response(JSON.stringify({ ok: true, ...result }), {
            headers: cors({ "content-type": "application/json" }),
          });
        } catch (e) {
          // Log the real error server-side; don't leak internals to the caller.
          console.error("sync push failed", e);
          return new Response(JSON.stringify({ error: "sync failed" }), {
            status: 500,
            headers: cors({ "content-type": "application/json" }),
          });
        }
      },
    },
  },
});
