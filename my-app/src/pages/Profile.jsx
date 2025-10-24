import { useAuth } from "../auth/AuthContext";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db } from "../firebase";
import { updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState } from "react";
import Swal from "sweetalert2"; // 🧩 import SweetAlert2

export default function Profile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      Swal.fire("⚠️ Format invalide", "Seules les images PNG ou JPEG sont acceptées.", "warning");
      return;
    }

    // 🧡 Beau pop-up de confirmation
    const result = await Swal.fire({
      title: "Mettre à jour la photo de profil ?",
      text: "Votre ancienne photo sera remplacée.",
      icon: "question",
      showCancelButton: true,
      confirmButtonText: "Oui, mettre à jour",
      cancelButtonText: "Annuler",
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
    });

    if (!result.isConfirmed) {
      e.target.value = "";
      return;
    }

    try {
      setUploading(true);

      const ext = file.type === "image/png" ? "png" : "jpeg";
      const r = ref(storage, `avatars/${user.uid}/avatar.${ext}`);

      await uploadBytes(r, file, { contentType: file.type });

      const url = await getDownloadURL(r);

      await updateProfile(user, { photoURL: url });
      await updateDoc(doc(db, "users", user.uid), { photoURL: url });

      Swal.fire("✅ Photo mise à jour", "Votre photo de profil a bien été modifiée.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("❌ Erreur upload", err.message, "error");
    } finally {
      setUploading(false);
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    if (!displayName.trim())
      return Swal.fire("⚠️ Attention", "Le pseudonyme ne peut pas être vide.", "warning");

    setSaving(true);
    try {
      await updateProfile(user, { displayName });
      await updateDoc(doc(db, "users", user.uid), { displayName });
      Swal.fire("✅ Profil mis à jour", "Vos informations ont été enregistrées.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("❌ Erreur", err.message, "error");
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
