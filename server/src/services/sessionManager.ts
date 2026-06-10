import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/index.js';

export interface PendingAction {
  kind: 'create_document' | 'convert_document' | 'create_client' | 'record_payment';
  stage: 'confirm_details' | 'confirm_pdf' | 'confirm_client_creation' | 'confirm_payment';
  payload: Record<string, unknown>;
  // populated after preview is generated
  previewBase64?: string;
}

export interface Session {
  id: string;
  history: ChatCompletionMessageParam[];
  pendingAction: PendingAction | null;
  lastActiveAt: Date;
}

const sessions = new Map<string, Session>();

export function getOrCreateSession(id?: string): Session {
  if (id && sessions.has(id)) {
    const s = sessions.get(id)!;
    s.lastActiveAt = new Date();
    return s;
  }
  const newId = id ?? uuidv4();
  const session: Session = {
    id: newId,
    history: [],
    pendingAction: null,
    lastActiveAt: new Date(),
  };
  sessions.set(newId, session);
  return session;
}

export function appendMessage(session: Session, msg: ChatCompletionMessageParam) {
  session.history.push(msg);
  // keep system message + last N messages
  const max = config.session.maxHistoryMessages;
  if (session.history.length > max + 1) {
    const system = session.history[0];
    session.history = [system, ...session.history.slice(-(max))];
  }
}

export function clearPendingAction(session: Session) {
  session.pendingAction = null;
}

// cleanup expired sessions every 15 minutes
setInterval(() => {
  const expiryMs = config.session.expiryHours * 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.lastActiveAt.getTime() > expiryMs) sessions.delete(id);
  }
}, 15 * 60 * 1000);
