import { useState, useEffect } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";

const API = axios.create({ baseURL: "http://127.0.0.1:8080" });

const COLORS = ["#22c55e", "#ef4444", "#f97316", "#3b82f6"];

export default function Dashboard({ onLogout, token }) {
  const [tab, setTab]         = useState("dashboard");
  const [records, setRecords] = useState([]);
  const [form, setForm]       = useState({ worker_id:"", city:"", daily_income:"", disaster_severity:"", days_affected:"" });
  const [result, setResult]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const headers = { Authorization: `Bearer ${token}` };

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      const res = await API.get("/records", { headers });
      setRecords(res.data);
    } catch (e) {
      if (e.response?.status === 401) onLogout();
    }
  };

  const handlePredict = async () => {
    setError(""); setResult(null);
    if (!form.worker_id || !form.city || !form.daily_income || !form.disaster_severity || !form.days_affected) {
      setError("Please fill in all fields."); return;
    }
    setLoading(true);
    try {
      const res = await API.post("/predict-payout", {
        worker_id: form.worker_id, city: form.city,
        daily_income: parseFloat(form.daily_income),
        disaster_severity: parseFloat(form.disaster_severity),
        days_affected: parseInt(form.days_affected),
      }, { headers });
      setResult(res.data);
      fetchRecords();
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong.");
    }
    setLoading(false);
  };

  // Stats
  const total     = records.length;
  const approved  = records.filter(r => r.status === "approved").length;
  const rejected  = records.filter(r => r.status === "rejected").length;
  const totalPaid = records.reduce((s, r) => s + (r.payout || 0), 0);

  // Chart data
  const pieData = [
    { name: "Approved", value: approved },
    { name: "Rejected", value: rejected },
  ];

  const cityData = Object.entries(
    records.reduce((acc, r) => {
      if (r.city) acc[r.city] = (acc[r.city] || 0) + 1;
      return acc;
    }, {})
  ).map(([city, count]) => ({ city, count })).slice(0, 8);

  const timelineData = records.slice(-10).reverse().map((r, i) => ({
    name: `#${r.id}`,
    payout: r.payout || 0,
    risk: r.risk_score || 0,
  }));

  return (
    <div style={s.page}>
      {/* Sidebar */}
      <div style={s.sidebar}>
        <div style={s.sideTop}>
          <div style={s.logo}>🛡️</div>
          <div style={s.logoText}>Disaster<br/>Shield</div>
        </div>

        <nav style={s.nav}>
          {[
            { id: "dashboard", icon: "📊", label: "Dashboard" },
            { id: "predict",   icon: "🔍", label: "Predict" },
            { id: "history",   icon: "📋", label: "History" },
          ].map(item => (
            <button key={item.id}
              onClick={() => setTab(item.id)}
              style={tab === item.id ? s.navItemActive : s.navItem}>
              <span style={{ fontSize: 18 }}>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <button onClick={onLogout} style={s.logoutBtn}>⬅ Logout</button>
      </div>

      {/* Main Content */}
      <div style={s.main}>

        {/* Header */}
        <div style={s.topbar}>
          <div>
            <div style={s.pageTitle}>
              {tab === "dashboard" ? "📊 Overview" : tab === "predict" ? "🔍 Predict Payout" : "📋 Payout History"}
            </div>
            <div style={s.pageSub}>DisasterShield Admin Panel</div>
          </div>
          <div style={s.badge}>● LIVE</div>
        </div>

        {/* ── DASHBOARD TAB ── */}
        {tab === "dashboard" && (
          <div style={s.content}>

            {/* Stat Cards */}
            <div style={s.statsRow}>
              {[
                { label: "Total Claims",    value: total,                     color: "#3b82f6", icon: "📁" },
                { label: "Approved",        value: approved,                  color: "#22c55e", icon: "✅" },
                { label: "Rejected",        value: rejected,                  color: "#ef4444", icon: "❌" },
                { label: "Total Paid Out",  value: `₹${totalPaid.toFixed(0)}`, color: "#f97316", icon: "💰" },
              ].map(c => (
                <div key={c.label} style={{ ...s.statCard, borderColor: c.color }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ ...s.statVal, color: c.color }}>{c.value}</div>
                  <div style={s.statLabel}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div style={s.chartsRow}>

              {/* Approval Pie */}
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Claim Outcomes</div>
                {total === 0 ? <NoData /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={80}
                        dataKey="value" label={({ name, percent }) =>
                          `${name} ${(percent * 100).toFixed(0)}%`}>
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "none", color: "#fff" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Claims by City */}
              <div style={s.chartCard}>
                <div style={s.chartTitle}>Claims by City</div>
                {cityData.length === 0 ? <NoData /> : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cityData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="city" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#1e293b", border: "none", color: "#fff" }} />
                      <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Payout Timeline */}
            <div style={s.chartCardWide}>
              <div style={s.chartTitle}>Payout Timeline (Last 10)</div>
              {timelineData.length === 0 ? <NoData /> : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={timelineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: "#1e293b", border: "none", color: "#fff" }} />
                    <Legend wrapperStyle={{ color: "#94a3b8" }} />
                    <Line type="monotone" dataKey="payout" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316" }} />
                    <Line type="monotone" dataKey="risk"   stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

          </div>
        )}

        {/* ── PREDICT TAB ── */}
        {tab === "predict" && (
          <div style={s.content}>
            <div style={s.predictCard}>
              <div style={s.chartTitle}>Worker Risk Assessment</div>

              <div style={s.formGrid}>
                {[
                  { name: "worker_id",         label: "Worker ID",            type: "text",   ph: "e.g. W001" },
                  { name: "city",              label: "City",                 type: "text",   ph: "e.g. Chennai" },
                  { name: "daily_income",      label: "Daily Income (₹)",     type: "number", ph: "e.g. 500" },
                  { name: "disaster_severity", label: "Disaster Severity (0–10)", type: "number", ph: "e.g. 7.5" },
                  { name: "days_affected",     label: "Days Affected",        type: "number", ph: "e.g. 14" },
                ].map(f => (
                  <div key={f.name} style={s.field}>
                    <label style={s.fieldLabel}>{f.label}</label>
                    <input type={f.type} placeholder={f.ph}
                      value={form[f.name]}
                      onChange={e => setForm({ ...form, [f.name]: e.target.value })}
                      style={s.input} />
                  </div>
                ))}
              </div>

              {error && <div style={s.errorBox}>⚠️ {error}</div>}

              <button onClick={handlePredict} disabled={loading} style={s.submitBtn}>
                {loading ? "⏳ Analyzing..." : "🔍 Calculate Payout"}
              </button>

              {result && (
                <div style={{
                  ...s.resultBox,
                  borderColor: result.status === "approved" ? "#22c55e" : "#ef4444"
                }}>
                  <div style={{
                    fontSize: 20, fontWeight: "bold", marginBottom: 16,
                    color: result.status === "approved" ? "#22c55e" : "#ef4444"
                  }}>
                    {result.status === "approved" ? "✅ Payout Approved" : "❌ Claim Rejected"}
                  </div>

                  {result.status === "approved" ? (
                    <div style={s.resultGrid}>
                      {[
                        { l: "Worker ID",    v: result.worker_id },
                        { l: "City",         v: result.city },
                        { l: "Risk Score",   v: result.risk_score },
                        { l: "Income Loss",  v: `₹${result.predicted_income_loss}` },
                        { l: "Payout",       v: `₹${result.payout_amount}`, big: true },
                      ].map(item => (
                        <div key={item.l} style={s.resultItem}>
                          <div style={s.resultLabel}>{item.l}</div>
                          <div style={{ ...s.resultVal, color: item.big ? "#fbbf24" : "#f1f5f9", fontSize: item.big ? 22 : 16 }}>
                            {item.v}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: "#f87171" }}>Reason: {result.reason}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {tab === "history" && (
          <div style={s.content}>
            <div style={s.chartCardWide}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={s.chartTitle}>All Payout Records</div>
                <button onClick={fetchRecords} style={s.refreshBtn}>↻ Refresh</button>
              </div>

              {records.length === 0 ? (
                <NoData />
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        {["ID","Worker","City","Risk Score","Income Loss","Payout","Status","Date"].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map(r => (
                        <tr key={r.id} style={s.tr}>
                          <td style={s.td}>{r.id}</td>
                          <td style={s.td}>{r.worker_id}</td>
                          <td style={s.td}>{r.city}</td>
                          <td style={s.td}>{r.risk_score?.toFixed(3)}</td>
                          <td style={s.td}>₹{r.income_loss?.toFixed(2)}</td>
                          <td style={s.td}>₹{r.payout?.toFixed(2)}</td>
                          <td style={s.td}>
                            <span style={{
                              padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: "bold",
                              background: r.status === "approved" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                              color: r.status === "approved" ? "#22c55e" : "#ef4444",
                            }}>{r.status}</span>
                          </td>
                          <td style={s.td}>{r.created_at?.slice(0,10)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function NoData() {
  return <div style={{ color: "#334155", textAlign: "center", padding: "40px 0", fontSize: 14 }}>
    No data yet. Run a prediction first.
  </div>;
}

const s = {
  page: { display: "flex", minHeight: "100vh", background: "#060d1a", fontFamily: "'Courier New', monospace", color: "#f1f5f9" },
  sidebar: { width: 200, minHeight: "100vh", background: "#0a1628", borderRight: "1px solid #1e3a5f", display: "flex", flexDirection: "column", padding: "28px 0" },
  sideTop: { display: "flex", alignItems: "center", gap: 10, padding: "0 20px 28px", borderBottom: "1px solid #1e3a5f" },
  logo: { fontSize: 28 },
  logoText: { fontSize: 13, fontWeight: "bold", color: "#f97316", lineHeight: 1.3, letterSpacing: 1 },
  nav: { flex: 1, padding: "20px 12px", display: "flex", flexDirection: "column", gap: 6 },
  navItem: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "transparent", border: "none", color: "#64748b", cursor: "pointer", borderRadius: 8, fontSize: 14, textAlign: "left", width: "100%" },
  navItemActive: { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.3)", color: "#f97316", cursor: "pointer", borderRadius: 8, fontSize: 14, textAlign: "left", width: "100%", fontWeight: "bold" },
  logoutBtn: { margin: "0 12px", padding: "10px", background: "transparent", border: "1px solid #1e3a5f", color: "#64748b", cursor: "pointer", borderRadius: 8, fontSize: 13 },
  main: { flex: 1, display: "flex", flexDirection: "column", overflow: "auto" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 32px", borderBottom: "1px solid #1e3a5f", background: "#0a1628" },
  pageTitle: { fontSize: 20, fontWeight: "bold", color: "#f1f5f9" },
  pageSub: { fontSize: 12, color: "#475569", marginTop: 2 },
  badge: { background: "rgba(34,197,94,0.15)", color: "#22c55e", padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: "bold", border: "1px solid rgba(34,197,94,0.3)" },
  content: { padding: "28px 32px", flex: 1 },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  statCard: { background: "#0f172a", border: "1px solid", borderRadius: 12, padding: "22px 20px", textAlign: "center" },
  statVal: { fontSize: 28, fontWeight: "bold", marginBottom: 4 },
  statLabel: { fontSize: 12, color: "#64748b", letterSpacing: 1 },
  chartsRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 },
  chartCard: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "22px" },
  chartCardWide: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "22px", marginBottom: 16 },
  chartTitle: { fontSize: 14, fontWeight: "bold", color: "#f97316", marginBottom: 16, letterSpacing: 1, textTransform: "uppercase" },
  predictCard: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: "28px", maxWidth: 700 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  fieldLabel: { fontSize: 12, color: "#64748b", letterSpacing: 1, textTransform: "uppercase" },
  input: { padding: "11px 14px", background: "#060d1a", border: "1px solid #1e3a5f", borderRadius: 8, color: "#f1f5f9", fontSize: 14, outline: "none", fontFamily: "'Courier New', monospace" },
  errorBox: { background: "#450a0a", border: "1px solid #ef4444", color: "#fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 },
  submitBtn: { padding: "12px 32px", background: "linear-gradient(135deg, #f97316, #ea580c)", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 20px rgba(249,115,22,0.3)" },
  resultBox: { marginTop: 24, border: "2px solid", borderRadius: 12, padding: 24, background: "#060d1a" },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 16 },
  resultItem: { display: "flex", flexDirection: "column", gap: 4 },
  resultLabel: { fontSize: 11, color: "#64748b", letterSpacing: 1, textTransform: "uppercase" },
  resultVal: { fontWeight: "bold" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { textAlign: "left", padding: "10px 14px", color: "#64748b", borderBottom: "1px solid #1e293b", fontWeight: "600", whiteSpace: "nowrap", fontSize: 11, letterSpacing: 1, textTransform: "uppercase" },
  tr: { borderBottom: "1px solid #0f172a" },
  td: { padding: "11px 14px", color: "#cbd5e1", whiteSpace: "nowrap" },
  refreshBtn: { padding: "7px 16px", background: "transparent", border: "1px solid #1e3a5f", color: "#64748b", borderRadius: 6, cursor: "pointer", fontSize: 13 },
};
