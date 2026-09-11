import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';
const ALPACA_DATA_BASE_URL = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';

// Strict default policy: only names currently verified as Shariah-compliant
// under AAOIFI-style screening are seeded globally. Questionable/unknown names
// are deliberately excluded until they can be re-verified.
const defaults = [
  { symbol: 'SPUS', name: 'SP Funds S&P 500 Sharia Industry Exclusions ETF' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'MA', name: 'Mastercard Inc.' },
  { symbol: 'ANET', name: 'Arista Networks Inc.' },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'NOW', name: 'ServiceNow Inc.' }
];

// These were previously seeded but are not part of the strict halal default set.
// SPY is a conventional S&P 500 fund. MSFT, GOOGL, META and AMZN are currently
// treated as questionable by the screening source used for this release.
const removeFromGlobal = ['SPY', 'MSFT', 'GOOGL', 'META', 'AMZN'];

if (!DATABASE_URL || !ADMIN_EMAIL) {
  console.log('Compounder defaults: DATABASE_URL or ADMIN_EMAIL missing, skipping seed.');
  process.exit(0);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

function headers() {
  return {
    'APCA-API-KEY-ID': ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': ALPACA_SECRET_KEY
  };
}

async function quote(symbol) {
  if (!ALPACA_API_KEY || !ALPACA_SECRET_KEY) return null;
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 370);

  const snapshotUrl = new URL(`/v2/stocks/${encodeURIComponent(symbol)}/snapshot`, ALPACA_DATA_BASE_URL);
  snapshotUrl.searchParams.set('feed', 'iex');
  const barsUrl = new URL(`/v2/stocks/${encodeURIComponent(symbol)}/bars`, ALPACA_DATA_BASE_URL);
  barsUrl.searchParams.set('timeframe', '1Day');
  barsUrl.searchParams.set('start', start.toISOString());
  barsUrl.searchParams.set('end', end.toISOString());
  barsUrl.searchParams.set('adjustment', 'all');
  barsUrl.searchParams.set('feed', 'iex');
  barsUrl.searchParams.set('limit', '1000');

  const [snapshotRes, barsRes] = await Promise.all([
    fetch(snapshotUrl, { headers: headers() }),
    fetch(barsUrl, { headers: headers() })
  ]);
  if (!snapshotRes.ok || !barsRes.ok) return null;

  const snapshot = await snapshotRes.json();
  const barsJson = await barsRes.json();
  const bars = Array.isArray(barsJson.bars) ? barsJson.bars : [];
  if (!bars.length) return null;

  const lows = bars.map(b => Number(b.l)).filter(Number.isFinite);
  const highs = bars.map(b => Number(b.h)).filter(Number.isFinite);
  const price = Number(snapshot.latestTrade?.p ?? snapshot.minuteBar?.c ?? snapshot.dailyBar?.c ?? NaN);
  const low52 = Math.min(...lows);
  const high52 = Math.max(...highs);
  if (![price, low52, high52].every(Number.isFinite)) return null;

  return {
    price,
    low52,
    high52,
    sourceTimestamp: snapshot.latestTrade?.t || snapshot.minuteBar?.t || new Date().toISOString()
  };
}

async function run() {
  const adminResult = await pool.query('select id from users where lower(email)=$1 limit 1', [ADMIN_EMAIL]);
  if (!adminResult.rows.length) {
    console.log('Compounder defaults: admin user does not exist yet, skipping seed.');
    return;
  }
  const adminId = adminResult.rows[0].id;

  // Remove only the admin's global seed entries. Private user watchlists are not touched.
  if (removeFromGlobal.length) {
    await pool.query(
      `delete from watchlist_items w
       using securities s
       where w.security_id=s.id
         and w.user_id=$1
         and w.visibility='global'
         and s.symbol = any($2::text[])`,
      [adminId, removeFromGlobal]
    );
  }

  for (const item of defaults) {
    try {
      const sec = await pool.query(
        `insert into securities(symbol,name) values($1,$2)
         on conflict(symbol) do update set name=excluded.name
         returning id`,
        [item.symbol, item.name]
      );
      const securityId = sec.rows[0].id;
      await pool.query(
        `insert into watchlist_items(user_id,security_id,visibility)
         values($1,$2,'global')
         on conflict(user_id,security_id) do update set visibility='global'`,
        [adminId, securityId]
      );

      const q = await quote(item.symbol);
      if (q) {
        await pool.query(
          `insert into quote_snapshots(security_id,price,low_52w,high_52w,source,source_timestamp)
           values($1,$2,$3,$4,'alpaca-iex',$5)`,
          [securityId, q.price, q.low52, q.high52, q.sourceTimestamp]
        );
      }
      console.log(`Compounder defaults: seeded halal default ${item.symbol}`);
    } catch (err) {
      console.warn(`Compounder defaults: failed ${item.symbol}: ${err.message}`);
    }
  }
}

run()
  .catch(err => {
    console.error('Compounder defaults seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
