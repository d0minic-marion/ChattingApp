import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";

const STALE_MS     = 30_000;
const TICK_MS      = 2_000;

export default function PresenceDot({ uid, size = 10 }) {
  const [intent, setIntent] = useState("online");
  const [lastSeenMs, setLastSeenMs] = useState(0);
  const [state, setState] = useState("offline");

  useEffect(() => {
    const ref = doc(db, "users", uid);
    const off = onSnapshot(ref, (snap) => {
      const d = snap.data() || {};
      setIntent(d.intent || "online");

      const ms =
        d.lastSeen?.toMillis?.() ??
        (typeof d.lastSeen?.seconds === "number"
          ? d.lastSeen.seconds * 1000
          : 0);
      setLastSeenMs(ms);
    });
    return () => off();
  }, [uid]);

  useEffect(() => {
    const compute = () => {
      if (!lastSeenMs) return setState("offline");
      const ago = Date.now() - lastSeenMs;
      if (ago <= STALE_MS) {
        setState(intent === "away" ? "away" : "online");
      } else {
        setState("offline");
      }
    };
    compute();
    const id = setInterval(compute, TICK_MS);
    return () => clearInterval(id);
  }, [lastSeenMs, intent]);

  return (
    <span
      className={`presence ${state}`}
      style={{ width: size, height: size }}
      title={state}
    />
  );
}