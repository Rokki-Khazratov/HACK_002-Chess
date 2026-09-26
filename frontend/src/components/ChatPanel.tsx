interface Props {
  fen: string;
}

/**
 * Placeholder slot for the AI coach. It already receives the current position so
 * the future agent can be wired in without changing the board layout.
 */
export function ChatPanel({ fen }: Props) {
  return (
    <section className="chat" aria-label="AI coach">
      <header className="chat-header">
        <span className="chat-title">Coach</span>
        <span className="chat-badge">coming soon</span>
      </header>
      <div className="chat-body">
        <p className="chat-hint">
          Ask about this position: plans, typical games, how a player handled it. Answers will
          cite games and engine lines, and the coach will play variations on the board.
        </p>
      </div>
      <form className="chat-composer" onSubmit={(event) => event.preventDefault()}>
        <input
          className="chat-input"
          placeholder="Ask about this position…"
          disabled
          aria-label="Message the coach"
          data-fen={fen}
        />
        <button type="submit" className="btn" disabled>
          Send
        </button>
      </form>
    </section>
  );
}
