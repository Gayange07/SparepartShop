import * as React from "react";
import { LoginRequest, type SessionUser } from "shared";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api } from "@/lib/api";

export function LoginPage({ onLogin }: { onLogin: (user: SessionUser) => void }) {
  const [form, setForm] = React.useState({ username: "admin", password: "" });
  const [err, setErr] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = LoginRequest.safeParse(form);
    if (!r.success) return setErr(r.error.issues[0].message);
    setBusy(true);
    const res = await api<{ user?: SessionUser; error?: string }>("/auth/login", { body: r.data });
    setBusy(false);
    if (!res.ok || !res.data.user) return setErr(res.data.error ?? "Wrong username or password");
    onLogin(res.data.user);
  };
  return (
    <div className="grid min-h-dvh place-items-center p-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-6">
          <div className="font-cond text-[32px] font-bold leading-none">Demo Moto Spares</div>
          <div className="mt-1.5 text-muted-foreground">Galle. Motorcycle and three-wheeler parts</div>
        </div>
        <Card>
          <CardContent className="pt-5">
            <form onSubmit={submit} className="space-y-3">
              <div><Label htmlFor="u">Username</Label><Input id="u" autoCapitalize="none" autoCorrect="off" autoComplete="username" spellCheck={false} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div><Label htmlFor="p">Password</Label><Input id="p" type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoFocus /></div>
              {err && <p role="alert" className="text-sm font-medium text-destructive">{err}</p>}
              <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
            </form>
            <p className="mt-4 rounded-md bg-muted px-3 py-2 text-[12.5px] text-muted-foreground">Demo login: <b className="text-foreground">admin</b> / <b className="text-foreground">12345</b></p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
