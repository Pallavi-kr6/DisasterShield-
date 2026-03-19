import { useEffect, useMemo, useState } from 'react';
import { api, toDisplayError } from '../api.js';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

const platformOptions = [
  { value: 'ZOMATO_SWIGGY', label: 'Zomato / Swiggy', base: 35 },
  { value: 'ZEPTO_BLINKIT', label: 'Zepto / Blinkit', base: 30 },
  { value: 'AMAZON_FLIPKART', label: 'Amazon / Flipkart', base: 40 },
];

export function WorkerDashboard() {
  const [form, setForm] = useState({
    city: 'Mumbai',
    rainfall: 110,
    temperature: 38,
    aqi: 240,
    delivery_drop: 0.55,
    expected_income: 5000,
    platform: 'ZOMATO_SWIGGY',
    coverage_pct: 0.7,
    fraud_history: 'NONE',
  });

  const [ai, setAi] = useState(null);
  const [premium, setPremium] = useState(null);
  const [eventResult, setEventResult] = useState(null);
  const [history, setHistory] = useState({ claims: [], transactions: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const savingsData = useMemo(() => {
    const predictedLoss = Number(ai?.predicted_loss || 0);
    const payout = Number(ai?.payout_amount || 0);
    const premiumWeekly = Number(premium?.weekly_premium || 0);
    const netSaved = Math.max(0, payout - premiumWeekly);
    return [
      { name: 'Without Insurance', value: predictedLoss },
      { name: 'With Insurance (Net)', value: Math.max(0, predictedLoss - payout + premiumWeekly) },
      { name: 'You Saved', value: netSaved },
    ];
  }, [ai, premium]);

  async function runAnalyze() {
    setLoading(true);
    setError('');
    setEventResult(null);
    try {
      const r = await api.post('/api/analyze', {
        city: form.city,
        rainfall: Number(form.rainfall),
        temperature: Number(form.temperature),
        aqi: Number(form.aqi),
        delivery_drop: Number(form.delivery_drop),
        expected_income: Number(form.expected_income),
      });
      setAi(r.data);

      const p = await api.post('/api/premium', {
        platform: form.platform,
        city: form.city,
        coverage_pct: Number(form.coverage_pct),
        risk_level: r.data.risk_level,
        trigger_rate: 0.3,
        fraud_history: form.fraud_history,
      });
      setPremium(p.data);
      await fetchHistory();
    } catch (e) {
      setError(toDisplayError(e?.response?.data?.detail || e?.response?.data?.error || e?.message));
    } finally {
      setLoading(false);
    }
  }

  async function fetchHistory() {
    try {
      const me = await api.get('/api/auth/me');
      const userId = me.data?.user?.sub;
      if (!userId) return;
      const [c, t] = await Promise.all([
        api.get(`/api/claims/${userId}`),
        api.get(`/api/transactions/${userId}`),
      ]);
      setHistory({ claims: c.data?.claims || [], transactions: t.data?.transactions || [] });
    } catch (e) {
      // silent; dashboard still usable without history
    }
  }

  useEffect(() => {
    fetchHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function triggerDisaster() {
    setLoading(true);
    setError('');
    try {
      const r = await api.post('/api/trigger', {
        city: form.city,
        platform: form.platform,
        expected_income: Number(form.expected_income),
      });
      setEventResult(r.data);
      setAi(r.data.ai);
      await fetchHistory();
    } catch (e) {
      setError(toDisplayError(e?.response?.data?.detail || e?.message));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="card lg:col-span-1">
        <div className="text-sm font-bold tracking-wider text-orange-400 uppercase mb-4">Inputs</div>

        <div className="grid grid-cols-1 gap-3">
          <Field label="City">
            <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Rainfall (mm)">
              <input className="input" type="number" value={form.rainfall}
                onChange={(e) => setForm({ ...form, rainfall: e.target.value })} />
            </Field>
            <Field label="Temperature (°C)">
              <input className="input" type="number" value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: e.target.value })} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="AQI">
              <input className="input" type="number" value={form.aqi}
                onChange={(e) => setForm({ ...form, aqi: e.target.value })} />
            </Field>
            <Field label="Delivery Drop (0–1)">
              <input className="input" type="number" step="0.01" value={form.delivery_drop}
                onChange={(e) => setForm({ ...form, delivery_drop: e.target.value })} />
            </Field>
          </div>

          <Field label="Expected Weekly Income (₹)">
            <input className="input" type="number" value={form.expected_income}
              onChange={(e) => setForm({ ...form, expected_income: e.target.value })} />
          </Field>

          <Field label="Platform">
            <select className="input" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
              {platformOptions.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Coverage %">
              <select className="input" value={form.coverage_pct} onChange={(e) => setForm({ ...form, coverage_pct: Number(e.target.value) })}>
                <option value={0.5}>50%</option>
                <option value={0.6}>60%</option>
                <option value={0.7}>70%</option>
              </select>
            </Field>
            <Field label="Fraud History">
              <select className="input" value={form.fraud_history} onChange={(e) => setForm({ ...form, fraud_history: e.target.value })}>
                <option value="NONE">None</option>
                <option value="LOW">Low</option>
                <option value="HIGH">High</option>
              </select>
            </Field>
          </div>
        </div>

        {error ? (
          <div className="mt-4 rounded-lg border border-red-700 bg-red-950/40 p-3 text-red-200 text-sm">
            {error}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button className="btn-primary flex-1" disabled={loading} onClick={runAnalyze}>
            {loading ? 'Analyzing…' : 'Check Risk'}
          </button>
          <button className="btn-ghost flex-1" disabled={loading} onClick={triggerDisaster}>
            Trigger Disaster Event
          </button>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Kpi title="Risk Level" value={ai?.risk_level || '—'} hint={`High prob: ${ai?.risk_prob_high ?? '—'}`} />
          <Kpi title="Weekly Premium" value={premium ? `₹${premium.weekly_premium}` : '—'} hint={premium?.premium_tier || '—'} />
          <Kpi title="Auto Trigger" value={ai?.trigger_status || (ai?.triggered ? 'TRIGGERED' : '—')} hint={(ai?.trigger_reasons || []).slice(0, 2).join(', ')} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="card">
            <div className="text-sm font-bold tracking-wider text-orange-400 uppercase mb-3">Loss & Payout</div>
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Predicted Income Loss" value={ai ? `₹${ai.predicted_loss}` : '—'} />
              <Stat label="Model Payout Amount" value={ai ? `₹${ai.payout_amount}` : '—'} />
              <Stat label="Fraud Score" value={ai ? String(ai.fraud_score) : '—'} />
              <Stat label="Fraud Flagged" value={ai ? String(ai.fraud_flagged) : '—'} />
              <Stat label="Decision" value={ai ? (ai.decision || '—') : '—'} />
              <Stat label="Final Payout" value={ai ? `₹${ai.final_payout ?? 0}` : '—'} />
            </div>
            {ai?.trust_score != null ? (
              <div className="mt-4">
                <div className="label mb-1">Trust score</div>
                <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-3 bg-orange-500"
                    style={{ width: `${Math.round(Number(ai.trust_score) * 100)}%` }}
                  />
                </div>
                <div className="text-xs text-slate-400 mt-1">{Number(ai.trust_score).toFixed(2)} / 1.00</div>
              </div>
            ) : null}
            {ai?.reason ? (
              <div className="mt-4 text-sm text-slate-300">
                <span className="text-slate-400">Why:</span> {ai.reason}
              </div>
            ) : null}
          </div>

          <div className="card">
            <div className="text-sm font-bold tracking-wider text-orange-400 uppercase mb-3">Savings vs Loss</div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={savingsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: '#0b1220', border: '1px solid #1f2937', color: '#fff' }} />
                  <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 text-slate-300 text-sm">
              {ai && premium ? (
                <>
                  You saved <span className="text-orange-300 font-bold">₹{Math.max(0, Number(ai.payout_amount) - Number(premium.weekly_premium)).toFixed(0)}</span>{' '}
                  with insurance.
                </>
              ) : (
                <>Run “Check Risk” to see savings.</>
              )}
            </div>
          </div>
        </div>

        {eventResult ? (
          <div className="card">
            <div className="text-sm font-bold tracking-wider text-orange-400 uppercase mb-2">Disaster Event Result</div>
            <div className="text-sm text-slate-300">
              Triggered: <b className="text-slate-100">{String(eventResult.ai?.triggered)}</b> · Approved:{' '}
              <b className="text-slate-100">{String(eventResult.approved)}</b> · Payment:{' '}
              <b className="text-slate-100">{eventResult.payment?.status}</b>
            </div>
          </div>
        ) : null}

        <div className="card">
          <div className="text-sm font-bold tracking-wider text-orange-400 uppercase mb-3">Past Claims</div>
          <div className="text-sm text-slate-400 mb-3">
            Total earned from payouts: <b className="text-slate-100">₹{history.transactions.reduce((s, t) => s + Number(t.payout_amount || 0), 0).toFixed(0)}</b>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="text-slate-400">
                <tr>
                  {['Date', 'Risk', 'Decision', 'Trust', 'Final Payout'].map((h) => (
                    <th key={h} className="text-left font-semibold py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(history.claims || []).slice(0, 15).map((c) => (
                  <tr key={c.id} className="border-t border-slate-800">
                    <td className="py-2 pr-3">{String(c.timestamp || c.created_at || '').slice(0, 10)}</td>
                    <td className="py-2 pr-3">{c.risk_level}</td>
                    <td className="py-2 pr-3">{c.decision}</td>
                    <td className="py-2 pr-3">{c.trust_score != null ? Number(c.trust_score).toFixed(2) : '—'}</td>
                    <td className="py-2 pr-3">₹{Number(c.final_payout || 0).toFixed(0)}</td>
                  </tr>
                ))}
                {(history.claims || []).length === 0 ? (
                  <tr><td className="py-4 text-slate-400" colSpan={5}>No claims yet. Run “Check Risk”.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}

function Kpi({ title, value, hint }) {
  return (
    <div className="card">
      <div className="label">{title}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{hint}</div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="label">{label}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
    </div>
  );
}

