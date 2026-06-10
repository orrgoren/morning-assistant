import { DOC_TYPE_LABELS, DOC_STATUS_LABELS } from '../types';

interface DocItem {
  id: string;
  number: string;
  type: number;
  date: string;
  status: number;
  amount: number;
  currency: string;
  client?: string;
  url?: string;
}

interface Props {
  items: DocItem[];
}

export default function DocumentListCard({ items }: Props) {
  return (
    <div className="action-card document-list-card">
      <table className="doc-list-table">
        <thead>
          <tr>
            <th>#</th>
            <th>מספר</th>
            <th>סוג</th>
            <th>תאריך</th>
            <th>לקוח</th>
            <th>סכום</th>
            <th>סטטוס</th>
          </tr>
        </thead>
        <tbody>
          {items.map((doc, i) => (
            <tr key={doc.id}>
              <td className="row-num">{i + 1}</td>
              <td>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer">{doc.number}</a>
                ) : (
                  doc.number
                )}
              </td>
              <td>{DOC_TYPE_LABELS[doc.type] ?? doc.type}</td>
              <td>{doc.date}</td>
              <td>{doc.client ?? '—'}</td>
              <td>₪{(doc.amount ?? 0).toLocaleString('he-IL', { minimumFractionDigits: 2 })}</td>
              <td>{DOC_STATUS_LABELS[doc.status] ?? doc.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
