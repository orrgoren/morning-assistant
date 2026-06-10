import { Router } from 'express';
import multer from 'multer';
import { transcribeAudio } from '../agent/engine.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio file provided' });
    return;
  }
  if (req.file.size < 1000) {
    res.status(400).json({ error: 'audio_too_short' });
    return;
  }
  try {
    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype);
    res.json({ transcript });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = (err as { status?: number }).status ?? 500;
    res.status(status < 500 ? 400 : 500).json({ error: msg });
  }
});

export default router;
