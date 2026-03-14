import { useState } from "react";
import Login from "./Pages/Login";
import Dashboard from "./Pages/Dashboard";

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("ds_token"));

  const handleLogin = (t) => {
    localStorage.setItem("ds_token", t);
    setToken(t);
  };

  const handleLogout = () => {
    localStorage.removeItem("ds_token");
    setToken(null);
  };

  if (!token) return <Login onLogin={handleLogin} />;
  return <Dashboard onLogout={handleLogout} token={token} />;
}