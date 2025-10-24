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
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      alert("Seules les images PNG ou JPEG sont acceptées.");
      return;
    }

    try {
      setUploading(true);

      const ext = file.type === "image/png" ? "png" : "jpeg";
      const r = ref(storage, `avatars/${user.uid}/.${ext}`);

      await uploadBytes(r, file, { contentType: file.type });

      const url = await getDownloadURL(r);

      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, "users", user.uid), { photoURL: url });

      alert("✅ Photo de profil mise à jour !");
    } catch (err) {
      console.error(err);
      alert("❌ Erreur upload: " + err.message);
    } finally {
      setUploading(false);
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim()) return alert("Le pseudonyme ne peut pas être vide.");
    setSaving(true);
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      alert("✅ Profil mis à jour !");
    } catch (err) {
      console.error(err);
      alert("❌ Erreur: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h2>Mon profil</h2>

      <div className="row">
        <img
          src={user.photoURL || "/logo192.png"}
          alt="Avatar"
          className="avatar-lg"
        />
        <div>
          <p><strong>UID:</strong> {user.uid}</p>
          {user.email && <p><strong>Email:</strong> {user.email}</p>}
          {user.phoneNumber && <p><strong>Téléphone:</strong> {user.phoneNumber}</p>}
          <p><strong>Fournisseurs:</strong> {user.providerData.map(p => p.providerId).join(", ")}</p>
        </div>
      </div>

      <form onSubmit={onSave} className="form">
        <label>Pseudonyme</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Entrez votre pseudonyme"
        />
        <button className="btn" disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
      </form>

      <div className="form">
        <label>Photo de profil (PNG ou JPEG)</label>
        <input type="file" accept="image/png, image/jpeg" onChange={onFile} />
        {uploading && <p>⏳ Téléchargement en cours...</p>}
      </div>
    </div>
  );
}