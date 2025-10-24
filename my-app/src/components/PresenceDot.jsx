import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";

export default function PresenceDot({ uid, size = 10 }) {
  const [status, setStatus] = useState("offline");

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "users", uid), (d) => {
      const s = d.data()?.status || "offline";
      setStatus(s);
    });
    return () => unsub();
  }, [uid]);

  return <span className={`presence ${status}`} style={{ width: size, height: size }} title={status} />;
}