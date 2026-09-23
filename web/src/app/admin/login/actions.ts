"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  ADMIN_SESSION_COOKIE,
  adminSessionMaxAgeSeconds,
  createAdminSessionToken,
  isCorrectAdminPassword,
} from "@/lib/admin-auth";

/**
 * Where to land after login. Only ever an internal /admin/* path (never an
 * attacker-supplied external URL) — and only when it's a *specific* admin
 * page someone was deep-linking to (e.g. the proxy bounced them off
 * /admin/products/edit/SKU). The bare "/admin" dashboard is deliberately not
 * treated as a real destination: admins manage everything from the public
 * site itself now, so a plain login (or one bounced off just "/admin") lands
 * on the homepage instead of that now-secondary dashboard.
 */
function landingPathAfterLogin(next: FormDataEntryValue | null): string {
  if (typeof next === "string" && next.startsWith("/admin/")) return next;
  return "/";
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const next = landingPathAfterLogin(formData.get("next"));

  if (!isCorrectAdminPassword(password)) {
    redirect(`/admin/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, createAdminSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: adminSessionMaxAgeSeconds(),
  });

  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
  redirect("/");
}
