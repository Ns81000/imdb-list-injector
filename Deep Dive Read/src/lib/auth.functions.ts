import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { z } from "zod";
import type { AuthStatus } from "@/types";

interface SessionData {
  authenticated?: boolean;
  since?: string;
}

// In-memory brute-force throttle. Single-user app, single-isolate footprint —
// good enough to slow scripted guessing without pulling in a full rate-limit
// dependency. Resets on cold start; that's fine given PBKDF2 already costs
// ~100ms per attempt.
let failedAttempts = 0;
let lockoutUntil = 0;
const MAX_ATTEMPTS = 8;
const LOCKOUT_MS = 60_000;

async function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const getAuthStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthStatus> => {
    const { getSessionConfig } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("key,value")
      .in("key", ["password_hash", "setup_complete"]);
    const map = new Map((data ?? []).map((r) => [r.key, r.value]));
    const setup = map.get("setup_complete") === "true" && Boolean(map.get("password_hash"));
    const session = await useSession<SessionData>(getSessionConfig());
    const authenticated = setup && Boolean(session.data.authenticated);
    return { setup, authenticated };
  },
);

export const setupPassword = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ password: z.string().min(8).max(256) }).parse(data))
  .handler(async ({ data }) => {
    const { hashPassword, getSessionConfig } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "setup_complete")
      .maybeSingle();
    if (existing.data?.value === "true") {
      throw new Error("Setup already complete.");
    }
    const hash = await hashPassword(data.password);
    await supabaseAdmin.from("app_settings").upsert(
      [
        { key: "password_hash", value: hash },
        { key: "setup_complete", value: "true" },
      ],
      { onConflict: "key" },
    );
    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ authenticated: true, since: new Date().toISOString() });
    return { ok: true };
  });

export const login = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ password: z.string().min(1).max(256) }).parse(data))
  .handler(async ({ data }) => {
    if (Date.now() < lockoutUntil) {
      const secs = Math.ceil((lockoutUntil - Date.now()) / 1000);
      throw new Error(`Too many attempts. Try again in ${secs}s.`);
    }
    const { verifyPassword, getSessionConfig } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const row = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "password_hash")
      .maybeSingle();
    if (!row.data?.value) throw new Error("No password set.");
    const ok = await verifyPassword(data.password, row.data.value);
    if (!ok) {
      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockoutUntil = Date.now() + LOCKOUT_MS;
        failedAttempts = 0;
      }
      // Small extra delay on failure to further blunt scripted guessing.
      await delay(400);
      throw new Error("Wrong password.");
    }
    failedAttempts = 0;
    lockoutUntil = 0;
    const session = await useSession<SessionData>(getSessionConfig());
    await session.update({ authenticated: true, since: new Date().toISOString() });
    return { ok: true };
  });

export const logout = createServerFn({ method: "POST" }).handler(async () => {
  const { getSessionConfig } = await import("./auth.server");
  const session = await useSession<SessionData>(getSessionConfig());
  await session.clear();
  return { ok: true };
});

export const changePassword = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        currentPassword: z.string().min(1).max(256),
        newPassword: z.string().min(8).max(256),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { hashPassword, verifyPassword, getSessionConfig } = await import("./auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const session = await useSession<SessionData>(getSessionConfig());
    if (!session.data.authenticated) throw new Error("Not authenticated.");
    const row = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "password_hash")
      .maybeSingle();
    if (!row.data?.value) throw new Error("No password set.");
    const ok = await verifyPassword(data.currentPassword, row.data.value);
    if (!ok) throw new Error("Current password is incorrect.");
    const hash = await hashPassword(data.newPassword);
    await supabaseAdmin
      .from("app_settings")
      .upsert([{ key: "password_hash", value: hash }], { onConflict: "key" });
    return { ok: true };
  });

export const getSessionInfo = createServerFn({ method: "GET" }).handler(async () => {
  const { getSessionConfig } = await import("./auth.server");
  const session = await useSession<SessionData>(getSessionConfig());
  return {
    authenticated: Boolean(session.data.authenticated),
    since: session.data.since ?? null,
  };
});
