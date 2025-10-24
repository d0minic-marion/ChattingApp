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
import { useState } from "react";

export default function AuthGate({ children }) {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);

  if (user === undefined) return <p>Chargement…</p>;

  if (!user) {
    const signInEmail = () => signInWithEmailAndPassword(auth, email, password);
    const signUpEmail = () => createUserWithEmailAndPassword(auth, email, password);
    const signAnon = () => signInAnonymously(auth);
    const signWithProvider = (prov) => signInWithPopup(auth, prov);

    const sendOTP = async () => {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha", {});
      }
      const result = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmResult(result);
    };
    const verifyOTP = async () => {
      if (confirmResult && otp) await confirmResult.confirm(otp);
    };

    return (
      <div style={{ padding: 24 }}>
        <h2>Connexion / Inscription</h2>

        <input placeholder="Courriel" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Mot de passe" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <div>
          <button onClick={signInEmail}>Connexion</button>
          <button onClick={signUpEmail}>Créer un compte</button>
        </div>

        <input placeholder="+1 438..." value={phone} onChange={e => setPhone(e.target.value)} />
        <button onClick={sendOTP}>Recevoir le code</button>
        <div id="recaptcha"></div>
        <input placeholder="Code SMS" value={otp} onChange={e => setOtp(e.target.value)} />
        <button onClick={verifyOTP}>Valider le code</button>

        <button onClick={signAnon}>Continuer anonymement</button>

        <button onClick={() => signWithProvider(providers.google)}>Google</button>
        <button onClick={() => signWithProvider(providers.github)}>GitHub</button>
        <button onClick={() => signWithProvider(providers.facebook)}>Facebook</button>
      </div>
    );
  }

  return children;
}
