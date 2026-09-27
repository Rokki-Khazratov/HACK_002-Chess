import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { loadHistory, exportHistory, sendToCoach } from '../ai/api';
import { CoachAnswer, type ApplyCoachLine } from './CoachAnswer';
import type { CoachContext, CoachEngineLine, CoachRequest, CoachTurn } from '../ai/types';
import '../ai/coach.css';

const devMode = import.meta.env.DEV || ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
const actionLabels: Record<string, string> = { ask: 'Question', explain_position: 'Explain position', preparation_plan: 'Preparation plan', repertoire: 'Opponent repertoire' };
const quickQuestions = [
  { label: 'Explain the current position', prompt: 'Explain the current position' },
  { label: 'What is the best plan here?', prompt: 'What is the best plan here?' },
  { label: 'Why is this move good or bad?', prompt: 'Why is this move good or bad?' },
  { label: 'What should I calculate next?', prompt: 'What should I calculate next?' },
];
const preparationQuestions = [
  { label: 'What should I prepare?', prompt: 'Based on the available evidence, what should I prepare first?' },
  { label: 'Compare both colors', prompt: 'Compare the opponent samples as White and Black, including limitations.' },
  { label: 'Find a source game', prompt: 'Which supplied example game is most useful to study, and why?' },
  { label: 'Resolve my plan', prompt: 'What questions must we resolve before agreeing the final preparation plan?' },
];

interface Props {
  conversationId: string;
  context: CoachContext;
  prepareContext?: (context: CoachContext) => Promise<CoachContext>;
  onConversationCreated?: (id: string, sourceId?: string) => void;
  onClose?: () => void;
  onDetachPreparation?: () => void;
  onApplyLine?: ApplyCoachLine;
  onPreviewLine?: (turn: CoachTurn, line: CoachEngineLine, ply: number | null) => void;
}

function rememberPending(id: string, request?: CoachRequest) {
  try {
    const key = `chessscope.ai.pending:${id}`;
    if (request) sessionStorage.setItem(key, JSON.stringify(request));
    else sessionStorage.removeItem(key);
  } catch { /* Retry still works in memory if storage is unavailable. */ }
}

export function ChatPanel(props: Props) {
  // Changing preparation/game replaces all local state, including pending work.
  return <Conversation key={props.conversationId} {...props} />;
}

function Conversation({ conversationId, context, prepareContext, onClose, onDetachPreparation, onApplyLine, onPreviewLine, onConversationCreated }: Props) {
  const [fontSize, setFontSize] = useState(() => {
    try { return Math.min(24, Math.max(16, Number(localStorage.getItem('chessscope.coach.fontSize')) || 18)); }
    catch { return 18; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [recentChats, setRecentChats] = useState<{ id: string; title: string; createdAt: string }[]>([]);
  const [animateAnswers, setAnimateAnswers] = useState(() => {
    try { return localStorage.getItem('chessscope.coach.animate') !== 'false'; }
    catch { return true; }
  });
  const [freshTurn, setFreshTurn] = useState('');
  const [turns, setTurns] = useState<CoachTurn[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<CoachRequest>();
  const alive = useRef(true);
  const sendingRef = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    setLoading(true); setError('');
    loadHistory(conversationId, controller.signal)
      .then((history) => {
        if (controller.signal.aborted) return;
        setTurns(history.turns); setLoading(false);
        try {
          const saved = JSON.parse(sessionStorage.getItem(`chessscope.ai.pending:${conversationId}`) || 'null') as CoachRequest | null;
          if (saved?.conversationId === conversationId) {
            if (history.turns.some((turn) => turn.id === saved.requestId)) rememberPending(conversationId);
            else { setPending(saved); setDraft(saved.message); setError('An earlier request may still be finishing. Retry to recover its answer.'); }
          }
        } catch { /* Ignore invalid browser storage. */ }
      }).catch((cause) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'Could not load conversation');
      });
    return () => { alive.current = false; controller.abort(); };
  }, [conversationId, loadVersion]);
  useEffect(() => { const body = bottom.current?.parentElement; if (body && (turns.length || sending)) body.scrollTop = body.scrollHeight; }, [turns.length, sending]);

  const prep = context.preparation;
  const suggestedQuestions = context.board ? quickQuestions : preparationQuestions;

  useEffect(() => {
    if (!showHistory) return;
    const controller = new AbortController();
    fetch('/api/ai/conversations', { signal: controller.signal }).then((response) => response.ok ? response.json() : { conversations: [] })
      .then((data) => setRecentChats(Array.isArray(data.conversations) ? data.conversations : []))
      .catch(() => setRecentChats([]));
    return () => controller.abort();
  }, [showHistory]);

  useEffect(() => {
    try {
      localStorage.setItem('chessscope.coach.fontSize', String(fontSize));
      localStorage.setItem('chessscope.coach.animate', String(animateAnswers));
    } catch { /* Settings still work for this visit. */ }
  }, [fontSize, animateAnswers]);

  async function submit(request: CoachRequest) {
    if (sendingRef.current) return;
    sendingRef.current = true;
    rememberPending(conversationId, request);
    setSending(true); setError(''); setPending(request);
    try {
      if (prepareContext && request.context.board && !request.context.board.engine) {
        setCalculating(true);
        request = { ...request, context: await prepareContext(request.context) };
        setCalculating(false);
        rememberPending(conversationId, request);
        setPending(request);
      }
      const { turn } = await sendToCoach(request);
      rememberPending(conversationId);
      if (!alive.current) return;
      setFreshTurn(turn.id);
      setTurns((current) => [...current.filter((item) => item.id !== turn.id), turn]);
      setPending(undefined); setDraft((current) => current.trim() === request.message ? '' : current);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : 'Could not send the message');
    } finally {
      sendingRef.current = false;
      if (alive.current) { setSending(false); setCalculating(false); }
    }
  }

  function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (loading || sending || pending || !draft.trim()) return;
    // Snapshot now: board changes cannot affect this request or its retry.
    void submit({ version: 1, conversationId, requestId: crypto.randomUUID(), action: 'ask',
      message: draft.trim(), context: structuredClone(context) });
  }

  function sendQuickQuestion(message: string) {
    if (loading || sending || pending) return;
    void submit({ version: 1, conversationId, requestId: crypto.randomUUID(), action: 'ask',
      message, context: structuredClone(context) });
  }

  async function copyChat() {
    if (copying) return;
    setCopying(true); setCopyStatus('');
    try {
      const { turns: history } = await exportHistory(conversationId);
      const parts = [`# ChessScope conversation\n\nConversation: ${conversationId}`];
      for (const turn of history) {
        parts.push(`## You\n\n${turn.message || actionLabels[turn.action] || turn.action}`);
        parts.push(`## Coach\n\n${turn.reply}`);
        parts.push(`### Response context\n\n${turn.createdAt} · ${turn.model} · ${turn.action} v${turn.blueprintVersion}\n\n\`\`\`json\n${JSON.stringify(turn.context, null, 2)}\n\`\`\``);
      }
      if (pending && !history.some((turn) => turn.id === pending.requestId)) parts.push(`## Pending message\n\n${pending.message}`);
      if (draft && draft !== pending?.message) parts.push(`## Unsent draft\n\n${draft}`);
      if (error) parts.push(`## Error\n\n${error}`);
      await navigator.clipboard.writeText(parts.join('\n\n---\n\n'));
      if (alive.current) setCopyStatus('Chat copied');
    } catch { if (alive.current) setCopyStatus('Could not copy. Check clipboard access and try again.'); }
    finally { if (alive.current) setCopying(false); }
  }

  return <section className="chat coach-panel" aria-label="AI coach" style={{ '--coach-font-size': `${fontSize}px` } as CSSProperties}>
    <header className="chat-header"><div className="coach-heading"><span className="chat-title">Coach</span><span className="coach-provider">Cerebras</span></div>
      <button className="coach-copy" type="button" onClick={() => setShowHistory((shown) => !shown)} aria-expanded={showHistory} title="Recent chats and clone">···</button>
      {devMode && <button className="coach-copy" type="button" onClick={() => void copyChat()} disabled={copying || loading} title="Copy the entire conversation with context">{copying ? 'Copying…' : 'Copy chat'}</button>}
      <div className="coach-settings-wrap"><button className="coach-settings-trigger" type="button" aria-label="Chat settings" aria-expanded={showSettings} title="Chat settings" onClick={() => setShowSettings((value) => !value)}>⚙</button>
        {showSettings && <div className="coach-settings" role="group" aria-label="Chat settings">
          <div className="coach-settings-heading"><strong>Chat settings</strong><button type="button" onClick={() => setShowSettings(false)} aria-label="Close settings">×</button></div>
          <label htmlFor="coach-font-size">Answer font size <span>{fontSize}px</span></label>
          <input id="coach-font-size" type="range" min="16" max="24" step="1" value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
          <label className="coach-settings-check"><input type="checkbox" checked={animateAnswers} onChange={(event) => setAnimateAnswers(event.target.checked)} /> Animate new replies</label>
          <button type="button" className="coach-settings-reset" onClick={() => { setFontSize(18); setAnimateAnswers(true); }}>Reset</button>
        </div>}
      </div>
      {onClose && <button type="button" className="chat-close" onClick={onClose} title="Close coach (C)" aria-label="Close coach">×</button>}
    </header>
    {showHistory && <div className="chat-history-menu"><strong>Clone a recent chat</strong>{recentChats.length ? recentChats.slice(0,8).map((chat) => <button type="button" key={chat.id} onClick={() => { const id = `${conversationId.split(':')[0]}:${crypto.randomUUID()}`; void fetch('/api/ai/clone', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ sourceConversationId:chat.id, conversationId:id, context }) }).then((response) => { if (!response.ok) throw new Error('Could not clone chat'); onConversationCreated?.(id,chat.id); setShowHistory(false); }).catch(() => setError('Could not clone this chat.')); }}>{chat.title || 'Chess chat'}<small>{new Date(chat.createdAt).toLocaleDateString()}</small></button>) : <p>No previous chats yet.</p>}</div>}
    {copyStatus && <p className="coach-copy-status" role="status">{copyStatus}</p>}
    <details className="coach-context"><summary>Context details</summary>
      {prep && <><p>{prep.player?.name || 'Player not set'} · {prep.color} · Opponent: {prep.opponent?.name || 'not set'}</p>
        <p>Planned opening: {prep.opening || 'not set'}</p>{prep.notes && <p>{prep.notes}</p>}</>}
      {context.board && <><p>Selected line: {context.board.line.length} plies · {context.boardSource}</p><code>{context.board.fen}</code><p>{context.board.engine ? 'Current Stockfish lines included.' : 'No engine analysis for this position.'}</p></>}
      <p>Context is saved with each answer.</p>
      {prep && onDetachPreparation && <button type="button" className="btn" onClick={onDetachPreparation}>Detach preparation</button>}
      {!prep && <a href="/prepare">Set up preparation →</a>}
    </details>
    <div className="chat-body" aria-live="polite">
      {loading && !error && <p className="chat-hint">Loading conversation…</p>}
      {!loading && !turns.length && <p className="chat-hint">What would you like to understand? I’ll use the selected position and your preparation.</p>}
      {turns.map((turn) => <article key={turn.id} className="coach-turn">
        {turn.demo && <div className="coach-demo-label">DEMO · illustrative coach response</div>}
        <p className="chat-message chat-message-user">{turn.message || actionLabels[turn.action] || turn.action}</p>
        <div className="coach-speaker">Coach</div>
        <div className="coach-proof-strip" aria-label="Sources used in this answer">
          <span className={turn.context.opponentEvidence ? 'available' : ''}>♟ Games · {turn.context.opponentEvidence ? `${Object.values(turn.context.opponentEvidence.colors).reduce((sum, item) => sum + item.sampleSize, 0)} used` : 'not used'}</span>
          <span className={turn.engineLines?.length ? 'available' : ''}>▥ Stockfish · {turn.engineLines?.length ? `${turn.engineLines.length} legal ${turn.engineLines.length === 1 ? 'line' : 'lines'}` : 'not run'}</span>
          <span className="available">✦ Coach · interpretation</span>
        </div>
        <CoachAnswer turn={turn} onApplyLine={onApplyLine} onPreviewLine={onPreviewLine} animate={animateAnswers && turn.id === freshTurn} />
        <details className="coach-answer-context"><summary>Response context · {turn.context.board ? turn.context.board.fen !== context.board?.fen ? 'Previous position' : 'Current position' : 'Preparation'}</summary>
          <p>{turn.model} · {new Date(turn.createdAt).toLocaleString()}</p>
          {turn.context.preparation && <p>{turn.context.preparation.project} · {turn.context.preparation.opponent?.name || 'Opponent not set'} · {turn.context.preparation.opening || 'Opening not set'}</p>}
          {turn.context.board && <code>{turn.context.board.fen}</code>}
          {turn.context.opponentEvidence && Object.entries(turn.context.opponentEvidence.colors).map(([color, evidence]) => <p key={color}>{color}: {evidence.found} found · {evidence.sampleSize} used · {evidence.excluded} excluded. {evidence.openings.flatMap((opening) => opening.examples).slice(0, 4).map((game) => <a key={game.id} href={game.reference}>Game #{game.id} </a>)}</p>)}
        </details>
      </article>)}
      {pending && <p className="chat-message chat-message-user">{pending.message || actionLabels[pending.action]}</p>}
      {sending && <p className="chat-hint">{calculating ? 'Calculating board variations…' : 'Thinking…'}</p>}
      {error && <div className="chat-error" role="alert">{error}
        {loading ? <button type="button" className="btn" onClick={() => setLoadVersion((value) => value + 1)}>Reload</button>
          : pending && <><button type="button" className="btn" disabled={sending} onClick={() => void submit(pending)}>Retry same request</button><button type="button" className="btn" disabled={sending} onClick={() => { rememberPending(conversationId); setPending(undefined); setError(''); }}>Edit message</button></>}
      </div>}
      <div ref={bottom} />
    </div>
    <form className="chat-composer" onSubmit={sendMessage}>
      <div className="coach-quick-questions" aria-label="Quick chess questions">
        {suggestedQuestions.map((item) => <button key={item.label} type="button" disabled={loading || sending || !!pending}
          title={item.prompt} onClick={() => sendQuickQuestion(item.prompt)}>{item.label}</button>)}
      </div>
      <textarea className="chat-input" rows={4} placeholder="Ask your coach…" value={draft} maxLength={4000}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          event.preventDefault();
          if (!event.repeat) event.currentTarget.form?.requestSubmit();
        }}
        disabled={loading || sending || !!pending} aria-label="Message the coach" />
      <div className="chat-composer-footer">
        <span className="chat-composer-hint">Enter to send · Shift+Enter for a new line</span>
        <button type="submit" className="coach-send" aria-label="Send message" title="Send message (Enter)" disabled={loading || sending || !!pending || !draft.trim()}>↑</button>
      </div>
    </form>
  </section>;
}
