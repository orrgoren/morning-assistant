import 'dotenv/config';
import { fileURLToPath } from 'url';

function required(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  authToken: required('AUTH_TOKEN'),

  greeninvoice: {
    env: (process.env.GREENINVOICE_ENV ?? 'sandbox') as 'sandbox' | 'production',
    clientId: required('GREENINVOICE_CLIENT_ID'),
    clientSecret: required('GREENINVOICE_CLIENT_SECRET'),
    get tokenUrl() {
      return this.env === 'production'
        ? 'https://api.morning.co/idp/v1/oauth/token'
        : 'https://api.sandbox.morning.dev/idp/v1/oauth/token';
    },
    get apiBase() {
      return this.env === 'production'
        ? 'https://api.greeninvoice.co.il/api/v1'
        : 'https://sandbox.d.greeninvoice.co.il/api/v1';
    },
  },

  openai: {
    apiKey: required('OPENAI_API_KEY'),
    whisperModel: process.env.WHISPER_MODEL ?? 'whisper-1',
    gptModel: process.env.GPT_MODEL ?? 'gpt-4o',
  },

  session: {
    expiryHours: Number(process.env.SESSION_EXPIRY_HOURS ?? 2),
    maxHistoryMessages: Number(process.env.MAX_HISTORY_MESSAGES ?? 50),
  },

  productCachePath: fileURLToPath(new URL('../../data/product-cache.json', import.meta.url)),
};
