import * as React from "react";
import { cn } from "@/lib/utils";

/** Minimal toast (shadcn "sonner" pattern) */
const Ctx = React.createContext<(m: string) => void>(() => {});
export const useToast = () => React.useContext(Ctx);
export function Toaster({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = React.useState<string | null>(null);
  const t = React.useRef<number>(0);
  const show = React.useCallback((m: string) => { setMsg(m); clearTimeout(t.current); t.current = window.setTimeout(() => setMsg(null), 2200); }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div aria-live="polite" className={cn("pointer-events-none fixed inset-x-4 z-[60] mx-auto w-fit max-w-md rounded-2xl bg-foreground px-4 py-2.5 text-center text-sm text-white transition-all duration-200 bottom-6 max-md:top-[74px] max-md:bottom-auto",
        msg ? "opacity-100" : "opacity-0 translate-y-2")}>{msg}</div>
    </Ctx.Provider>
  );
}
