"use client";

import { useCallback, useEffect, useState } from "react";

// The modal owns one history entry. Back dismisses it; Forward restores it.
export function useAuthDialog() {
  const [intent, setIntent] = useState(null);

  useEffect(() => {
    function onPopState() {
      setIntent(window.history.state?.veloxAuthIntent || null);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const open = useCallback((nextIntent = "publish") => {
    if (!window.history.state?.veloxAuthIntent) {
      window.history.pushState({ ...window.history.state, veloxAuthIntent: nextIntent }, "");
    }
    setIntent(nextIntent);
  }, []);

  const close = useCallback(() => {
    setIntent(null);
    if (window.history.state?.veloxAuthIntent) window.history.back();
  }, []);

  return { intent, open, close };
}
