import * as React from "react";

const QUERY = "(max-width: 639px)";

/** True on phone-width screens; charts use it to pick a narrower viewBox so labels stay readable. */
export function useNarrow() {
  const [narrow, setNarrow] = React.useState(() => window.matchMedia(QUERY).matches);
  React.useEffect(() => {
    const m = window.matchMedia(QUERY);
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}
