import pg from 'pg';

const { Pool } = pg;
const DATABASE_URL = process.env.DATABASE_URL || '';
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const ALPACA_API_KEY = process.env.ALPACA_API_KEY || '';
const ALPACA_SECRET_KEY = process.env.ALPACA_SECRET_KEY || '';
const ALPACA_DATA_BASE_URL = process.env.ALPACA_DATA_BASE_URL || 'https://data.alpaca.markets';

const defaults = [
  { symbol: 'SPY', name: 'S&P 500 (SPY)' },
  { symbol: 'MSFT', name: 'Microsoft Corp.' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'AVGO', name: 'Broadcom Inc.' },
  { symbol: 'MA', name: 'Mastercard Inc.' },
  { symbol: 'ANET', name: 'Arista Networks Inc.' },
  { symbol: 'PANW', name: 'Palo Alto Networks Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'NOW', name: 'ServiceNow Inc.' }
];

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
      console.log(`Compounder defaults: seeded ${item.symbol}`);
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
