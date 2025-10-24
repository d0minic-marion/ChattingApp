import { useParams } from "react-router-dom";
import { collection, addDoc, onSnapshot, orderBy, query, serverTimestamp, limit } from "firebase/firestore";
import { useEffect, useMemo, useState, useCallback } from "react";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";

const threadIdOf = (a, b) => [a, b].sort().join("_");

export default function DM() {
  const { uid } = useParams();
  const { user } = useAuth();
  const threadId = useMemo(() => threadIdOf(user.uid, uid), [user.uid, uid]);
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, "dmThreads", threadId, "messages"), orderBy("createdAt", "desc"), limit(50));
    const unsub = onSnapshot(q, s => {
      setMsgs(s.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [threadId]);

  const send = useCallback(async (text) => {
    await addDoc(collection(db, "dmThreads", threadId, "messages"), {
      text,
      uid: user.uid,
      displayName: user.displayName || "Moi",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
    });
  }, [threadId, user]);

  return (
    <div className="chat">
      <h2>Message privé</h2>
      <MessageList items={msgs} loading={loading}/>
      <MessageInput onSend={send} />
    </div>
  );
}