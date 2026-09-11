import express from 'express';
import session from 'express-session';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import pg from 'pg';
import connectPgSimple from 'connect-pg-simple';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 10000;
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';
const ALPACA_DATA_BASE_URL = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(48).toString('hex');

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('SESSION_SECRET is not configured; sessions will reset whenever the service restarts.');
}

const pool = DATABASE_URL ? new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false }) : null;

async function migrate() {
  if (!pool) return;
  await pool.query(`
    create table if not exists users (
      id bigserial primary key,
      google_id text unique not null,
      email text unique not null,
      name text,
      avatar_url text,
      role text not null default 'user',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists securities (
      id bigserial primary key,
      symbol text unique not null,
      name text not null,
      exchange text,
      created_at timestamptz not null default now()
    );
    create table if not exists watchlist_items (
      id bigserial primary key,
      user_id bigint references users(id) on delete cascade,
      security_id bigint references securities(id) on delete cascade,
      visibility text not null default 'private',
      created_at timestamptz not null default now(),
      unique(user_id, security_id)
    );
    create table if not exists quote_snapshots (
      id bigserial primary key,
      security_id bigint references securities(id) on delete cascade,
      price numeric,
      low_52w numeric,
      high_52w numeric,
      source text,
      source_timestamp timestamptz,
      ingested_at timestamptz not null default now()
    );
    create index if not exists quote_snapshots_security_time_idx on quote_snapshots(security_id, ingested_at desc);
  `);
}

const PgSession = connectPgSimple(session);
app.use(express.json());
app.set('trust proxy', 1);
app.use(session({
  store: pool ? new PgSession({ pool, createTableIfMissing: true }) : undefined,
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  if (!pool) return done(null, null);
  try {
    const { rows } = await pool.query('select * from users where id=$1', [id]);
    done(null, rows[0] || null);
  } catch (e) { done(e); }
});

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && pool) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${APP_URL}/auth/google/callback`
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = (profile.emails?.[0]?.value || '').toLowerCase();
      const role = ADMIN_EMAIL && email === ADMIN_EMAIL ? 'admin' : 'user';
      const { rows } = await pool.query(`
        insert into users (google_id,email,name,avatar_url,role)
        values ($1,$2,$3,$4,$5)
        on conflict (google_id) do update set email=excluded.email,name=excluded.name,avatar_url=excluded.avatar_url,role=excluded.role,updated_at=now()
        returning *
      `, [profile.id, email, profile.displayName || email, profile.photos?.[0]?.value || null, role]);
      done(null, rows[0]);
    } catch (e) { done(e); }
  }));
}

app.use(passport.initialize());
app.use(passport.session());

function authReady() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && pool);
}
function marketDataReady() {
  return Boolean(ALPACA_API_KEY && ALPACA_SECRET_KEY);
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
  next();
}

app.get('/health', (_req, res) => res.json({ ok: true, database: Boolean(pool), googleAuth: authReady(), marketData: marketDataReady(), marketDataProvider: marketDataReady() ? 'alpaca-iex' : null, now: new Date().toISOString() }));
app.get('/api/config', (req, res) => res.json({ authReady: authReady(), marketDataReady: marketDataReady(), marketDataProvider: marketDataReady() ? 'Alpaca IEX' : null, signedIn: Boolean(req.user), user: req.user ? { name:req.user.name,email:req.user.email,role:req.user.role } : null }));
app.get('/auth/google', (req, res, next) => authReady() ? passport.authenticate('google', { scope: ['profile','email'] })(req,res,next) : res.status(503).send('Google sign-in is being connected.'));
app.get('/auth/google/callback', (req, res, next) => authReady() ? passport.authenticate('google', { failureRedirect: '/?auth=failed' })(req,res,()=>res.redirect('/')) : res.redirect('/'));
app.post('/auth/logout', (req, res) => req.logout(() => { req.session.destroy(()=>res.json({ ok:true })); }));

function alpacaHeaders() {
  if (!marketDataReady()) throw new Error('MARKET_DATA_NOT_CONFIGURED');
  return {
    'APCA-API-KEY-ID': ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
  };
}

let secTickerCache = { loadedAt: 0, rows: [] };
async function getSecTickers() {
  const twelveHours = 12 * 60 * 60 * 1000;
  if (secTickerCache.rows.length && Date.now() - secTickerCache.loadedAt < twelveHours) return secTickerCache.rows;
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': 'Compounder family investing app admin@agentzen.io' }
  });
  if (!r.ok) throw new Error(`SEC_TICKER_SEARCH_${r.status}`);
  const j = await r.json();
  const rows = Object.values(j).map(x => ({ symbol: String(x.ticker || '').toUpperCase(), name: x.title || x.ticker, cik: x.cik_str }));
  secTickerCache = { loadedAt: Date.now(), rows };
  return rows;
}

async function marketSearch(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rows = await getSecTickers();
  const starts = [];
  const contains = [];
  for (const x of rows) {
    const sym = x.symbol.toLowerCase();
    const name = x.name.toLowerCase();
    const item = { symbol:x.symbol, name:x.name, exchange:null, country:'US', type:'Common Stock' };
    if (sym === q || name === q || sym.startsWith(q) || name.startsWith(q)) starts.push(item);
    else if (sym.includes(q) || name.includes(q)) contains.push(item);
    if (starts.length >= 8) break;
  }
  return [...starts, ...contains].slice(0, 8);
}

async function marketQuote(symbol) {
  if (!marketDataReady()) throw new Error('MARKET_DATA_NOT_CONFIGURED');
  const cleanSymbol = symbol.toUpperCase();
  const headers = alpacaHeaders();

  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 370);

  const snapshotUrl = new URL(`/v2/stocks/${encodeURIComponent(cleanSymbol)}/snapshot`, ALPACA_DATA_BASE_URL);
  snapshotUrl.searchParams.set('feed', 'iex');
  const barsUrl = new URL(`/v2/stocks/${encodeURIComponent(cleanSymbol)}/bars`, ALPACA_DATA_BASE_URL);
  barsUrl.searchParams.set('timeframe', '1Day');
  barsUrl.searchParams.set('start', start.toISOString());
  barsUrl.searchParams.set('end', end.toISOString());
  barsUrl.searchParams.set('adjustment', 'all');
  barsUrl.searchParams.set('feed', 'iex');
  barsUrl.searchParams.set('limit', '1000');

  const [snapshotRes, barsRes] = await Promise.all([
    fetch(snapshotUrl, { headers }),
    fetch(barsUrl, { headers })
  ]);

  if (!snapshotRes.ok) throw new Error(`ALPACA_SNAPSHOT_${snapshotRes.status}`);
  if (!barsRes.ok) throw new Error(`ALPACA_BARS_${barsRes.status}`);

  const snapshot = await snapshotRes.json();
  const barsJson = await barsRes.json();
  const bars = Array.isArray(barsJson.bars) ? barsJson.bars : [];
  if (!bars.length) throw new Error('ALPACA_52W_HISTORY_EMPTY');

  const lows = bars.map(b => Number(b.l)).filter(Number.isFinite);
  const highs = bars.map(b => Number(b.h)).filter(Number.isFinite);
  const price = Number(snapshot.latestTrade?.p ?? snapshot.minuteBar?.c ?? snapshot.dailyBar?.c ?? NaN);
  const low = Math.min(...lows);
  const high = Math.max(...highs);
  if (![price, low, high].every(Number.isFinite)) throw new Error('MARKET_DATA_INCOMPLETE');

  const tickers = await getSecTickers();
  const found = tickers.find(x => x.symbol === cleanSymbol);
  const prevClose = Number(snapshot.prevDailyBar?.c ?? NaN);
  const changePct = Number.isFinite(prevClose) && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : NaN;

  return {
    symbol: cleanSymbol,
    name: found?.name || cleanSymbol,
    price,
    low52: low,
    high52: high,
    changePct,
    sourceTimestamp: snapshot.latestTrade?.t || snapshot.minuteBar?.t || new Date().toISOString(),
    source: 'alpaca-iex'
  };
}

app.get('/api/stocks/search', requireAuth, async (req,res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json({ data:[] });
  try { res.json({ data: await marketSearch(q) }); }
  catch (e) { res.status(503).json({ error:e.message, data:[] }); }
});

app.get('/api/stocks/:symbol', requireAuth, async (req,res) => {
  try {
    const q = await marketQuote(req.params.symbol.toUpperCase());
    const distanceAboveLowPct = ((q.price - q.low52) / q.low52) * 100;
    const distanceBelowHighPct = ((q.high52 - q.price) / q.high52) * 100;
    res.json({ ...q, distanceAboveLowPct, distanceBelowHighPct, freshness:'live-iex' });
  } catch(e) { res.status(503).json({ error:e.message, freshness:'unavailable' }); }
});

app.get('/api/watchlist', requireAuth, async (req,res) => {
  if (!pool) return res.status(503).json({ error:'DATABASE_NOT_CONFIGURED' });
  const { rows } = await pool.query(`
    select s.symbol,s.name,s.exchange,w.visibility,
      q.price,q.low_52w as "low52",q.high_52w as "high52",q.source_timestamp as "sourceTimestamp"
    from watchlist_items w join securities s on s.id=w.security_id
    left join lateral (
      select * from quote_snapshots qs where qs.security_id=s.id order by ingested_at desc limit 1
    ) q on true
    where w.user_id=$1 or w.visibility='global'
    order by w.created_at asc
  `,[req.user.id]);
  res.json({ data:rows });
});

app.post('/api/watchlist', requireAuth, async (req,res) => {
  if (!pool) return res.status(503).json({ error:'DATABASE_NOT_CONFIGURED' });
  const symbol = String(req.body.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error:'SYMBOL_REQUIRED' });
  try {
    const quote = await marketQuote(symbol);
    const visibility = req.user.role === 'admin' && req.body.publishToEveryone === true ? 'global' : 'private';
    const sec = await pool.query(`insert into securities(symbol,name) values($1,$2) on conflict(symbol) do update set name=excluded.name returning id`,[symbol,quote.name]);
    const securityId = sec.rows[0].id;
    await pool.query(`insert into watchlist_items(user_id,security_id,visibility) values($1,$2,$3) on conflict(user_id,security_id) do update set visibility=excluded.visibility`,[req.user.id,securityId,visibility]);
    await pool.query(`insert into quote_snapshots(security_id,price,low_52w,high_52w,source,source_timestamp) values($1,$2,$3,$4,$5,$6)`,[securityId,quote.price,quote.low52,quote.high52,quote.source,quote.sourceTimestamp]);
    res.json({ ok:true, visibility, quote });
  } catch(e) { res.status(503).json({ error:e.message }); }
});

app.post('/api/admin/watchlist/:symbol/global', requireAuth, async (req,res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error:'ADMIN_REQUIRED' });
  const symbol = req.params.symbol.toUpperCase();
  await pool.query(`update watchlist_items w set visibility='global' from securities s where w.security_id=s.id and s.symbol=$1 and w.user_id=$2`,[symbol,req.user.id]);
  res.json({ ok:true });
});

app.use(express.static(path.join(__dirname,'public')));
app.get('*', (_req,res) => res.sendFile(path.join(__dirname,'public','index.html')));

migrate().then(() => app.listen(PORT, () => console.log(`Compounder listening on ${PORT}`))).catch(err => { console.error(err); process.exit(1); });
