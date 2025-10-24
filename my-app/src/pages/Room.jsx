import { useParams } from "react-router-dom";
import { collection, addDoc, serverTimestamp, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useEffect, useState, useCallback } from "react";
import { db } from "../firebase";
import { useAuth } from "../auth/AuthContext";
import MessageList from "../components/MessageList";
import MessageInput from "../components/MessageInput";


export default function Room() {
  const { roomId } = useParams();
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMsgs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [roomId]);

  const send = useCallback(async (text) => {
    await addDoc(collection(db, "rooms", roomId, "messages"), {
      text,
      uid: user.uid,
      displayName: user.displayName || "Anonyme",
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp(),
    });
  }, [roomId, user]);

  return (
    <div className="chat">
      <h2># {roomId}</h2>
      <MessageList items={msgs} loading={loading} />
      <MessageInput onSend={send} />
    </div>
  );
}