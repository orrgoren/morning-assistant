import { readFile, writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import Fuse from 'fuse.js';
import { config } from '../config/index.js';
import { fetchRecentLineItemDescriptions } from './greeninvoice.js';

let cache: string[] = [];
let fuse: Fuse<string>;

function buildFuse(items: string[]) {
  fuse = new Fuse(items, { threshold: 0.4, includeScore: true });
}

export async function initProductCache() {
  try {
    const raw = await readFile(config.productCachePath, 'utf-8');
    cache = JSON.parse(raw) as string[];
    console.log(`[ProductCache] Loaded ${cache.length} items from disk`);
  } catch {
    console.log('[ProductCache] No cache on disk, fetching from GreenInvoice...');
    await refreshProductCache();
    return;
  }
  buildFuse(cache);
}

export async function refreshProductCache(): Promise<number> {
  cache = await fetchRecentLineItemDescriptions(100);
  buildFuse(cache);
  await mkdir(dirname(config.productCachePath), { recursive: true });
  await writeFile(config.productCachePath, JSON.stringify(cache, null, 2), 'utf-8');
  console.log(`[ProductCache] Refreshed: ${cache.length} items`);
  return cache.length;
}

export function getProductSuggestions(query: string, limit = 3): string[] {
  if (!fuse || !query.trim()) return [];
  return fuse
    .search(query, { limit })
    .map((r) => r.item);
}

export function getCacheSize(): number {
  return cache.length;
}
