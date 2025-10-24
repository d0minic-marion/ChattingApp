import { useState } from "react";

export default function MessageInput({ onSend }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    setSending(true);
    try {
      await onSend(t);
      setText("");
    } finally {
      setSending(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <input
        className="input"
        placeholder="Écrire un message…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
      />
      <button className="btn" type="submit" disabled={sending || !text.trim()}>
        {sending ? "Envoi…" : "Envoyer"}
      </button>
    </form>
  );
}