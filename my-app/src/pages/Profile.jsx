import { useAuth } from "../auth/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db } from "../firebase";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";

export default function Profile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [saving, setSaving] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = ref(storage, `avatars/${user.uid}.jpg`);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    await updateProfile(user, { photoURL: url });
    await updateDoc(doc(db, "users", user.uid), { photoURL: url });
    alert("Photo mise à jour !");
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    await updateProfile(user, { displayName });
    await updateDoc(doc(db, "users", user.uid), { displayName });
    setSaving(false);
  };

  return (
    <div className="card">
      <h2>Mon profil</h2>
      <div className="row">
        <img src={user.photoURL || "/logo192.png"} alt="" className="avatar-lg" />
        <div>
          <p><strong>UID:</strong> {user.uid}</p>
          {user.email && <p><strong>Email:</strong> {user.email}</p>}
          {user.phoneNumber && <p><strong>Téléphone:</strong> {user.phoneNumber}</p>}
          <p><strong>Fournisseurs:</strong> {user.providerData.map(p => p.providerId).join(", ")}</p>
        </div>
      </div>

      <form onSubmit={onSave} className="form">
        <label>Pseudonyme</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} />
        <button className="btn" disabled={saving} type="submit">{saving ? "Enregistrement..." : "Enregistrer"}</button>
      </form>

      <div className="form">
        <label>Photo de profil</label>
        <input type="file" accept="image/*" onChange={onFile} />
      </div>
    </div>
  );
}