import { DOC_TYPE_LABELS } from '../types';

interface Props {
  sourceDocumentNumber: string;
  sourceType: number;
  targetType: number;
  clientName?: string;
  onApprove: () => void;
  onCancel: () => void;
}

export default function ConfirmConversionCard({
  sourceDocumentNumber,
  sourceType,
  targetType,
  clientName,
  onApprove,
  onCancel,
}: Props) {
  return (
    <div className="action-card">
      <h3>אישור המרת מסמך</h3>
      <p>
        להמיר <strong>{DOC_TYPE_LABELS[sourceType] ?? sourceType}</strong> מספר{' '}
        <strong>{sourceDocumentNumber}</strong>
        {clientName && <> (עבור {clientName})</>} ל
        <strong>{DOC_TYPE_LABELS[targetType] ?? targetType}</strong>?
      </p>
      <div className="card-actions">
        <button className="btn-primary" onClick={onApprove}>אישור המרה</button>
        <button className="btn-secondary" onClick={onCancel}>ביטול</button>
      </div>
    </div>
  );
}
