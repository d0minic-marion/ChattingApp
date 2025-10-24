import { useState } from "react";
import { Link } from "react-router-dom";
import UserList from "../components/UserList";

export default function Home() {
  const [rooms, setRooms] = useState([
    { id: "general", name: "#general" }
  ]);

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