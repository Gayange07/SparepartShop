export const SESSION_EXPIRED = "session-expired";

const SIGN_IN_REQUIRED = "Sign in required";
const OFFLINE = "No connection to the shop computer. Check the Wi-Fi and try again.";

export async function api<T>(path: string, options?: { method?: "GET" | "POST" | "PUT" | "DELETE"; body?: unknown }): Promise<{ ok: boolean; status: number; data: T }> {
  const hasBody = options?.body !== undefined;
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options?.method ?? (hasBody ? "POST" : "GET"),
      credentials: "include",
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    return { ok: false, status: 0, data: { error: OFFLINE } as T };
  }
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = { error: res.ok ? undefined : `Something went wrong (${res.status}). Try again.` } as T;
  }
  // Wrong owner-authorization passwords are also 401; only the auth guard's reply means the session is gone.
  if (res.status === 401 && (data as { error?: string })?.error === SIGN_IN_REQUIRED) window.dispatchEvent(new Event(SESSION_EXPIRED));
  return { ok: res.ok, status: res.status, data };
}
