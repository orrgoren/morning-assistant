import { Router } from 'express';
import { runAgentTurn } from '../agent/engine.js';
import {
  getOrCreateSession,
  clearPendingAction,
} from '../services/sessionManager.js';
import {
  previewDocument,
  createDocument,
  createClient,
  getDocument,
  type GIDocumentPayload,
} from '../services/greeninvoice.js';

const router = Router();

// ── POST /api/chat ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const sessionId = req.cookies?.session_id as string | undefined;
  const session = getOrCreateSession(sessionId);

  if (!sessionId || sessionId !== session.id) {
    res.cookie('session_id', session.id, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  const { message } = req.body as { message: string };
  if (!message?.trim()) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  try {
    const result = await runAgentTurn(session, message);
    res.json(result);
  } catch (err) {
    console.error('[chat] runAgentTurn error:', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// ── POST /api/chat/confirm ─────────────────────────────────────────────────
router.post('/confirm', async (req, res) => {
  const sessionId = req.cookies?.session_id as string | undefined;
  if (!sessionId) { res.status(400).json({ error: 'No session' }); return; }
  const session = getOrCreateSession(sessionId);

  const { action, editedPayload } = req.body as {
    action: 'approve' | 'cancel';
    editedPayload?: Record<string, unknown>;
  };

  if (action === 'cancel') {
    clearPendingAction(session);
    try {
      const result = await runAgentTurn(session, 'המשתמש ביטל את הפעולה.');
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
    return;
  }

  const pending = session.pendingAction;
  if (!pending) { res.status(400).json({ error: 'No pending action' }); return; }

  try {

  // ── Stage: confirm_details → generate preview ─────────────────────────
  if (pending.stage === 'confirm_details') {
    const payload = { ...pending.payload, ...editedPayload } as Record<string, unknown>;

    if (pending.kind === 'create_client') {
      // create_client has only one confirmation stage
      const client = await createClient({
        name: payload.name as string,
        taxId: payload.taxId as string | undefined,
        emails: payload.email ? [payload.email as string] : undefined,
        phone: payload.phone as string | undefined,
        city: payload.city as string | undefined,
        address: payload.address as string | undefined,
      });
      clearPendingAction(session);
      const result = await runAgentTurn(
        session,
        `הלקוח "${client.name}" נוצר בהצלחה עם מזהה ${client.id}.`
      );
      res.json({ ...result, newClientId: client.id });
      return;
    }

    // Build GreenInvoice payload for preview
    const giPayload = buildGIPayload(payload, pending.kind);
    const base64 = await previewDocument(giPayload);

    pending.stage = 'confirm_pdf';
    pending.previewBase64 = base64;
    pending.payload = payload;

    res.json({
      reply: 'המסמך מוכן לתצוגה מקדימה. אשר כדי ליצור אותו.',
      actionCard: {
        type: 'confirm_pdf',
        previewBase64: base64,
        documentType: payload.type ?? payload.targetType,
        customerName: payload.customerName,
      },
    });
    return;
  }

  // ── Stage: confirm_pdf → create document ─────────────────────────────
  if (pending.stage === 'confirm_pdf') {
    const giPayload = buildGIPayload(pending.payload, pending.kind);
    const doc = await createDocument(giPayload);
    clearPendingAction(session);

    const docTypeLabel: Record<number, string> = {
      10: 'הצעת מחיר',
      100: 'הזמנה',
      305: 'חשבונית מס',
      400: 'קבלה',
      320: 'חשבונית מס / קבלה',
    };
    const typeLabel = docTypeLabel[doc.type] ?? 'מסמך';

    const result = await runAgentTurn(
      session,
      `${typeLabel} מספר ${doc.number} נוצרה בהצלחה.`
    );

    res.json({
      ...result,
      documentId: doc.id,
      documentNumber: doc.number,
      pdfUrl: doc.url?.he ?? doc.url?.origin,
    });
    return;
  }

    res.status(400).json({ error: 'Unknown pending action stage' });
  } catch (err) {
    console.error('[chat/confirm] error:', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function buildGIPayload(
  payload: Record<string, unknown>,
  kind: string
): GIDocumentPayload {
  if (kind === 'convert_document') {
    // fetch source doc income rows — already stored in payload from engine
    return {
      type: payload.targetType as number,
      lang: 'he',
      currency: 'ILS',
      vatType: 0,
      income: (payload.income as GIDocumentPayload['income']) ?? [],
      client: { id: payload.clientId as string },
      linkedDocumentIds: [payload.sourceDocumentId as string],
      linkType: 'copy',
    };
  }

  return {
    type: payload.type as number,
    lang: 'he',
    currency: 'ILS',
    vatType: 0,
    income: (payload.lineItems as Array<{
      description: string;
      quantity: number;
      price: number;
      vatType: number;
    }>).map((item) => ({
      description: item.description,
      quantity: item.quantity,
      price: item.price,
      currency: 'ILS',
      vatType: item.vatType as 0 | 1 | 2,
    })),
    client: { id: payload.customerId as string },
    remarks: (payload.notes as string) || undefined,
    linkedDocumentIds: payload.linkedDocumentIds as string[] | undefined,
    linkType: payload.linkType as 'link' | 'copy' | 'cancel' | undefined,
  };
}

export default router;
