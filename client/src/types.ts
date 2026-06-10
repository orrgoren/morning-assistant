export type DocType = 10 | 100 | 305 | 400 | 320;

export const DOC_TYPE_LABELS: Record<number, string> = {
  10: 'הצעת מחיר',
  100: 'הזמנה',
  305: 'חשבונית מס',
  400: 'קבלה',
  320: 'חשבונית מס / קבלה',
  330: 'חשבונית זיכוי',
};

export const DOC_STATUS_LABELS: Record<number, string> = {
  0: 'פתוח',
  1: 'סגור',
  2: 'סגור ידנית',
  3: 'מבטל',
  4: 'בוטל',
};

export interface LineItem {
  description: string;
  quantity: number;
  price: number;
  vatType: 0 | 1 | 2;
}

export interface ActionCard {
  type:
    | 'confirm_details'
    | 'confirm_pdf'
    | 'confirm_conversion'
    | 'confirm_client_creation'
    | 'document_list';
  [key: string]: unknown;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  actionCard?: ActionCard;
  pdfUrl?: string;
  documentNumber?: string;
  timestamp: Date;
}

export type AppState =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'awaiting_action';
