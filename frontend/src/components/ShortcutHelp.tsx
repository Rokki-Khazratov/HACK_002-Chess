const SHORTCUTS: [keys: string, action: string][] = [
  ['← / →', 'Previous / next move (→ at a fork opens the line chooser)'],
  ['↑ / ↓', 'In Tree: switch to the neighbouring branch; in the chooser: pick a line'],
  ['Enter', 'Follow the chosen line'],
  ['Mod + ↑ / ↓', 'Switch to the neighbouring line at the closest fork'],
  ['Mod + ←', 'Jump back to the fork where the current line branched'],
  ['Mod + →', 'Jump forward to the next fork (or the end of the line)'],
  ['[ / ]', 'Previous / next fork'],
  ['Home / End', 'Start of the game / end of the current line'],
  ['T', 'Switch between move list and tree graph'],
  ['F', 'Flip the board'],
  ['C', 'Show or hide coach'],
  ['Q', 'Show or hide move quality icons'],
  ['?', 'Show this help'],
  ['Esc', 'Close popups'],
];

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  const modifier = /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl';
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h2>Keyboard shortcuts</h2>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={keys}>
                <td>
                  <kbd>{keys.replace('Mod', modifier)}</kbd>
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
