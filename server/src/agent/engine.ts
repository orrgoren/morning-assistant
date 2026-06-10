import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { config } from '../config/index.js';
import { tools, WRITE_TOOLS } from './tools.js';
import { appendMessage, type Session } from '../services/sessionManager.js';
import {
  searchClients,
  searchDocuments,
  getDocument,
  createClient,
} from '../services/greeninvoice.js';
import { getProductSuggestions } from '../services/productCache.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(join(__dirname, 'prompts/system.txt'), 'utf-8');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

export interface AgentResponse {
  reply: string;
  actionCard?: Record<string, unknown>;
}

// ── Tool execution (read-only tools only) ─────────────────────────────────

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_customers': {
      const clients = await searchClients(args.query as string);
      return clients.map((c) => ({ id: c.id, name: c.name, taxId: c.taxId, city: c.city }));
    }

    case 'list_documents': {
      // default to open documents only unless caller explicitly passes status
      const status = (args.status as number[] | undefined) ?? [0];
      const result = await searchDocuments({
        clientId: args.clientId as string | undefined,
        clientName: args.clientName as string | undefined,
        type: args.type as number[] | undefined,
        status,
        fromDate: args.fromDate as string | undefined,
        toDate: args.toDate as string | undefined,
        pageSize: (args.limit as number | undefined) ?? 10,
      });
      return result.items.map((d) => ({
        id: d.id,
        number: d.number,
        type: d.type,
        date: d.documentDate,
        status: d.status,
        amount: d.amount,
        currency: d.currency,
        client: d.client?.name,
        url: d.url?.he,
        lineItems: (d.income ?? []).map((r) => ({
          description: r.description,
          quantity: r.quantity,
          price: r.price,
          vatType: r.vatType,
        })),
      }));
    }

    case 'get_document_details': {
      const doc = await getDocument(args.documentId as string);
      return {
        id: doc.id,
        number: doc.number,
        type: doc.type,
        date: doc.documentDate,
        status: doc.status,
        amount: doc.amount,
        amountDueVat: doc.amountDueVat,
        vat: doc.vat,
        client: doc.client,
        income: doc.income,
        url: doc.url?.he,
      };
    }

    case 'get_business_summary': {
      const result = await searchDocuments({
        fromDate: args.fromDate as string,
        toDate: args.toDate as string,
        type: [305, 320],
        pageSize: 100,
      });
      const total = result.items.reduce((s, d) => s + (d.amount ?? 0), 0);
      const totalExVat = result.items.reduce((s, d) => s + (d.amountDueVat ?? 0), 0);
      const totalVat = result.items.reduce((s, d) => s + (d.vat ?? 0), 0);
      return {
        count: result.total,
        totalIncVat: total,
        totalExVat,
        totalVat,
        currency: 'ILS',
      };
    }

    case 'get_product_suggestions': {
      return getProductSuggestions(args.description as string);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ── Rate-limit aware completion call ──────────────────────────────────────

async function chatComplete(
  params: Parameters<typeof openai.chat.completions.create>[0],
  maxRetries = 3,
) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await openai.chat.completions.create(params);
    } catch (err) {
      const e = err as { status?: number; headers?: Record<string, string>; code?: string };
      if (e.status === 429 && attempt < maxRetries) {
        const waitMs = parseInt(e.headers?.['retry-after-ms'] ?? '3000') + 200;
        console.warn(`[Agent] Rate limited, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

// ── Main agent loop ────────────────────────────────────────────────────────

export async function runAgentTurn(session: Session, userMessage: string): Promise<AgentResponse> {
  // Build system message with today's date
  const systemMessage: ChatCompletionMessageParam = {
    role: 'system',
    content: `${SYSTEM_PROMPT}\n\nתאריך היום: ${new Date().toISOString().slice(0, 10)}`,
  };

  appendMessage(session, { role: 'user', content: userMessage });

  const messages: ChatCompletionMessageParam[] = [systemMessage, ...session.history];

  // Agentic loop — up to 5 tool-call rounds
  for (let round = 0; round < 5; round++) {
    const response = await chatComplete({
      model: config.openai.gptModel,
      messages,
      tools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const msg = choice.message;

    // If write tool called → intercept, set pending action, return card
    if (msg.tool_calls?.length) {
      const writeCalls = msg.tool_calls.filter((tc) => WRITE_TOOLS.has(tc.function.name));

      if (writeCalls.length > 0) {
        const tc = writeCalls[0];
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;

        appendMessage(session, msg);

        // Build the action card based on the write tool
        let actionCard: Record<string, unknown>;
        let pendingKind: Session['pendingAction'] extends null ? never : NonNullable<Session['pendingAction']>['kind'];

        if (tc.function.name === 'create_document') {
          pendingKind = 'create_document';
          actionCard = {
            type: 'confirm_details',
            documentType: args.type,
            customerId: args.customerId,
            customerName: args.customerName,
            lineItems: args.lineItems,
            notes: args.notes ?? '',
            linkedDocumentIds: args.linkedDocumentIds,
            linkType: args.linkType,
          };
        } else if (tc.function.name === 'convert_document') {
          // Fetch source doc details for display
          let sourceDoc;
          try {
            sourceDoc = await getDocument(args.sourceDocumentId as string);
          } catch {
            sourceDoc = null;
          }
          pendingKind = 'convert_document';
          actionCard = {
            type: 'confirm_conversion',
            sourceDocumentId: args.sourceDocumentId,
            sourceDocumentNumber: args.sourceDocumentNumber,
            sourceType: args.sourceType,
            targetType: args.targetType,
            income: sourceDoc?.income ?? [],
            client: sourceDoc?.client,
          };
        } else {
          // create_client
          pendingKind = 'create_client';
          actionCard = {
            type: 'confirm_client_creation',
            ...args,
          };
        }

        session.pendingAction = {
          kind: pendingKind,
          stage: pendingKind === 'create_client' ? 'confirm_client_creation' : 'confirm_details',
          payload: { ...args },
        };

        const reply = msg.content ?? 'הנה הפרטים לאישור:';
        appendMessage(session, { role: 'assistant', content: reply });
        return { reply, actionCard };
      }

      // Read tool calls — execute all, append results, continue loop
      appendMessage(session, msg);
      for (const tc of msg.tool_calls) {
        let result: unknown;
        try {
          result = await executeTool(tc.function.name, JSON.parse(tc.function.arguments));
        } catch (err) {
          result = { error: String(err) };
        }
        messages.push(msg);
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
        appendMessage(session, {
          role: 'tool',
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }
      continue;
    }

    // Text response — done
    const reply = msg.content ?? '';
    appendMessage(session, { role: 'assistant', content: reply });
    return { reply };
  }

  return { reply: 'מצטער, לא הצלחתי לעבד את הבקשה. אנא נסה שוב.' };
}

// ── Transcription ──────────────────────────────────────────────────────────

export async function transcribeAudio(audioBuffer: Buffer, mimeType: string): Promise<string> {
  const arrayBuffer = audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer;
  const ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';
  const file = new File([arrayBuffer], `audio.${ext}`, { type: mimeType });

  writeFileSync('./test.webm', audioBuffer);

  const response = await openai.audio.transcriptions.create({
    model: config.openai.whisperModel,
    file,
    language: 'he',
  });

  console.dir(response, { depth: null });

  return response.text;
}
