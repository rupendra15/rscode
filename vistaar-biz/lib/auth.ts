import { cookies } from "next/headers";

export type VistaarRole = "admin" | "manager" | "user";

export type AuthContext = {
  userId: string;
  email: string | null;
  role: VistaarRole;
  accessToken: string;
};

const ACCESS_COOKIE = "vistaar_access_token";
const REFRESH_COOKIE = "vistaar_refresh_token";

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase authentication is not configured.");
  return { url, key };
}

async function setSession(accessToken: string, refreshToken?: string) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 });
  if (refreshToken) {
    jar.set(REFRESH_COOKIE, refreshToken, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  }
}

export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

async function verifyAccessToken(accessToken: string) {
  const { url, key } = config();
  const response = await fetch(url + "/auth/v1/user", {
    headers: { apikey: key, Authorization: "Bearer " + accessToken },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return await response.json();
}

async function refreshSession(refreshToken: string) {
  const { url, key } = config();
  const response = await fetch(url + "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store"
  });
  if (!response.ok) return null;
  return await response.json();
}

async function roleFor(userId: string, email: string | null): Promise<VistaarRole> {
  const { url, key } = config();
  const query = new URLSearchParams({ select: "role,status", user_id: "eq." + userId, limit: "1" });
  const response = await fetch(url + "/rest/v1/user_roles?" + query.toString(), {
    headers: { apikey: key, Authorization: "Bearer " + key },
    cache: "no-store"
  });
  if (response.ok) {
    const rows = await response.json();
    const row = rows?.[0];
    if (row?.status === "disabled") throw new Error("ACCOUNT_DISABLED");
    const role = row?.role;
    if (role === "admin" || role === "manager" || role === "user") return role;
  }
  const configuredAdmins = String(process.env.VISTAAR_ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return email && configuredAdmins.includes(email.toLowerCase()) ? "admin" : "user";
}

export async function getAuthContext(): Promise<AuthContext | null> {
  try {
    const jar = await cookies();
    let accessToken = jar.get(ACCESS_COOKIE)?.value;
    const refreshToken = jar.get(REFRESH_COOKIE)?.value;
    let user = accessToken ? await verifyAccessToken(accessToken) : null;

    if (!user && refreshToken) {
      const refreshed = await refreshSession(refreshToken);
      if (refreshed?.access_token) {
        accessToken = refreshed.access_token;
        await setSession(refreshed.access_token, refreshed.refresh_token || refreshToken);
        user = await verifyAccessToken(refreshed.access_token);
      }
    }

    if (!user || !accessToken || !user.id) return null;
    return { userId: user.id, email: user.email || null, role: await roleFor(user.id, user.email || null), accessToken };
  } catch {
    return null;
  }
}

export async function requireRole(roles: VistaarRole[]): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new Error("UNAUTHENTICATED");
  if (!roles.includes(context.role)) throw new Error("FORBIDDEN");
  return context;
}

export async function signIn(email: string, password: string) {
  const { url, key } = config();
  const response = await fetch(url + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.msg || "Invalid email or password.");
  await setSession(data.access_token, data.refresh_token);
  return data;
}

export async function signUp(email: string, password: string, name?: string) {
  const { url, key } = config();
  const response = await fetch(url + "/auth/v1/signup", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: name || "" } }),
    cache: "no-store"
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.msg || data.error_description || "Unable to create your account.");
  if (data.access_token) await setSession(data.access_token, data.refresh_token);
  return data;
}
