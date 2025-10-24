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

      if (u) {
        try {
          await setDoc(
            doc(db, "users", u.uid),
            {
              displayName: u.displayName || "Anonyme",
              photoURL: u.photoURL || "",
              email: u.email || null,
              phone: u.phoneNumber || null,
              providers: u.providerData.map((p) => p.providerId),
              status: "online",
              lastSeen: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (e) {
          console.error("Profil/presence write failed:", e);
        }

        const handleBeforeUnload = async () => {
          try {
            await updateDoc(doc(db, "users", u.uid), {
              status: "offline",
              lastSeen: serverTimestamp(),
            });
          } catch {}
        };
        const handleVisibility = async () => {
          try {
            await updateDoc(doc(db, "users", u.uid), {
              status: document.visibilityState === "visible" ? "online" : "away",
              lastSeen: serverTimestamp(),
            });
          } catch {}
        };

        window.addEventListener("beforeunload", handleBeforeUnload);
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
          window.removeEventListener("beforeunload", handleBeforeUnload);
          document.removeEventListener("visibilitychange", handleVisibility);
        };
      }
    });

    return () => unsub();
  }, []);

  const logout = () => signOut(auth);

  const value = useMemo(
    () => ({ user, loading, logout }),
    [user, loading]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}