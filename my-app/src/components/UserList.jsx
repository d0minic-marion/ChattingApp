import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import PresenceDot from "./PresenceDot";
import { useAuth } from "../auth/AuthContext";

export default function UserList() {
  const [users, setUsers] = useState([]);
  const { user: me } = useAuth();

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("displayName", "asc"));
    return onSnapshot(q, (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, []);

  return (
    <ul className="list">
      {users
        .filter(u => u.id !== me?.uid)
        .map(u => (
          <li key={u.id} className="userrow">
            <PresenceDot uid={u.id} />
            <img src={u.photoURL || "/logo192.png"} alt="" className="avatar" />
            <span className="username">{u.displayName || "(sans nom)"} </span>
            <Link to={`/dm/${u.id}`} className="btn small">DM</Link>
          </li>
      ))}
    </ul>
  );
}