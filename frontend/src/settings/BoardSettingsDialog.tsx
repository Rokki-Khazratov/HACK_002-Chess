import { type CSSProperties, type ReactNode, useEffect } from 'react';
import { Chessboard, defaultPieces } from 'react-chessboard';
import { boardLook, pieceUrl } from './boardLook';
import {
  ARROW_COLORS,
  BOARD_THEMES,
  type BoardSettings,
  HIGHLIGHT_COLORS,
  PIECE_SETS,
  resetBoardSettings,
  updateBoardSettings,
  useBoardSettings,
} from './boardSettings';
import './board-settings.css';

// Ruy Lopez after 3...a6: the preview shows a last move, a selected bishop with
// its targets and an engine arrow, so every setting has something to change.
const PREVIEW_FEN = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
const PREVIEW_TARGETS = ['a4', 'c4', 'xc6'];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bs-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="bs-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="bs-toggle-track" aria-hidden="true" />
    </label>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (value: T) => void }) {
  return (
    <div className="bs-segmented" role="radiogroup">
      {options.map(([id, label]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className={value === id ? 'is-active' : ''} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Swatches({ value, colors, onChange, label }: { value: string; colors: { id: string; name: string; value: string }[]; onChange: (value: string) => void; label: string }) {
  return (
    <div className="bs-swatches" role="radiogroup" aria-label={label}>
      {colors.map((color) => (
        <button
          key={color.id}
          type="button"
          role="radio"
          aria-checked={value === color.value}
          title={color.name}
          className={`bs-swatch${value === color.value ? ' is-active' : ''}`}
          style={{ background: color.value }}
          onClick={() => onChange(color.value)}
        />
      ))}
      <label className="bs-swatch bs-swatch-custom" title="Свой цвет">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function Preview({ settings }: { settings: BoardSettings }) {
  const look = boardLook(settings);
  const squareStyles: Record<string, CSSProperties> = {};
  if (settings.highlightMoves) {
    squareStyles.a7 = { background: 'var(--board-lastMove-from)' };
    squareStyles.a6 = { background: 'var(--board-lastMove)' };
  }
  squareStyles.b5 = { background: 'var(--board-selected)', boxShadow: 'inset 0 0 0 3px var(--board-selected-ring)' };
  if (settings.showLegalMoves) {
    for (const target of PREVIEW_TARGETS) {
      const capture = target.startsWith('x');
      squareStyles[capture ? target.slice(1) : target] = capture
        ? { background: 'radial-gradient(circle, transparent 58%, var(--board-legalMove) 60%)' }
        : { background: 'radial-gradient(circle, var(--board-legalMove) 22%, transparent 24%)' };
    }
  }
  return (
    <div className="bs-preview" style={look.vars}>
      <Chessboard
        options={{
          id: 'settings-preview',
          position: PREVIEW_FEN,
          allowDragging: false,
          squareStyles,
          arrows: [{ startSquare: 'b5', endSquare: 'a4', color: settings.arrowColor }],
          ...look.options,
        }}
      />
    </div>
  );
}

/** chess.com-style "Board & Pieces" settings with a live preview. */
export function BoardSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useBoardSettings();
  const set = (patch: Partial<BoardSettings>) => updateBoardSettings(patch);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="bs-dialog" role="dialog" aria-label="Оформление доски" onClick={(e) => e.stopPropagation()}>
        <header className="bs-header">
          <h2>Доска и фигуры</h2>
          <button type="button" className="bs-close" onClick={onClose} aria-label="Закрыть">×</button>
        </header>

        <div className="bs-body">
          <div className="bs-preview-column">
            <Preview settings={settings} />
            <p className="bs-hint">Изменения применяются сразу и сохраняются в этом браузере.</p>
          </div>

          <div className="bs-controls">
            <Section title="Фигуры">
              <div className="bs-grid bs-pieces">
                {PIECE_SETS.map((pieceSet) => (
                  <button
                    key={pieceSet.id}
                    type="button"
                    className={`bs-tile${settings.pieceSet === pieceSet.id ? ' is-active' : ''}`}
                    onClick={() => set({ pieceSet: pieceSet.id })}
                    title={pieceSet.name}
                  >
                    <span className="bs-piece-pair">
                      {pieceSet.dir ? (
                        <>
                          <img src={pieceUrl(pieceSet.dir, 'wN')} alt="" />
                          <img src={pieceUrl(pieceSet.dir, 'bQ')} alt="" />
                        </>
                      ) : (
                        <>
                          <span className="bs-piece-svg">{defaultPieces.wN()}</span>
                          <span className="bs-piece-svg">{defaultPieces.bQ()}</span>
                        </>
                      )}
                    </span>
                    <span className="bs-tile-name">{pieceSet.name}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Доска">
              <div className="bs-grid bs-boards">
                {BOARD_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className={`bs-tile${settings.boardTheme === theme.id ? ' is-active' : ''}`}
                    onClick={() => set({ boardTheme: theme.id })}
                    title={theme.name}
                  >
                    <span className="bs-board-swatch">
                      {[theme.light, theme.dark, theme.dark, theme.light].map((color, i) => (
                        <span
                          key={i}
                          style={{
                            backgroundColor: color,
                            backgroundImage: color === theme.light ? theme.lightImage : theme.darkImage,
                          }}
                        />
                      ))}
                    </span>
                    <span className="bs-tile-name">{theme.name}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`bs-tile${settings.boardTheme === 'custom' ? ' is-active' : ''}`}
                  onClick={() => set({ boardTheme: 'custom' })}
                  title="Свои цвета"
                >
                  <span className="bs-board-swatch">
                    {[settings.customLight, settings.customDark, settings.customDark, settings.customLight].map((color, i) => (
                      <span key={i} style={{ backgroundColor: color }} />
                    ))}
                  </span>
                  <span className="bs-tile-name">Свои</span>
                </button>
              </div>
              {settings.boardTheme === 'custom' && (
                <div className="bs-custom-colors">
                  <label>
                    <input type="color" value={settings.customLight} onChange={(e) => set({ customLight: e.target.value })} />
                    Светлые поля
                  </label>
                  <label>
                    <input type="color" value={settings.customDark} onChange={(e) => set({ customDark: e.target.value })} />
                    Тёмные поля
                  </label>
                </div>
              )}
            </Section>

            <Section title="Подсветка">
              <Toggle label="Подсвечивать последний ход" checked={settings.highlightMoves} onChange={(v) => set({ highlightMoves: v })} />
              <Swatches label="Цвет подсветки" value={settings.highlightColor} colors={HIGHLIGHT_COLORS} onChange={(v) => set({ highlightColor: v })} />
              <Toggle label="Показывать возможные ходы" checked={settings.showLegalMoves} onChange={(v) => set({ showLegalMoves: v })} />
            </Section>

            <Section title="Стрелка движка">
              <Swatches label="Цвет стрелки" value={settings.arrowColor} colors={ARROW_COLORS} onChange={(v) => set({ arrowColor: v })} />
            </Section>

            <Section title="Координаты">
              <Segmented
                value={settings.coordinates}
                options={[['inside', 'На доске'], ['none', 'Скрыть']]}
                onChange={(v) => set({ coordinates: v })}
              />
            </Section>

            <Section title="Анимация фигур">
              <Segmented
                value={settings.animation}
                options={[['none', 'Нет'], ['fast', 'Быстро'], ['normal', 'Обычно'], ['slow', 'Медленно']]}
                onChange={(v) => set({ animation: v })}
              />
            </Section>

            <Section title="Интерфейс">
              <Toggle label="Шкала оценки у доски" checked={settings.showEvalBar} onChange={(v) => set({ showEvalBar: v })} />
            </Section>
          </div>
        </div>

        <footer className="bs-footer">
          <button type="button" className="btn" onClick={resetBoardSettings}>Сбросить</button>
          <button type="button" className="btn bs-done" onClick={onClose}>Готово</button>
        </footer>
      </div>
    </div>
  );
}
