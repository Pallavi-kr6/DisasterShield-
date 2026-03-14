import { useState } from "react";
import axios from "axios";

const API = axios.create({ baseURL: "http://127.0.0.1:8080" });


export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async () => {
    setError("");
    if (!username || !password) { setError("Enter username and password."); return; }
    setLoading(true);
    try {
      const form = new URLSearchParams();
      form.append("username", username);
      form.append("password", password);
      const res = await API.post("/auth/login", form);
      onLogin(res.data.access_token);
    } catch (e) {
      setError(e.response?.data?.detail || "Invalid credentials.");
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      {/* Background grid */}
      <div style={s.grid} />

      <div style={s.card}>
        {/* Logo */}
        <div style={s.logoWrap}>
          <div style={s.shield}>🛡️</div>
          <div>
            <div style={s.title}>DisasterShield</div>
            <div style={s.tagline}>AI-Powered Payout System</div>
          </div>
        </div>

        <div style={s.divider} />

        <p style={s.label}>Admin Access</p>

        <input
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={s.input}
          autoFocus
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          style={s.input}
        />

        {error && <div style={s.error}>⚠️ {error}</div>}

        <button onClick={handleSubmit} disabled={loading} style={s.btn}>
          {loading ? "Authenticating..." : "Sign In →"}
        </button>

        <p style={s.hint}>Default: admin / admin123</p>
      </div>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "#060d1a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "'Courier New', monospace",
    position: "relative",
    overflow: "hidden",
  },
  grid: {
    position: "absolute", inset: 0,
    backgroundImage: `
      linear-gradient(rgba(249,115,22,0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(249,115,22,0.07) 1px, transparent 1px)
    `,
    backgroundSize: "40px 40px",
    pointerEvents: "none",
  },
  card: {
    background: "rgba(15,23,42,0.95)",
    border: "1px solid rgba(249,115,22,0.4)",
    borderRadius: 16,
    padding: "44px 48px",
    width: 380,
    boxShadow: "0 0 60px rgba(249,115,22,0.15)",
    position: "relative",
    zIndex: 1,
  },
  logoWrap: {
    display: "flex", alignItems: "center", gap: 16, marginBottom: 28,
  },
  shield: { fontSize: 44 },
  title: {
    fontSize: 24, fontWeight: "bold", color: "#f97316", letterSpacing: 2,
  },
  tagline: { fontSize: 11, color: "#64748b", letterSpacing: 1, marginTop: 2 },
  divider: {
    height: 1, background: "linear-gradient(90deg, #f97316, transparent)",
    marginBottom: 28,
  },
  label: { color: "#94a3b8", fontSize: 12, letterSpacing: 2, marginBottom: 16, textTransform: "uppercase" },
  input: {
    width: "100%", padding: "12px 16px", marginBottom: 14,
    background: "#0f172a", border: "1px solid #1e3a5f",
    borderRadius: 8, color: "#e2e8f0", fontSize: 14,
    outline: "none", boxSizing: "border-box",
    fontFamily: "'Courier New', monospace",
    transition: "border 0.2s",
  },
  error: {
    background: "#450a0a", border: "1px solid #ef4444",
    color: "#fca5a5", borderRadius: 8, padding: "10px 14px",
    fontSize: 13, marginBottom: 14,
  },
  btn: {
    width: "100%", padding: "13px",
    background: "linear-gradient(135deg, #f97316, #ea580c)",
    color: "#fff", border: "none", borderRadius: 8,
    fontSize: 15, fontWeight: "bold", cursor: "pointer",
    letterSpacing: 1, marginTop: 4,
    boxShadow: "0 4px 20px rgba(249,115,22,0.35)",
  },
  hint: { color: "#334155", fontSize: 12, textAlign: "center", marginTop: 16 },
};
