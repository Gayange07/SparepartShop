import * as React from "react";
import { createPortal } from "react-dom";
import { LuX } from "react-icons/lu";
import { cn } from "@/lib/utils";

// Each open sheet owns one history entry so the phone back button closes it.
// A programmatic close calls history.back(); the next sheet waits for that to land
// before pushing its own entry, or the back would pop the wrong one.
let seq = 0;
let openCount = 0;
const openStack: number[] = [];
let backPending: Promise<void> | null = null;

/** Run after any sheet's pending history.back() has landed, so URL changes aren't undone by it. */
export function afterSheetHistory(fn: () => void) {
  (backPending ?? Promise.resolve()).then(fn);
}

function popOwnEntry(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { window.removeEventListener("popstate", done); resolve(); };
    window.addEventListener("popstate", done);
    history.back();
  });
}

/** Dialog on desktop, bottom sheet on phones (shadcn Dialog + Drawer pattern) */
export function Sheet({ open, onClose, title, description, children, footer, className }: {
  open: boolean; onClose: () => void; title: string; description?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode; className?: string;
}) {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  React.useEffect(() => {
    if (!open) return;
    const id = ++seq;
    let cancelled = false;
    let pushed = false;
    const onPop = (e: PopStateEvent) => {
      const top = (e.state as { sheetId?: number } | null)?.sheetId ?? 0;
      if (top < id) { pushed = false; onCloseRef.current(); }
    };
    (backPending ?? Promise.resolve()).then(() => {
      if (cancelled) return;
      history.pushState({ ...(history.state ?? {}), sheetId: id }, "");
      pushed = true;
      window.addEventListener("popstate", onPop);
    });
    openStack.push(id);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openStack.at(-1) === id && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    if (openCount++ === 0) document.body.style.overflow = "hidden";
    return () => {
      cancelled = true;
      openStack.splice(openStack.indexOf(id), 1);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
      if (--openCount === 0) document.body.style.overflow = "";
      if (pushed && (history.state as { sheetId?: number } | null)?.sheetId === id) {
        const p = popOwnEntry();
        backPending = p;
        p.then(() => { if (backPending === p) backPending = null; });
      }
    };
  }, [open]);

  if (!open) return null;
  const desktop = () => window.matchMedia("(min-width: 768px)").matches;
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade items-start justify-center bg-[rgba(28,33,36,.38)] p-4 pt-16 max-md:items-end max-md:p-0"
      onMouseDown={(e) => e.target === e.currentTarget && desktop() && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cn("flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl bg-card shadow-[0_18px_50px_rgba(28,33,36,.22)] max-md:max-h-[92dvh] max-md:max-w-none max-md:animate-sheet-up max-md:rounded-b-none max-md:rounded-t-[20px]", className)}>
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#CFD5D2] md:hidden" />
        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-2 max-md:pt-2 max-md:pr-2">
          <div className="min-w-0 max-md:pt-2">
            <h2 className="font-cond text-xl font-bold leading-tight break-words">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          <button onClick={onClose} aria-label="Close" className="-mr-1 grid shrink-0 cursor-pointer place-items-center rounded-md p-1 text-faint hover:bg-secondary hover:text-foreground max-md:size-11"><LuX className="size-5" /></button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="flex gap-2 border-t border-border-soft px-5 py-3 max-md:pb-[calc(12px+env(safe-area-inset-bottom))] [&>*]:max-md:flex-1 md:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
