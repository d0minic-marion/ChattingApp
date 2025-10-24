import { Routes, Route, Link, Navigate } from "react-router-dom";
import AuthGate from "./auth/AuthGate";
import Home from "./pages/Home";
import Room from "./pages/Room";
import DM from "./pages/DM";
import Profile from "./pages/Profile";
import { useAuth } from "./auth/AuthContext";
import PresenceDot from "./components/PresenceDot";
import "./App.css";

export default function App() {
  return (
    <AuthGate>
      <Shell />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
          <Route path="/dm/:uid" element={<DM />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </AuthGate>
  );
}

function Shell() {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <nav className="nav">
        <Link to="/" className="brand">💬 ChattingApp</Link>
        <div className="spacer" />
        {user && (
          <>
            <Link to="/room/general" className="navlink">#general</Link>
            <Link to="/room/random" className="navlink">#random</Link>
            <Link to="/profile" className="navlink">Profil</Link>
            <div className="userpill">
              <PresenceDot uid={user.uid} />
              <img src={user.photoURL || "/logo192.png"} alt="" className="avatar" />
              <span className="username">{user.displayName || "Moi"}</span>
              <button className="btn" onClick={logout}>Déconnexion</button>
            </div>
          </>
        )}
      </nav>
    </header>
  );
}