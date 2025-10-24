import { useAuth } from "../auth/AuthContext";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, db } from "../firebase";
import { deleteUser, getAuth, updateProfile } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";

export default function Profile() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingAvatar, setDeletingAvatar] = useState(false);

  const auth = getAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const avatarRefPng = ref(storage, `avatars/${user.uid}/avatar.png`);
  const avatarRefJpeg = ref(storage, `avatars/${user.uid}/avatar.jpeg`);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      Swal.fire("⚠️ Format invalide", "Seules les images PNG ou JPEG sont acceptées.", "warning");
      return;
    }

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
      if (fileInputRef.current) fileInputRef.current.value = "";
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
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onDeleteAvatar = async () => {
    const result = await Swal.fire({
      title: "Supprimer la photo de profil ?",
      text: "Le fichier sera supprimé de Firebase Storage.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Oui, supprimer",
      cancelButtonText: "Annuler",
      confirmButtonColor: "#d33",
    });
    if (!result.isConfirmed) return;

    try {
      setDeletingAvatar(true);

      try {
        await deleteObject(avatarRefPng);
      } catch (e) {
        if (e?.code !== "storage/object-not-found") throw e;
      }
      try {
        await deleteObject(avatarRefJpeg);
      } catch (e) {
        if (e?.code !== "storage/object-not-found") throw e;
      }

      try {
        await updateProfile(user, { photoURL: null });
      } catch {
        await updateProfile(user, { photoURL: "" });
      }
      await updateDoc(doc(db, "users", user.uid), { photoURL: "" });

      Swal.fire("🗑️ Photo supprimée", "Votre photo de profil a été supprimée.", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("❌ Erreur", err.message, "error");
    } finally {
      setDeletingAvatar(false);
    }
  };

  const onSave = async (e) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      Swal.fire("⚠️ Attention", "Le pseudonyme ne peut pas être vide.", "warning");
      return;
    }

    setSaving(true);
    try {
      await updateProfile(user, { displayName: name });
      await updateDoc(doc(db, "users", user.uid), { displayName: name });
      Swal.fire("✅ Profil mis à jour", "Vos informations ont été enregistrées.", "success");
      navigate("/");
    } catch (err) {
      console.error(err);
      Swal.fire("❌ Erreur", err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async (e) => {
    e.preventDefault();
    setDeleting(true);

    try {
      const result = await Swal.fire({
        title: "Supprimer le compte ?",
        text: "Cette action est irréversible.",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Oui, supprimer",
        cancelButtonText: "Annuler",
        confirmButtonColor: "#d33",
      });
      if (!result.isConfirmed) {
        setDeleting(false);
        return;
      }

      try {
        await deleteObject(avatarRefPng);
      } catch (e) {
        if (e?.code !== "storage/object-not-found") console.warn(e);
      }
      try {
        await deleteObject(avatarRefJpeg);
      } catch (e) {
        if (e?.code !== "storage/object-not-found") console.warn(e);
      }

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Aucun utilisateur connecté.");

      await deleteUser(currentUser);

      await Swal.fire("✅ Compte supprimé", "Votre compte a été supprimé avec succès.", "success");
      navigate("/");
    } catch (error) {
      Swal.fire("❌ Erreur", error.message, "error");
      console.error("Erreur suppression :", error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card">
      <h2>Mon profil</h2>

      <div className="row">
        <img src={user.photoURL || "/logo192.png"} alt="Avatar" className="avatar-lg" />
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

        <div style={{ display: "grid", gap: 8 }}>
          <button type="submit" className="btn" disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>

          <button
            type="button"
            className="btn"
            style={{ backgroundColor: "#ef4444", color: "#fff" }}
            onClick={deleteAccount}
            disabled={deleting}
          >
            {deleting ? "Suppression..." : "Supprimer le compte"}
          </button>
        </div>
      </form>

      <div className="form">
        <label>Photo de profil (PNG ou JPEG)</label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png, image/jpeg"
          onChange={onFile}
        />
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn"
            onClick={onDeleteAvatar}
            disabled={deletingAvatar}
            title="Supprimer la photo de profil"
            style={{ backgroundColor: "#ef4444", color: "#fff" }}
          >
            {deletingAvatar ? "Suppression..." : "Supprimer la photo de profil"}
          </button>
          {uploading && <p style={{ margin: 0 }}>⏳ Téléchargement en cours…</p>}
        </div>
      </div>
    </div>
  );
}