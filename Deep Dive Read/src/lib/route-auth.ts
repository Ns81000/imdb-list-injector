// Finding #6: Shared beforeLoad auth helper for protected routes
// Checks authentication before component mount, preventing wasted renders and data fetches

import { redirect } from "@tanstack/react-router";
import { getAuthStatus } from "./auth.functions";

export async function requireAuth() {
  const status = await getAuthStatus();
  
  // First check: is setup complete?
  if (!status.setup) {
    throw redirect({ to: "/setup" });
  }
  
  // Second check: is user authenticated?
  if (!status.authenticated) {
    throw redirect({ to: "/login" });
  }
  
  return status;
}
