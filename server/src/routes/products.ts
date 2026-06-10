import { Router } from 'express';
import { refreshProductCache, getCacheSize } from '../services/productCache.js';

const router = Router();

router.post('/cache/refresh', async (_req, res) => {
  const count = await refreshProductCache();
  res.json({ count });
});

router.get('/cache/size', (_req, res) => {
  res.json({ count: getCacheSize() });
});

export default router;
