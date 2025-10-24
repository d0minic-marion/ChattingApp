import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Link } from "react-router-dom";
import UserList from "../components/UserList";

export default function Home() {
  const [rooms, setRooms] = useState([
    { id: "general", name: "#general" },
    { id: "random", name: "#random" },
  ]);

  // Si tu veux lister les rooms dynamiquement depuis Firestore:
  // useEffect(() => {
  //   const q = query(collection(db, "rooms"), orderBy("createdAt","asc"));
  //   return onSnapshot(q, (snap) => setRooms(snap.docs.map(d => ({ id:d.id, ...d.data() }))));
  // }, []);

  return (
    <div className="grid">
      <section className="card">
        <h2>Salons publics</h2>
        <ul className="list">
          {rooms.map(r => (
            <li key={r.id}>
              <Link to={`/room/${r.id}`}>{r.name}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Messages privés</h2>
        <UserList />
      </section>
    </div>
  );
}