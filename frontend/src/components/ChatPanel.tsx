import { useState, type FormEvent } from 'react';

interface Props {
  fen: string;
  onClose?: () => void;
}

/**
 * Placeholder slot for the AI coach. It already receives the current position so
 * the future agent can be wired in without changing the board layout.
 */
export function ChatPanel({ fen, onClose }: Props) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setDraft('');
    setError('');
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setSending(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, fen }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Request failed');
      setMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the message');
    } finally {
      setSending(false);
    }
  }
  return (
    <section className="chat" aria-label="AI coach">
      <header className="chat-header">
        <span className="chat-title">Coach</span>
        <span className="chat-badge">Qwen 3.8 27B</span>
        {onClose && <button type="button" className="chat-close" onClick={onClose} title="Close coach (C)" aria-label="Close coach">×</button>}
      </header>
      <div className="chat-body">
        {messages.length === 0 && <p className="chat-hint">Chat is connected. Ask a general question to try it; chess specific analysis will come later.</p>}
        {messages.map((message, index) => <p className={`chat-message chat-message-${message.role}`} key={index}>{message.content}</p>)}
        {sending && <p className="chat-hint">Thinking…</p>}
        {error && <p className="chat-error" role="alert">{error}</p>}
      </div>
      <form className="chat-composer" onSubmit={sendMessage}>
        <input
          className="chat-input"
          placeholder="Send a message…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          disabled={sending}
          aria-label="Message the coach"
        />
        <button type="submit" className="btn" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
