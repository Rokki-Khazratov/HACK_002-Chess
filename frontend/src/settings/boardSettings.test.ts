import { describe, expect, it } from 'vitest';
import { BOARD_THEMES, DEFAULT_SETTINGS, PIECE_SETS, themeColors, withAlpha } from './boardSettings';

describe('board settings', () => {
  it('converts hex colours to rgba', () => {
    expect(withAlpha('#f6f669', 0.5)).toBe('rgba(246, 246, 105, 0.5)');
  });

  it('resolves the custom theme from the chosen colours', () => {
    const colors = themeColors({ ...DEFAULT_SETTINGS, boardTheme: 'custom', customLight: '#ffffff', customDark: '#000000' });
    expect([colors.light, colors.dark]).toEqual(['#ffffff', '#000000']);
  });

  it('falls back to a real theme for an unknown id', () => {
    expect(BOARD_THEMES).toContain(themeColors({ ...DEFAULT_SETTINGS, boardTheme: 'gone' }));
  });

  it('ships all twelve images for every downloaded piece set', () => {
    const files = new Set(Object.keys(import.meta.glob('/public/pieces/*/*.svg')));
    for (const set of PIECE_SETS.filter((s) => s.dir)) {
      for (const code of ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']) {
        expect(files.has(`/public/pieces/${set.dir}/${code}.svg`), `${set.dir}/${code}`).toBe(true);
      }
    }
  });
});
