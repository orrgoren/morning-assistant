import { config } from '../config/index.js';
import { getValidToken } from './tokenManager.js';

export class GreenInvoiceError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'GreenInvoiceError';
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = await getValidToken();
  const res = await fetch(`${config.greeninvoice.apiBase}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new GreenInvoiceError(res.status, `GreenInvoice ${method} ${path} → ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface GIClient {
  id: string;
  name: string;
  taxId?: string;
  city?: string;
  emails?: string[];
  phone?: string;
  mobile?: string;
}

export interface GIIncomeRow {
  description: string;
  quantity: number;
  price: number;
  currency: string;
  vatType: 0 | 1 | 2;
  vatRate?: number;
}

export interface GIDocumentPayload {
  type: number;
  lang: 'he' | 'en';
  currency: string;
  vatType: 0 | 1 | 2;
  income: GIIncomeRow[];
  client: { id: string } | (Partial<GIClient> & { add?: boolean });
  remarks?: string;
  date?: string;
  linkedDocumentIds?: string[];
  linkType?: 'link' | 'copy' | 'cancel';
}

export interface GIDocumentSummary {
  id: string;
  type: number;
  number: string;
  documentDate: string;
  status: 0 | 1 | 2 | 3 | 4;
  amount: number;
  amountDueVat: number;
  vat: number;
  currency: string;
  client: GIClient;
  income: GIIncomeRow[];
  url: { he: string; origin: string };
}

export interface GISearchResult<T> {
  total: number;
  page: number;
  pageSize: number;
  pages: number;
  items: T[];
}

export interface GIDocumentInfo {
  type: number;
  number: number;
  vatRate: number;
  incomeRowsEnabled: boolean;
  paymentRowsEnabled: boolean;
}

// ── Clients ────────────────────────────────────────────────────────────────

export async function searchClients(name: string, pageSize = 5): Promise<GIClient[]> {
  const result = await request<GISearchResult<GIClient>>('POST', '/clients/search', {
    name,
    active: true,
    page: 1,
    pageSize,
  });
  return result.items;
}

export async function createClient(data: {
  name: string;
  taxId?: string;
  emails?: string[];
  phone?: string;
  city?: string;
  address?: string;
}): Promise<GIClient> {
  return request<GIClient>('POST', '/clients', data);
}

// ── Documents ──────────────────────────────────────────────────────────────

export async function searchDocuments(filters: {
  clientId?: string;
  clientName?: string;
  type?: number[];
  status?: number[];
  fromDate?: string;
  toDate?: string;
  pageSize?: number;
  page?: number;
}): Promise<GISearchResult<GIDocumentSummary>> {
  return request<GISearchResult<GIDocumentSummary>>('POST', '/documents/search', {
    page: filters.page ?? 1,
    pageSize: filters.pageSize ?? 20,
    sort: 'documentDate',
    ...filters,
  });
}

export async function getDocument(id: string): Promise<GIDocumentSummary> {
  return request<GIDocumentSummary>('GET', `/documents/${id}`);
}

export async function previewDocument(payload: GIDocumentPayload): Promise<string> {
  const res = await request<{ file: string }>('POST', '/documents/preview', payload);
  return res.file; // Base64-encoded PDF
}

export async function createDocument(payload: GIDocumentPayload): Promise<GIDocumentSummary> {
  return request<GIDocumentSummary>('POST', '/documents', payload);
}

export async function getDocumentInfo(type: number): Promise<GIDocumentInfo> {
  const token = await getValidToken();
  const res = await fetch(`${config.greeninvoice.apiBase}/documents/info?type=${type}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new GreenInvoiceError(res.status, `getDocumentInfo failed`);
  return res.json() as Promise<GIDocumentInfo>;
}

// ── Product cache helper ───────────────────────────────────────────────────

export async function fetchRecentLineItemDescriptions(limit = 100): Promise<string[]> {
  const result = await searchDocuments({ pageSize: limit, page: 1 });
  const descriptions = new Set<string>();
  for (const doc of result.items) {
    for (const row of doc.income ?? []) {
      if (row.description?.trim()) descriptions.add(row.description.trim());
    }
  }
  return [...descriptions];
}
