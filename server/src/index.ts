import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config } from './config/index.js';
import { initTokenManager, isTokenValid } from './services/tokenManager.js';
import { initProductCache, getCacheSize } from './services/productCache.js';
import audioRouter from './routes/audio.js';
import chatRouter from './routes/chat.js';
import productsRouter from './routes/products.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

const limiter = rateLimit({ windowMs: 60_000, max: 30 });

// ── Health (no auth) ───────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', tokenValid: isTokenValid(), cacheSize: getCacheSize() });
});

// ── Auth middleware ────────────────────────────────────────────────────────
app.use('/api', (req, res, next) => {
  const token = req.headers['x-auth-token'] ?? req.query.token;
  if (token !== config.authToken) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.use('/api', limiter);

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/audio', audioRouter);
app.use('/api/chat', chatRouter);
app.use('/api/products', productsRouter);

// ── Serve React build in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const clientDist = join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(join(clientDist, 'index.html')));
}

// ── Startup ────────────────────────────────────────────────────────────────
async function start() {
  await initTokenManager();
  await initProductCache();
  app.listen(config.port, () => {
    console.log(`[Server] Running on http://localhost:${config.port}`);
  });
}

start().catch((err) => {
  console.error('Startup failed:', err);
  process.exit(1);
});
