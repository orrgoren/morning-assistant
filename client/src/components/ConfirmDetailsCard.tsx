import { useState } from 'react';
import type { LineItem, DocType } from '../types';
import { DOC_TYPE_LABELS } from '../types';

const VAT_RATE = 0.18;

function calcTotals(items: LineItem[]) {
  let exVat = 0;
  for (const item of items) {
    const lineTotal = item.quantity * item.price;
    exVat += item.vatType === 1 ? lineTotal / (1 + VAT_RATE) : lineTotal;
  }
  const vat = exVat * VAT_RATE;
  return { exVat, vat, total: exVat + vat };
}

interface Props {
  documentType: number;
  customerId: string;
  customerName: string;
  lineItems: LineItem[];
  notes: string;
  onApprove: (payload: {
    documentType: number;
    customerId: string;
    lineItems: LineItem[];
    notes: string;
  }) => void;
  onCancel: () => void;
}

export default function ConfirmDetailsCard({
  documentType,
  customerId,
  customerName,
  lineItems: initialItems,
  notes: initialNotes,
  onApprove,
  onCancel,
}: Props) {
  const [docType, setDocType] = useState<number>(documentType);
  const [items, setItems] = useState<LineItem[]>(initialItems);
  const [notes, setNotes] = useState(initialNotes);

  const totals = calcTotals(items);

  function updateItem(i: number, field: keyof LineItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, idx) => (idx === i ? { ...item, [field]: value } : item))
    );
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addItem() {
    setItems((prev) => [...prev, { description: '', quantity: 1, price: 0, vatType: 0 }]);
  }

  return (
    <div className="action-card">
      <h3>אישור פרטי מסמך</h3>

      <div className="field-row">
        <label>סוג מסמך</label>
        <select value={docType} onChange={(e) => setDocType(Number(e.target.value))}>
          {Object.entries(DOC_TYPE_LABELS).map(([code, label]) => (
            <option key={code} value={code}>{label}</option>
          ))}
        </select>
      </div>

      <div className="field-row">
        <label>לקוח</label>
        <span className="customer-name">{customerName}</span>
      </div>

      <table className="items-table">
        <thead>
          <tr>
            <th>תיאור</th>
            <th>כמות</th>
            <th>מחיר יחידה</th>
            <th>מע"מ</th>
            <th>סה"כ</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const lineTotal = item.quantity * item.price;
            return (
              <tr key={i}>
                <td>
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    dir="rtl"
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.price}
                    onChange={(e) => updateItem(i, 'price', Number(e.target.value))}
                  />
                </td>
                <td>
                  <select
                    value={item.vatType}
                    onChange={(e) => updateItem(i, 'vatType', Number(e.target.value))}
                  >
                    <option value={0}>לפני מע"מ</option>
                    <option value={1}>כולל מע"מ</option>
                    <option value={2}>פטור</option>
                  </select>
                </td>
                <td>₪{lineTotal.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
                <td>
                  <button className="btn-remove" onClick={() => removeItem(i)}>✕</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <button className="btn-add-item" onClick={addItem}>+ הוסף שורה</button>

      <div className="totals">
        <div><span>לפני מע"מ</span><span>₪{totals.exVat.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span></div>
        <div><span>מע"מ 18%</span><span>₪{totals.vat.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span></div>
        <div className="total-row"><span>סה"כ לתשלום</span><span>₪{totals.total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}</span></div>
      </div>

      <div className="field-row">
        <label>הערות</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          dir="rtl"
          placeholder="הערות (אופציונלי)"
        />
      </div>

      <div className="card-actions">
        <button className="btn-primary" onClick={() => onApprove({ documentType: docType, customerId, lineItems: items, notes })}>
          אישור פרטים
        </button>
        <button className="btn-secondary" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}
