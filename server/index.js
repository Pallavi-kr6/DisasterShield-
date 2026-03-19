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
import { localFindOne, localInsert, localSelect, localUpsertById } from './localStore.js';
import { getWeatherForCity } from './services/weatherService.js';
import { getLocationFromRequest, reverseGeocodeCity } from './services/locationService.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 8000;
const AI_URL = process.env.AI_URL || 'http://127.0.0.1:9000';

// NEW: minimal input; weather + delivery are auto-fetched/simulated
const analyzeSchema = z.object({
  city: z.string().min(1).optional(),
  lat: z.number().nullable().optional(),
  lon: z.number().nullable().optional(),
  expected_income: z.number().min(0).default(5000),
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/', (_req, res) => {
  return res.json({
    message: 'DisasterShield AI Node API',
    health: '/health',
    routes: [
      'POST /api/auth/register',
      'POST /api/auth/login',
      'GET /api/auth/me',
      'POST /api/analyze',
      'POST /api/trigger',
      'POST /api/premium',
      'POST /api/fraud-check',
      'GET /api/claims/:user_id',
      'GET /api/transactions/:user_id',
      'GET /api/mock/weather',
      'GET /api/mock/payment',
    ],
  });
});

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
  if (!supabase) {
    // Local demo fallback (persists to server/local_store.json)
    const existing = localFindOne('users', (u) => u.email === parsed.data.email.toLowerCase());
    if (existing) return res.status(400).json({ detail: 'Email already registered' });
    const password_hash = await bcrypt.hash(parsed.data.password, 10);
    const user = {
      id: cryptoRandomId(),
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      password_hash,
      role: 'user',
      city: parsed.data.city,
      platform: parsed.data.platform,
    };
    localInsert('users', user);
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city, platform: user.platform };
    const token = signToken(safeUser);
    return res.json({ token, user: safeUser, storage: 'local' });
  }

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
  if (!supabase) {
    const user = localFindOne('users', (u) => u.email === parsed.data.email.toLowerCase());
    if (!user) return res.status(401).json({ detail: 'Invalid credentials' });
    const ok = await bcrypt.compare(parsed.data.password, user.password_hash || '');
    if (!ok) return res.status(401).json({ detail: 'Invalid credentials' });
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role, city: user.city, platform: user.platform };
    const token = signToken(safeUser);
    return res.json({ token, user: safeUser, storage: 'local' });
  }

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
  const parsed = analyzeSchema.safeParse(req.body || {});
  if (!parsed.success) return res.status(422).json({ detail: parsed.error.issues });

  try {
    const supabase = getSupabase();

    // 1) Determine city (prefer body, then user profile)
    const userCity = req.body?.city || req.user?.city || req.user?.name ? null : null;
    const city = String(req.body?.city || req.user?.city || 'Mumbai');

    // 2) Fetch weather (OpenWeather or mock fallback)
    const weather = await getWeatherForCity(city);

    // 3) Simulate delivery drop (simple heuristic: higher with worse conditions)
    const delivery_drop = clamp01(
      (Number(weather.rainfall) / 150) * 0.45 +
      (Number(weather.aqi) / 300) * 0.25 +
      (Math.max(0, Number(weather.temperature) - 35) / 10) * 0.20 +
      0.05,
    );

    // 4) Location validation (anti-spoofing)
    // Prefer GPS-based detected city from lat/lon; fallback to header/ip.
    const gps = await reverseGeocodeCity(parsed.data.lat, parsed.data.lon);
    const loc = await getLocationFromRequest(req);
    const detected_city = (gps.detected_city || loc.city || null);
    const location_mismatch = !!(detected_city && detected_city.toLowerCase() !== city.toLowerCase());

    // 5) Call AI pipeline with auto-fed values
    const aiPayload = {
      city,
      rainfall: Number(weather.rainfall),
      temperature: Number(weather.temperature),
      aqi: Number(weather.aqi),
      delivery_drop,
      expected_income: Number(parsed.data.expected_income),
    };
    const r = await axios.post(`${AI_URL}/predict-all`, aiPayload, { timeout: 15_000 });
    const ml = r.data;

    // 6) Adversarial fraud enhancements (market crash defenses)
    const now = Date.now();
    const recentClaims = localSelect('claims', () => true, { limit: 500 });
    const windowMs = 5 * 60 * 1000;
    const recentWindow = recentClaims.filter((c) => {
      const ts = Date.parse(c.timestamp || c.created_at || '');
      return Number.isFinite(ts) && (now - ts) <= windowMs;
    });
    const spikeCount = recentWindow.length;
    const abnormal_claim_spike = spikeCount >= 10;

    const identical_behavior_cluster = recentWindow.filter((c) => {
      return (
        String(c.city || '').toLowerCase() === city.toLowerCase()
        && Math.abs(Number(c.delivery_drop || 0) - delivery_drop) < 0.001
        && Math.abs(Number(c.aqi || 0) - Number(weather.aqi)) < 1
      );
    }).length >= 5;

    // Repeat / rapid fraud tracking (per user)
    const userRecent = recentWindow.filter((c) => c.user_id === req.user.sub);
    const rapid_claims = userRecent.length >= 3;

    let rejected_claims = 0;
    if (supabase) {
      const { data: rej } = await supabase
        .from('claims')
        .select('id')
        .eq('user_id', req.user.sub)
        .eq('decision', 'REJECTED')
        .limit(50);
      rejected_claims = (rej || []).length;
    } else {
      rejected_claims = localSelect('claims', (c) => c.user_id === req.user.sub && c.decision === 'REJECTED', { limit: 200 }).length;
    }
    const repeat_fraud = rejected_claims >= 3;

    const repeated_trigger_claims = userRecent.filter((c) => Number(c.trigger_score || 0) >= 5).length >= 3;

    const penalties = {
      // Stronger penalty per requirement
      location_mismatch_penalty: location_mismatch ? 0.4 : 0,
      repeat_fraud_penalty: repeat_fraud ? 0.3 : 0,
      rapid_claims_penalty: rapid_claims ? 0.2 : 0,
      spike_penalty: abnormal_claim_spike ? 0.15 : 0,
      cluster_penalty: identical_behavior_cluster ? 0.15 : 0,
      repeated_penalty: repeated_trigger_claims ? 0.10 : 0,
    };

    const enhanced_fraud_score = clamp01(
      Number(ml.fraud_score || 0) +
      penalties.location_mismatch_penalty +
      penalties.repeat_fraud_penalty +
      penalties.rapid_claims_penalty +
      penalties.spike_penalty +
      penalties.cluster_penalty +
      penalties.repeated_penalty,
    );
    const enhanced_fraud_flagged = enhanced_fraud_score > 0.5;

    // Pull minimal user history (past fraud) for trust scoring
    let user_history = { past_fraud: false };
    if (supabase) {
      const { data: recentClaims } = await supabase
        .from('claims')
        .select('fraud_flag')
        .eq('user_id', req.user.sub)
        .order('created_at', { ascending: false })
        .limit(20);
      user_history.past_fraud = (recentClaims || []).some((c) => c.fraud_flag === true);
    } else {
      const recent = localSelect('claims', (c) => c.user_id === req.user.sub, { limit: 20 });
      user_history.past_fraud = (recent || []).some((c) => c.fraud_flag === true);
    }

    const decision = computeDecision({
      trigger_score: ml.trigger_score,
      triggered: ml.triggered,
      fraud_score: enhanced_fraud_score,
      predicted_loss: ml.predicted_loss,
      payout_amount: ml.payout_amount,
      delivery_drop,
      rainfall: aiPayload.rainfall,
      aqi: aiPayload.aqi,
      expected_income: aiPayload.expected_income,
      user_history,
    });

    // Persist claim + transaction (if payout > 0)
    if (supabase) {
      const now = new Date().toISOString();
      // Persist fraud history on user (fraud_count + last_claim_time)
      const fraud_increment = (location_mismatch || repeat_fraud || rapid_claims) ? 1 : 0;
      const { data: urow } = await supabase
        .from('users')
        .select('fraud_count')
        .eq('id', req.user.sub)
        .maybeSingle();
      const nextFraudCount = Number(urow?.fraud_count || 0) + fraud_increment;
      await supabase.from('users').update({
        last_claim_time: now,
        fraud_count: nextFraudCount,
      }).eq('id', req.user.sub);

      const { data: claim, error: claimErr } = await supabase
        .from('claims')
        .insert([{
          user_id: req.user.sub,
          detected_city,
          fraud_signals: {
            location_mismatch,
            repeat_fraud,
            rapid_claims,
            abnormal_claim_spike,
            identical_behavior_cluster,
            repeated_trigger_claims,
          },
          penalties_applied: penalties,
          risk_level: ml.risk_level,
          predicted_loss: ml.predicted_loss,
          payout_amount: ml.payout_amount,
          trigger_score: ml.trigger_score,
          fraud_score: enhanced_fraud_score,
          fraud_flag: !!enhanced_fraud_flagged,
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
    if (!supabase) {
      const now = new Date().toISOString();
      const claimId = cryptoRandomId();
      const user = localFindOne('users', (u) => u.id === req.user.sub);
      if (user) {
        const fraud_increment = (location_mismatch || repeat_fraud || rapid_claims) ? 1 : 0;
        localUpsertById('users', 'id', {
          ...user,
          last_claim_time: now,
          fraud_count: Number(user.fraud_count || 0) + fraud_increment,
        });
      }
      localInsert('claims', {
        id: claimId,
        user_id: req.user.sub,
        city,
        rainfall: aiPayload.rainfall,
        temperature: aiPayload.temperature,
        aqi: aiPayload.aqi,
        delivery_drop,
        detected_city,
        fraud_signals: {
          location_mismatch,
          repeat_fraud,
          rapid_claims,
          abnormal_claim_spike,
          identical_behavior_cluster,
          repeated_trigger_claims,
        },
        penalties_applied: penalties,
        risk_level: ml.risk_level,
        predicted_loss: ml.predicted_loss,
        payout_amount: ml.payout_amount,
        trigger_score: ml.trigger_score,
        fraud_score: enhanced_fraud_score,
        fraud_flag: !!enhanced_fraud_flagged,
        trust_score: decision.trust_score,
        decision: decision.decision,
        final_payout: decision.final_payout,
        timestamp: now,
        created_at: now,
      });
      if (decision.final_payout > 0) {
        localInsert('transactions', {
          id: cryptoRandomId(),
          user_id: req.user.sub,
          claim_id: claimId,
          payout_amount: decision.final_payout,
          status: 'PAID',
          timestamp: now,
        });
      }
    }

    res.json({
      ...ml,
      fraud_score: Number(enhanced_fraud_score.toFixed(4)),
      fraud_flagged: !!enhanced_fraud_flagged,
      fraud_signals: {
        location_mismatch,
        repeat_fraud,
        rapid_claims,
        abnormal_claim_spike,
        identical_behavior_cluster,
        repeated_trigger_claims,
        ...penalties,
      },
      detected_city,
      weather: {
        rainfall: aiPayload.rainfall,
        temperature: aiPayload.temperature,
        aqi: aiPayload.aqi,
        source: weather.source,
      },
      delivery_drop,
      ...decision,
    });
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

// 3) POST /api/trigger — simulate disaster event and auto payout (user only, persisted)
app.post('/api/trigger', verifyToken, checkRole('user'), async (req, res) => {
  // Request can optionally override city/platform/expected_income
  const schema = z.object({
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

  // Trust decision (same logic as /api/analyze)
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
    trigger_score: ai.trigger_score,
    triggered: ai.triggered,
    fraud_score: ai.fraud_score,
    predicted_loss: ai.predicted_loss,
    payout_amount: ai.payout_amount,
    delivery_drop: analyzePayload.delivery_drop,
    rainfall: analyzePayload.rainfall,
    aqi: analyzePayload.aqi,
    expected_income: analyzePayload.expected_income,
    user_history,
  });

  const approved = decision.decision === 'APPROVED' || decision.decision === 'PARTIAL';
  const payout_amount = approved ? Number(decision.final_payout || 0) : 0;

  // Simulate payment if approved
  const payment = approved ? mockPayment({ amount: payout_amount }) : { status: 'SKIPPED' };

  // Persist (Supabase if configured; otherwise return-only)
  if (supabase) {
    const now = new Date().toISOString();
    await supabase.from('risk_logs').insert([{
      user_id: req.user.sub,
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

    const { data: claim } = await supabase.from('claims').insert([{
      user_id: req.user.sub,
      risk_level: ai?.risk_level || null,
      predicted_loss: ai?.predicted_loss ?? null,
      payout_amount: ai?.payout_amount ?? null,
      trigger_score: ai?.trigger_score ?? null,
      fraud_score: ai?.fraud_score ?? null,
      fraud_flag: !!ai?.fraud_flagged,
      trust_score: decision.trust_score,
      decision: decision.decision,
      final_payout: payout_amount,
      timestamp: now,
      created_at: now,
    }]).select('id').single();

    if (payout_amount > 0) {
      await supabase.from('transactions').insert([{
        user_id: req.user.sub,
        claim_id: claim?.id || null,
        payout_amount,
        status: payment.status === 'SUCCESS' ? 'PAID' : 'PAYMENT_FAILED',
        timestamp: now,
      }]);
    }
  }

  return res.json({
    event: { ...analyzePayload, ...weather },
    ai: { ...ai, ...decision },
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
  if (!supabase) {
    const claims = localSelect('claims', (c) => c.user_id === userId, { limit: 200 });
    return res.json({ claims });
  }

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
  if (!supabase) {
    const transactions = localSelect('transactions', (t) => t.user_id === userId, { limit: 200 });
    return res.json({ transactions });
  }

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

function cryptoRandomId() {
  // small, readable id for demo storage
  return `id_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

function clamp01(x) {
  const n = Number(x);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
