import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, AppState, ActionCard, LineItem } from './types';
import { sendMessage, confirmAction, transcribeAudio, refreshProductCache } from './api';
import ConfirmDetailsCard from './components/ConfirmDetailsCard';
import ConfirmPdfCard from './components/ConfirmPdfCard';
import ConfirmConversionCard from './components/ConfirmConversionCard';
import DocumentListCard from './components/DocumentListCard';
import './App.css';

function newId() { return uuidv4(); }

interface AudioDevice { deviceId: string; label: string; }

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [appState, setAppState] = useState<AppState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Enumerate microphones once (requires a brief getUserMedia call to get labels)
  useEffect(() => {
    async function loadDevices() {
      try {
        // brief permission request so browser reveals device labels
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        const devices = await navigator.mediaDevices.enumerateDevices();
        const mics = devices
          .filter((d) => d.kind === 'audioinput')
          .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `מיקרופון ${i + 1}` }));
        setAudioDevices(mics);
        if (mics.length > 0) setSelectedDeviceId(mics[0].deviceId);
      } catch {
        // mic permission denied — user can still type
      }
    }
    void loadDevices();
  }, []);

  function addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
    setMessages((prev) => [...prev, { ...msg, id: newId(), timestamp: new Date() }]);
  }

  function setLastActionCard(card: ActionCard | undefined, extras?: Partial<ChatMessage>) {
    setMessages((prev) => {
      const copy = [...prev];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = { ...copy[i], actionCard: card, ...extras };
          break;
        }
      }
      return copy;
    });
  }

  async function handleSend(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || appState === 'thinking' || appState === 'recording') return;
    setInput('');
    setError(null);
    addMessage({ role: 'user', content: msg });
    setAppState('thinking');
    try {
      const res = await sendMessage(msg);
      addMessage({ role: 'assistant', content: res.reply, actionCard: res.actionCard as ActionCard | undefined });
      setAppState(res.actionCard ? 'awaiting_action' : 'idle');
    } catch (e) {
      setError(String(e));
      setAppState('idle');
    }
  }

  async function handleConfirm(editedPayload?: Record<string, unknown>) {
    setAppState('thinking');
    setError(null);
    try {
      const res = await confirmAction('approve', editedPayload);
      if (res.pdfUrl) {
        window.open(res.pdfUrl, '_blank');
      }
      if (res.actionCard) {
        setLastActionCard(res.actionCard as ActionCard);
        setAppState('awaiting_action');
      } else {
        setLastActionCard(undefined, { pdfUrl: res.pdfUrl, documentNumber: res.documentNumber });
        addMessage({ role: 'assistant', content: res.reply });
        setAppState('idle');
      }
    } catch (e) {
      setError(String(e));
      setAppState('idle');
    }
  }

  async function handleCancel() {
    setAppState('thinking');
    setError(null);
    try {
      const res = await confirmAction('cancel');
      setLastActionCard(undefined);
      addMessage({ role: 'assistant', content: res.reply });
      setAppState('idle');
    } catch (e) {
      setError(String(e));
      setAppState('idle');
    }
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      chunksRef.current = [];

      // pick the best supported format so Whisper gets clean audio
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
        .find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size < 1000) {
          setAppState('idle');
          return;
        }
        setAppState('transcribing');
        try {
          const { transcript } = await transcribeAudio(blob);
          if (transcript.trim()) {
            await handleSend(transcript.trim());
          } else {
            setAppState('idle');
          }
        } catch (e) {
          const msg = String(e);
          if (msg.includes('audio_too_short')) {
            setError('ההקלטה קצרה מדי. לחץ והחזק את המיקרופון.');
          } else {
            setError(`שגיאה בתמלול: ${msg}`);
          }
          setAppState('idle');
        }
      };

      mr.start(); // no timeslice — one clean blob, avoids fragmented WebM hallucinations
      mediaRef.current = mr;
      setAppState('recording');
    } catch {
      setError('לא ניתן לגשת למיקרופון. ודא שניתנת הרשאה.');
    }
  }

  function stopRecording() {
    if (mediaRef.current) {
      mediaRef.current.requestData(); // flush any buffered audio before stopping
      mediaRef.current.stop();
      mediaRef.current = null;
    }
  }

  function renderActionCard(card: ActionCard) {
    switch (card.type) {
      case 'confirm_details':
        return (
          <ConfirmDetailsCard
            documentType={card.documentType as number}
            customerId={card.customerId as string}
            customerName={card.customerName as string}
            lineItems={card.lineItems as LineItem[]}
            notes={(card.notes as string) ?? ''}
            onApprove={(payload) =>
              handleConfirm({
                type: payload.documentType,
                customerId: payload.customerId,
                lineItems: payload.lineItems,
                notes: payload.notes,
              })
            }
            onCancel={handleCancel}
          />
        );
      case 'confirm_pdf':
        return (
          <ConfirmPdfCard
            previewBase64={card.previewBase64 as string}
            documentType={card.documentType as number}
            customerName={(card.customerName as string) ?? ''}
            onApprove={() => handleConfirm()}
            onCancel={handleCancel}
          />
        );
      case 'confirm_conversion':
        return (
          <ConfirmConversionCard
            sourceDocumentNumber={card.sourceDocumentNumber as string}
            sourceType={card.sourceType as number}
            targetType={card.targetType as number}
            clientName={card.client ? (card.client as { name: string }).name : undefined}
            onApprove={() => handleConfirm()}
            onCancel={handleCancel}
          />
        );
      case 'document_list':
        return <DocumentListCard items={card.items as never[]} />;
      default:
        return null;
    }
  }

  const busy = appState === 'thinking' || appState === 'transcribing';

  return (
    <div className="app" dir="rtl">
      <header className="header">
        <span className="header-title">🌿 Morning Assistant</span>
        <button
          className="btn-refresh"
          onClick={() => refreshProductCache()}
          title="רענן מטמון מוצרים"
        >
          רענן מוצרים
        </button>
      </header>

      <main className="chat-area">
        {messages.map((msg) => (
          <div key={msg.id} className={`message message-${msg.role}`}>
            <div className="bubble">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
            {msg.actionCard && renderActionCard(msg.actionCard)}
            {msg.pdfUrl && (
              <a className="pdf-link" href={msg.pdfUrl} target="_blank" rel="noreferrer">
                פתח מסמך PDF
              </a>
            )}
          </div>
        ))}
        {busy && (
          <div className="message message-assistant">
            <div className="bubble thinking">
              {appState === 'transcribing' ? 'מתמלל...' : 'חושב...'}
            </div>
          </div>
        )}
        {error && <div className="error-banner">{error}</div>}
        <div ref={bottomRef} />
      </main>

      <footer className="input-bar">
        <div className="mic-group">
          <button
            className={`btn-mic ${appState === 'recording' ? 'recording' : ''}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={busy}
            title="לחץ והחזק להקלטה"
          >
            🎤
          </button>
          {audioDevices.length > 1 && (
            <select
              className="mic-select"
              value={selectedDeviceId}
              onChange={(e) => setSelectedDeviceId(e.target.value)}
              disabled={busy || appState === 'recording'}
              title="בחר מיקרופון"
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          )}
        </div>
        <textarea
          className="text-input"
          dir="rtl"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="כתוב פקודה בעברית או לחץ על המיקרופון..."
          rows={2}
          disabled={busy}
        />
        <button
          className="btn-send"
          onClick={() => void handleSend()}
          disabled={busy || !input.trim()}
        >
          שלח
        </button>
      </footer>
    </div>
  );
}
