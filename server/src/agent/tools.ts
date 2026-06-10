import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const tools: ChatCompletionTool[] = [
  // ── Read tools ────────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_customers',
      description: 'Search for existing clients/customers in GreenInvoice by name. Returns up to 5 matches.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Customer name to search for' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_documents',
      description: 'Search and list documents. Use to show recent documents for a customer or by type/status.',
      parameters: {
        type: 'object',
        properties: {
          clientId: { type: 'string', description: 'Filter by client ID' },
          clientName: { type: 'string', description: 'Filter by client name (partial match)' },
          type: {
            type: 'array',
            items: { type: 'number' },
            description: 'Document type codes: 10=הצעת מחיר, 100=הזמנה, 305=חשבונית מס, 400=קבלה',
          },
          status: {
            type: 'array',
            items: { type: 'number' },
            description: 'Status filter. Default (omit this field) = open only [0]. Pass [0,1] only when user explicitly asks for closed documents too.',
          },
          fromDate: { type: 'string', description: 'From date YYYY-MM-DD' },
          toDate: { type: 'string', description: 'To date YYYY-MM-DD' },
          limit: { type: 'number', description: 'Max results (default 10)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_document_details',
      description: 'Get full details of a single document including all line items.',
      parameters: {
        type: 'object',
        properties: {
          documentId: { type: 'string', description: 'Document UUID' },
        },
        required: ['documentId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_business_summary',
      description: 'Get income totals for a date range. Aggregates from document search.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: { type: 'string', description: 'From date YYYY-MM-DD' },
          toDate: { type: 'string', description: 'To date YYYY-MM-DD' },
        },
        required: ['fromDate', 'toDate'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_product_suggestions',
      description: 'Fuzzy-match a product/service description against recently used line item descriptions. Returns up to 3 suggestions.',
      parameters: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Product or service description to match' },
        },
        required: ['description'],
      },
    },
  },
  // ── Write tools (intercepted — not executed directly) ─────────────────────
  {
    type: 'function',
    function: {
      name: 'create_document',
      description: 'Create a new GreenInvoice document (quote, order, invoice, receipt). This will trigger a confirmation flow.',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'number',
            description: 'Document type: 10=הצעת מחיר, 100=הזמנה, 305=חשבונית מס, 400=קבלה',
          },
          customerId: { type: 'string', description: 'GreenInvoice client UUID' },
          customerName: { type: 'string', description: 'Customer display name (for UI)' },
          lineItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                quantity: { type: 'number' },
                price: { type: 'number', description: 'Unit price' },
                vatType: {
                  type: 'number',
                  description: '0=ex-VAT (price before VAT), 1=incl VAT (price includes VAT), 2=exempt',
                },
              },
              required: ['description', 'quantity', 'price', 'vatType'],
            },
          },
          notes: { type: 'string', description: 'Optional remarks / הערות' },
          linkedDocumentIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'For receipts: the invoice ID to link and close',
          },
          linkType: {
            type: 'string',
            enum: ['link', 'copy', 'cancel'],
            description: 'link=receipt→invoice, copy=conversion',
          },
        },
        required: ['type', 'customerId', 'customerName', 'lineItems'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'convert_document',
      description: 'Convert an existing document to a different type (e.g. quote → order → invoice). Triggers confirmation flow.',
      parameters: {
        type: 'object',
        properties: {
          sourceDocumentId: { type: 'string', description: 'UUID of the source document' },
          sourceDocumentNumber: { type: 'string', description: 'Document number for display' },
          sourceType: { type: 'number', description: 'Source document type code' },
          targetType: { type: 'number', description: 'Target document type code' },
        },
        required: ['sourceDocumentId', 'sourceDocumentNumber', 'sourceType', 'targetType'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_client',
      description: 'Create a new client in GreenInvoice. Use when search_customers returns no results. Triggers confirmation.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Client name (required)' },
          taxId: { type: 'string', description: 'Tax ID / ח.פ. / ת.ז.' },
          email: { type: 'string', description: 'Primary email address' },
          phone: { type: 'string', description: 'Phone number' },
          city: { type: 'string', description: 'City' },
          address: { type: 'string', description: 'Street address' },
        },
        required: ['name'],
      },
    },
  },
];

export const WRITE_TOOLS = new Set(['create_document', 'convert_document', 'create_client']);
