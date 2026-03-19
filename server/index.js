import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { z } from 'zod';
import { getSupabase } from './supabase.js';
import {
  computePremium,
  premiumRequestSchema,
} from './premium.js';
import {
  mockWeather,
  mockDeliveryDrop,
  mockPayment,
} from './mocks.js';
import bcrypt from 'bcryptjs';
import { signToken, verifyToken, checkRole } from './auth.js';
import { computeDecision } from './services/decisionEngine.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8000;
const AI_URL = process.env.AI_URL || 'http://127.0.0.1:9000';

const analyzeSchema = z.object({
  city: z.string().min(1),
  rainfall: z.number(),
  temperature: z.number(),
  aqi: z.number(),
  delivery_drop: z.number().min(0).max(1),
  expected_income: z.number().min(0),
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// -----------------------------
// AUTH
// -----------------------------
const registerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(6),
  city: z.string().min(1),
  platform: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ detail: 'Supabase not configured' });

  const password_hash = await bcrypt.hash(parsed.data.password, 10);

  const { data, error } = await supabase
    .from('users')
    .insert([{
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password_hash,
      role: 'user',
      city: parsed.data.city,
      platform: parsed.data.platform,
    }])
    .select('id,name,email,role,city,platform')
    .single();

  if (error) return res.status(400).json({ detail: error.message });

  const token = signToken(data);
  return res.json({ token, user: data });
});

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ detail: 'Supabase not configured' });

  const { data: user, error } = await supabase
    .from('users')
    .select('id,name,email,role,city,platform,password_hash')
    .eq('email', parsed.data.email.toLowerCase())
    .maybeSingle();

  if (error) return res.status(400).json({ detail: error.message });
  if (!user) return res.status(401).json({ detail: 'Invalid credentials' });

  const ok = await bcrypt.compare(parsed.data.password, user.password_hash || '');
  if (!ok) return res.status(401).json({ detail: 'Invalid credentials' });

  const safeUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    city: user.city,
    platform: user.platform,
  };
  const token = signToken(safeUser);
  return res.json({ token, user: safeUser });
});

app.get('/api/auth/me', verifyToken, async (req, res) => {
  return res.json({ user: req.user });
});

// 1) POST /api/analyze — calls Python /predict-all
app.post('/api/analyze', verifyToken, checkRole('user'), async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  try {
    const r = await axios.post(`${AI_URL}/predict-all`, parsed.data, { timeout: 15_000 });
    const ml = r.data;

    // Pull minimal user history (past fraud) for trust scoring
    const supabase = getSupabase();
    let user_history = { past_fraud: false };
    if (supabase) {
      const { data: recentClaims } = await supabase
        .from('claims')
        .select('fraud_flag')
        .eq('user_id', req.user.sub)
        .order('created_at', { ascending: false })
        .limit(20);
      user_history.past_fraud = (recentClaims || []).some((c) => c.fraud_flag === true);
    }

    const decision = computeDecision({
      trigger_score: ml.trigger_score,
      triggered: ml.triggered,
      fraud_score: ml.fraud_score,
      predicted_loss: ml.predicted_loss,
      payout_amount: ml.payout_amount,
      delivery_drop: parsed.data.delivery_drop,
      rainfall: parsed.data.rainfall,
      aqi: parsed.data.aqi,
      expected_income: parsed.data.expected_income,
      user_history,
    });

    // Persist claim + transaction (if payout > 0)
    if (supabase) {
      const now = new Date().toISOString();
      const { data: claim, error: claimErr } = await supabase
        .from('claims')
        .insert([{
          user_id: req.user.sub,
          risk_level: ml.risk_level,
          predicted_loss: ml.predicted_loss,
          payout_amount: ml.payout_amount,
          trigger_score: ml.trigger_score,
          fraud_score: ml.fraud_score,
          fraud_flag: !!ml.fraud_flagged,
          trust_score: decision.trust_score,
          decision: decision.decision,
          final_payout: decision.final_payout,
          timestamp: now,
          created_at: now,
        }])
        .select('id')
        .single();

      if (!claimErr && decision.final_payout > 0) {
        await supabase.from('transactions').insert([{
          user_id: req.user.sub,
          claim_id: claim?.id || null,
          payout_amount: decision.final_payout,
          status: 'PAID',
          timestamp: now,
        }]);
      }
    }

    res.json({ ...ml, ...decision });
  } catch (e) {
    res.status(502).json({ error: 'AI_SERVICE_ERROR', detail: e?.message || String(e) });
  }
});

// 2) POST /api/premium — weekly premium calculator
app.post('/api/premium', async (req, res) => {
  const parsed = premiumRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  const output = computePremium(parsed.data);
  res.json(output);
});

// 3) POST /api/trigger — simulate disaster event and auto payout
app.post('/api/trigger', async (req, res) => {
  // Request can optionally override city/platform/expected_income
  const schema = z.object({
    user_id: z.string().optional(),
    name: z.string().optional(),
    city: z.string().default('Mumbai'),
    platform: z.enum(['ZOMATO_SWIGGY', 'ZEPTO_BLINKIT', 'AMAZON_FLIPKART']).default('ZOMATO_SWIGGY'),
    expected_income: z.number().min(0).default(5000),
  });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  // Mock “heavy rain” event
  const weather = mockWeather({ city: parsed.data.city, mode: 'HEAVY_RAIN' });
  const delivery_drop = mockDeliveryDrop({ mode: 'HEAVY_RAIN' });

  const analyzePayload = {
    city: parsed.data.city,
    rainfall: weather.rainfall,
    temperature: weather.temperature,
    aqi: weather.aqi,
    delivery_drop,
    expected_income: parsed.data.expected_income,
  };

  let ai;
  try {
    const r = await axios.post(`${AI_URL}/predict-all`, analyzePayload, { timeout: 15_000 });
    ai = r.data;
  } catch (e) {
    return res.status(502).json({ error: 'AI_SERVICE_ERROR', detail: e?.message || String(e) });
  }

  const approved = Boolean(ai?.triggered) && !Boolean(ai?.fraud_flagged);
  const payout_amount = approved ? Number(ai?.payout_amount || 0) : 0;

  // Simulate payment if approved
  const payment = approved ? mockPayment({ amount: payout_amount }) : { status: 'SKIPPED' };

  // Persist (Supabase if configured; otherwise return-only)
  const supabase = getSupabase();
  if (supabase) {
    const now = new Date().toISOString();
    await supabase.from('risk_logs').insert([{
      user_id: parsed.data.user_id || null,
      city: analyzePayload.city,
      rainfall: analyzePayload.rainfall,
      temperature: analyzePayload.temperature,
      aqi: analyzePayload.aqi,
      delivery_drop: analyzePayload.delivery_drop,
      risk_level: ai?.risk_level || null,
      trigger_score: ai?.trigger_score ?? null,
      triggered: !!ai?.triggered,
      fraud_flagged: !!ai?.fraud_flagged,
      created_at: now,
    }]);

    await supabase.from('transactions').insert([{
      user_id: parsed.data.user_id || null,
      payout_amount,
      status: approved ? 'PAID' : 'NOT_PAID',
      timestamp: now,
    }]);

    await supabase.from('claims').insert([{
      user_id: parsed.data.user_id || null,
      trigger_score: ai?.trigger_score ?? null,
      payout: payout_amount,
      fraud_flag: !!ai?.fraud_flagged,
      created_at: now,
    }]);
  }

  return res.json({
    event: { ...analyzePayload, ...weather },
    ai,
    approved,
    payout_amount,
    payment,
  });
});

// 4) POST /api/fraud-check — return fraud_flagged
app.post('/api/fraud-check', async (req, res) => {
  const parsed = analyzeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  try {
    const r = await axios.post(`${AI_URL}/predict-all`, parsed.data, { timeout: 15_000 });
    res.json({ fraud_flagged: !!r.data?.fraud_flagged, fraud_score: r.data?.fraud_score });
  } catch (e) {
    res.status(502).json({ error: 'AI_SERVICE_ERROR', detail: e?.message || String(e) });
  }
});

// -----------------------------
// Persistence APIs (history)
// -----------------------------
app.get('/api/claims/:user_id', verifyToken, async (req, res) => {
  const userId = String(req.params.user_id);
  // user can only read their own; admin can read all
  if (req.user.role !== 'admin' && req.user.sub !== userId) {
    return res.status(403).json({ detail: 'Forbidden' });
  }
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ detail: 'Supabase not configured' });

  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(200);
  if (error) return res.status(400).json({ detail: error.message });
  return res.json({ claims: data || [] });
});

app.get('/api/transactions/:user_id', verifyToken, async (req, res) => {
  const userId = String(req.params.user_id);
  if (req.user.role !== 'admin' && req.user.sub !== userId) {
    return res.status(403).json({ detail: 'Forbidden' });
  }
  const supabase = getSupabase();
  if (!supabase) return res.status(500).json({ detail: 'Supabase not configured' });

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(200);
  if (error) return res.status(400).json({ detail: error.message });
  return res.json({ transactions: data || [] });
});

// Mock APIs
app.get('/api/mock/weather', (req, res) => {
  const city = String(req.query.city || 'Mumbai');
  const mode = String(req.query.mode || 'NORMAL');
  res.json(mockWeather({ city, mode }));
});

app.get('/api/mock/payment', (req, res) => {
  const amount = Number(req.query.amount || 0);
  res.json(mockPayment({ amount }));
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://127.0.0.1:${PORT} (AI_URL=${AI_URL})`);
});

