import { useEffect, useState } from "react";

function minutesNow(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Minutes since local midnight, kept fresh on an interval. Skips ticks while
 * the tab is hidden and catches up on the visibilitychange that reveals it.
 * State only moves when the minute value changes, so consumers re-render at
 * most once a minute.
 */
export function useNowMinutes(intervalMs = 30000): number {
  const [nowMinutes, setNowMinutes] = useState(minutesNow);

  useEffect(() => {
    const update = () => setNowMinutes(minutesNow());
    const id = setInterval(() => {
      if (!document.hidden) update();
    }, intervalMs);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, [intervalMs]);

  return nowMinutes;
}
