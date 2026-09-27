import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatScore } from '../engine/stockfish';
import type { CoachEngineLine, CoachTurn } from '../ai/types';

/** Normalize typography; keep raw replies intact in the copy/export payload. */
export function readableText(text: string) {
  const normalized = text.replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/[\u200b\ufeff]/g, '');
  const fen = '[prnbqkPRNBQK1-8]+(?:/[prnbqkPRNBQK1-8]+){7}\\s+[wb]\\s+[-KQkq]+\\s+(?:-|[a-h][36])\\s+\\d+\\s+\\d+';
  return normalized.replace(new RegExp('\\(?FEN\\s*[:=]?\\s*' + fen + '\\)?', 'gi'), '')
    .replace(new RegExp(fen, 'g'), '[position in response context]');
}

function linkedText(value: string, lines: CoachEngineLine[]) {
  const cited = new Map(lines.map((line) => [line.id, line]));
  return readableText(value).replace(/\[[^\]]+\]\([^)]+\)|\[\[(pv[1-5])\]\]/g,
    (token, id: string | undefined) => {
      if (id) return cited.has(id) ? `[Stockfish line ${cited.get(id)!.rank}](#${id})` : token;
      return token;
    });
}

function Text({ value, lines, onJump, onApplyInline, onPreviewInline }: { value: string; lines: CoachEngineLine[]; onJump: (id: string) => void; onApplyInline?: (id: string) => void; onPreviewInline?: (id: string, active: boolean) => void }) {
  return <Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']}
    components={{ table: ({ children }) => <div className="coach-table-scroll"><table>{children}</table></div>,
      a: ({ href, children }) => href?.startsWith('#pv') && lines.some((line) => `#${line.id}` === href)
        ? typeof children === 'string' && children.startsWith('Stockfish line ') && onApplyInline
          ? <span className="coach-line-ref-wrap"><button type="button" className="coach-line-ref"
              aria-label={`Apply ${children} on the board`} onClick={() => onApplyInline(href.slice(1))}
              onMouseEnter={() => onPreviewInline?.(href.slice(1), true)} onMouseLeave={() => onPreviewInline?.(href.slice(1), false)}
              onFocus={() => onPreviewInline?.(href.slice(1), true)} onBlur={() => onPreviewInline?.(href.slice(1), false)}>{children}</button>
              <span className="coach-ref-preview" role="tooltip"><strong>{children}</strong>{lines.find((line) => `#${line.id}` === href)?.notation}</span></span>
          : <a href={href} className="coach-move-link"
            onMouseEnter={() => onPreviewInline?.(href.slice(1), true)} onMouseLeave={() => onPreviewInline?.(href.slice(1), false)}
            onFocus={() => onPreviewInline?.(href.slice(1), true)} onBlur={() => onPreviewInline?.(href.slice(1), false)}
            title={typeof children === 'string' && /^\d+\./.test(children) && !lines.find((line) => `#${line.id}` === href)?.notation.split(/\s+/).includes(children)
              ? 'This move differs from the saved Stockfish line. Open it to compare.' : 'Open the saved Stockfish variation'}
            onClick={(event) => { event.preventDefault(); onJump(href.slice(1)); }}>{children}</a>
        : <a href={href} target="_blank" rel="noopener noreferrer">{children}</a> }}>{linkedText(value, lines)}</Markdown>;
}

export type ApplyCoachLine = (turn: CoachTurn, line: CoachEngineLine, ply?: number) => string | undefined;

export function CoachAnswer({ turn, onApplyLine, onPreviewLine, animate = false }: { turn: CoachTurn; onApplyLine?: ApplyCoachLine; onPreviewLine?: (turn: CoachTurn, line: CoachEngineLine, ply: number | null) => void; animate?: boolean }) {
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [focused, setFocused] = useState('');
  const lines = turn.engineLines ?? [];
  const analysis = turn.analysis;
  const total = useMemo(() => analysis
    ? analysis.summary.length + analysis.sections.reduce((sum, section) => sum + section.title.length + section.items.reduce((n, item) => n + item.length, 0), 0)
    : turn.reply.length, [analysis, turn.reply]);
  const [visible, setVisible] = useState(animate ? 0 : total);
  useEffect(() => {
    if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setVisible(total); return; }
    const step = Math.max(2, Math.ceil(total / 130));
    const timer = window.setInterval(() => setVisible((value) => {
      if (value + step >= total) { window.clearInterval(timer); return total; }
      return value + step;
    }), 26);
    return () => window.clearInterval(timer);
  }, [animate, total]);
  function jumpToLine(id: string) {
    document.getElementById(`coach-${turn.id}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFocused(id);
    window.setTimeout(() => setFocused((current) => current === id ? '' : current), 2200);
  }
  function applyInlineLine(id: string) {
    const line = lines.find((item) => item.id === id);
    if (!line || !onApplyLine) return;
    const error = onApplyLine(turn, line);
    setFeedback((old) => ({ ...old, [id]: error || 'Line added to the tree · Chat' }));
  }
  function previewInlineLine(id: string, active: boolean) {
    const line = lines.find((item) => item.id === id);
    if (line) onPreviewLine?.(turn, line, active ? line.uci.length : null);
  }
  const hasInlineRefs = !!analysis && [analysis.summary, ...analysis.sections.flatMap((section) => section.items)].some((value) => /\[\[pv[1-5]\]\]/.test(value));
  let offset = analysis?.summary.length ?? 0;
  return <div className="coach-answer">
    {turn.positionFacts && <div className="coach-position-facts"><span>{turn.positionFacts.turn === 'white' ? 'White to move' : 'Black to move'}</span>
      {turn.positionFacts.checkmate ? <span>Checkmate</span> : turn.positionFacts.stalemate ? <span>Stalemate</span> : turn.positionFacts.check && <span>Check</span>}
    </div>}
    {analysis ? <>
      <div className="coach-summary coach-markdown"><Text value={analysis.summary.slice(0, visible)} lines={lines} onJump={jumpToLine} onApplyInline={applyInlineLine} onPreviewInline={previewInlineLine} />{visible < analysis.summary.length && <span className="coach-typing-cursor" />}</div>
      {!hasInlineRefs && visible >= total && !!lines.length && <div className="coach-inline-references" aria-label="Stockfish lines in this answer">{lines.map((line) =>
        <span className="coach-line-ref-wrap" key={line.id}><button type="button" className="coach-line-ref" aria-label={`Apply Stockfish line ${line.rank} on the board`}
          onClick={() => applyInlineLine(line.id)} onMouseEnter={() => previewInlineLine(line.id, true)} onMouseLeave={() => previewInlineLine(line.id, false)}
          onFocus={() => previewInlineLine(line.id, true)} onBlur={() => previewInlineLine(line.id, false)}>Stockfish line {line.rank}</button>
          <span className="coach-ref-preview" role="tooltip"><strong>Stockfish line {line.rank}</strong>{line.notation}</span></span>)}</div>}
      <div className="coach-sections">{analysis.sections.map((section, index) => {
        const start = offset;
        offset += section.title.length;
        const title = section.title.slice(0, Math.max(0, visible - start));
        const items = section.items.map((item) => { const itemStart = offset; offset += item.length; return item.slice(0, Math.max(0, visible - itemStart)); });
        return visible > start && <section className={`coach-section coach-section-${section.kind}`} key={`${section.kind}-${index}`}>
          <h3>{readableText(title)}</h3><ol>{items.map((item, i) => item && <li className="coach-markdown" key={i}><Text value={item} lines={lines} onJump={jumpToLine} onApplyInline={applyInlineLine} onPreviewInline={previewInlineLine} />{visible < total && i === items.findLastIndex(Boolean) && <span className="coach-typing-cursor" />}</li>)}</ol>
        </section>;
      })}</div>
    </> : <>
      <p className="coach-legacy-note">Earlier AI explanation. Use the saved Stockfish cards below for exact moves.</p>
      <div className="chat-message chat-message-assistant coach-markdown"><Text value={turn.reply.slice(0, visible)} lines={lines} onJump={jumpToLine} />{visible < total && <span className="coach-typing-cursor" />}</div>
    </>}
    {!!lines.length && visible >= total && <section className="coach-engine-lines" aria-label="Saved Stockfish variations">
      <header><h3>Stockfish variations</h3><span>Evaluation for White · saved with this answer</span></header>
      {lines.map((line) => <article id={`coach-${turn.id}-${line.id}`} className={`coach-engine-card${focused === line.id ? ' coach-engine-card-focused' : ''}`} key={line.id}>
        <div className="coach-engine-meta"><strong>#{line.rank}</strong><span>Stockfish 19 · depth {line.depth}</span><b>{formatScore(line.score)}</b></div>
        <div className="coach-line-moves" aria-label={`Variation ${line.rank}: ${line.notation}`}>
          {line.notation.split(/\s+/).map((move, index) => <button type="button" key={`${index}-${move}`} disabled={!onApplyLine}
            title={`Preview move ${index + 1}; click to add the variation and select this move`}
            onMouseEnter={() => onPreviewLine?.(turn, line, index + 1)} onMouseLeave={() => onPreviewLine?.(turn, line, null)}
            onFocus={() => onPreviewLine?.(turn, line, index + 1)} onBlur={() => onPreviewLine?.(turn, line, null)}
            onClick={() => { const error = onApplyLine?.(turn, line, index + 1); setFeedback((old) => ({ ...old, [line.id]: error || 'Line added to the tree · Chat' })); }}>{move}</button>)}
        </div>
        {analysis?.lineExplanations[line.id] && <div className="coach-line-explanation coach-markdown"><small>AI explanation</small><Text value={analysis.lineExplanations[line.id]} lines={lines} onJump={jumpToLine} /></div>}
        <div className="coach-line-footer">{onApplyLine ? 'Hover to preview · Click a move to add the variation and continue on the board' : 'Open the original board to apply this variation'}</div>
        {feedback[line.id] && <p className="coach-line-feedback" role="status">{feedback[line.id]}</p>}
      </article>)}
    </section>}
  </div>;
}
