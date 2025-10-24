import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { auth } from "../firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db } from "../firebase";
import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u ?? null);
      setLoading(false);
      cleanupPresence?.();

      if (!u) return;

      const uref = doc(db, "users", u.uid);

      try {
        await setDoc(
          uref,
          {
            displayName: u.displayName || "Anonyme",
            photoURL: u.photoURL || "",
            email: u.email || null,
            phone: u.phoneNumber || null,
            providers: u.providerData.map((p) => p.providerId),
            lastSeen: serverTimestamp(),
            intent: "online",
          },
          { merge: true }
        );
      } catch (e) {
        console.error("Erreur Firestore:", e);
      }

      const beat = async () => {
        try {
          await updateDoc(uref, { lastSeen: serverTimestamp() });
        } catch {}
      };
      const beatId = setInterval(beat, 20_000);
      beat();

      const onBeforeUnload = async () => {
        try {
          await updateDoc(uref, { intent: "offline", lastSeen: serverTimestamp() });
        } catch {}
      };
      window.addEventListener("beforeunload", onBeforeUnload);

      cleanupPresence = () => {
        clearInterval(beatId);
        window.removeEventListener("beforeunload", onBeforeUnload);
      };
    });

    return () => {
      cleanupPresence?.();
      unsub();
    };
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem("firebase:previous_websocket_failure");
      sessionStorage.clear();
    } catch (e) {
      console.warn("Erreur lors de la déconnexion:", e);
    }
  };

  const value = useMemo(() => ({ user, loading, logout }), [user, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

let cleanupPresence = null;