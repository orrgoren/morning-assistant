import { useEffect, useRef } from 'react';
import { DOC_TYPE_LABELS } from '../types';

interface Props {
  previewBase64: string;
  documentType: number;
  customerName: string;
  onApprove: () => void;
  onCancel: () => void;
}

export default function ConfirmPdfCard({
  previewBase64,
  documentType,
  customerName,
  onApprove,
  onCancel,
}: Props) {
  const opened = useRef(false);

  useEffect(() => {
    if (!opened.current && previewBase64) {
      const url = `data:application/pdf;base64,${previewBase64}`;
      window.open(url, '_blank');
      opened.current = true;
    }
  }, [previewBase64]);

  function openPreview() {
    const url = `data:application/pdf;base64,${previewBase64}`;
    window.open(url, '_blank');
  }

  return (
    <div className="action-card">
      <h3>תצוגה מקדימה של המסמך</h3>
      <p>
        <strong>{DOC_TYPE_LABELS[documentType] ?? 'מסמך'}</strong> עבור <strong>{customerName}</strong>
      </p>
      <p className="preview-note">
        התצוגה המקדימה נפתחה בלשונית חדשה.{' '}
        <button className="btn-link" onClick={openPreview}>פתח שוב</button>
      </p>
      <div className="card-actions">
        <button className="btn-primary" onClick={onApprove}>
          אישור ויצירת מסמך
        </button>
        <button className="btn-secondary" onClick={onCancel}>חזור לעריכה</button>
      </div>
    </div>
  );
}
