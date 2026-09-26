const SHORTCUTS: [keys: string, action: string][] = [
  ['← / →', 'Previous / next move (→ at a fork opens the line chooser)'],
  ['↑ / ↓', 'In the chooser: pick a line'],
  ['Enter', 'Follow the chosen line'],
  ['Ctrl + ↑ / ↓', 'Switch to the neighbouring line at the closest fork'],
  ['Ctrl + ←', 'Jump back to the fork where the current line branched'],
  ['Ctrl + →', 'Jump forward to the next fork (or the end of the line)'],
  ['Home / End', 'Start of the game / end of the current line'],
  ['T', 'Switch between move list and tree graph'],
  ['F', 'Flip the board'],
  ['?', 'Show this help'],
  ['Esc', 'Close popups'],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys}</kbd>
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
