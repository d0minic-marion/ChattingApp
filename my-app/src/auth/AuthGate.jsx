import { useAuth } from "./AuthContext";
import { auth, providers } from "../firebase";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  RecaptchaVerifier,
  signInWithPhoneNumber,
} from "firebase/auth";
import { useEffect, useMemo, useState } from "react";
import "./auth.css";

export default function AuthGate({ children }) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", {
          size: "invisible",
        });
      } catch {}
    }
  }, []);

  const disabled = useMemo(() => busy, [busy]);

  if (user === undefined) {
    return (
      <div className="auth-wrap">
        <div className="auth-card"><p>Chargement…</p></div>
      </div>
    );
  }
  if (user) return children;

  const handle = async (fn) => {
    setErr("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      console.error(e);
      setErr(e.message || "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  };

  const signInEmail = () =>
    handle(() => signInWithEmailAndPassword(auth, email, password));
  const signUpEmail = () =>
    handle(() => createUserWithEmailAndPassword(auth, email, password));
  const signAnon = () => handle(() => signInAnonymously(auth));
  const signWithProvider = (prov) => handle(() => signInWithPopup(auth, prov));

  const sendOTP = async () => {
    setErr("");
    setBusy(true);
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmResult(result);
    } catch (e) {
      setErr(e.message || "Impossible d’envoyer le code.");
    } finally {
      setBusy(false);
    }
  };
  const verifyOTP = async () => {
    if (!confirmResult) return;
    await handle(() => confirmResult.confirm(otp));
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">Connexion / Inscription</h1>

        {err && <div className="auth-alert">{err}</div>}

        <section className="auth-section">
          <h2 className="auth-sub">📧 E-mail & mot de passe</h2>
          <div className="auth-grid">
            <input
              className="auth-input"
              placeholder="Courriel"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={disabled}
              autoComplete="username"
            />
            <input
              className="auth-input"
              placeholder="Mot de passe"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={disabled}
              autoComplete="current-password"
            />
          </div>
          <div className="auth-actions">
            <button className="btn btn-primary" onClick={signInEmail} disabled={disabled || !email || !password}>
              Se connecter
            </button>
            <button className="btn" onClick={signUpEmail} disabled={disabled || !email || !password}>
              Créer un compte
            </button>
          </div>
        </section>

        <div className="auth-sep"><span>ou</span></div>

        <section className="auth-section">
          <h2 className="auth-sub">📱 Téléphone</h2>
          <div className="auth-grid">
            <input
              className="auth-input"
              placeholder="+1 (438) 555-1234"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={disabled}
              inputMode="tel"
            />
            <button className="btn" onClick={sendOTP} disabled={disabled || !phone}>
              Recevoir le code
            </button>
          </div>
          <div className="auth-grid">
            <input
              className="auth-input"
              placeholder="Code SMS"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              disabled={disabled || !confirmResult}
              inputMode="numeric"
            />
            <button className="btn btn-primary" onClick={verifyOTP} disabled={disabled || !otp || !confirmResult}>
              Valider le code
            </button>
          </div>
          <div id="recaptcha" className="auth-recaptcha" />
        </section>

        <div className="auth-sep"><span>ou</span></div>

        <section className="auth-section">
          <h2 className="auth-sub">🔑 Se connecter avec</h2>
          <div className="provider-row">
            <button className="btn provider google" onClick={() => signWithProvider(providers.google)} disabled={disabled}>
              <span>G</span> Google
            </button>
            <button className="btn provider github" onClick={() => signWithProvider(providers.github)} disabled={disabled}>
              <span>𝙶</span> GitHub
            </button>
            <button className="btn provider facebook" onClick={() => signWithProvider(providers.facebook)} disabled={disabled}>
              <span>f</span> Facebook
            </button>
          </div>
        </section>

        <div className="auth-sep"><span>ou</span></div>

        <section className="auth-section">
          <button className="btn btn-ghost" onClick={signAnon} disabled={disabled}>
            🚪 Continuer anonymement
          </button>
        </section>

        {busy && <p className="auth-note">⏳ Traitement en cours…</p>}
      </div>
    </div>
  );
}