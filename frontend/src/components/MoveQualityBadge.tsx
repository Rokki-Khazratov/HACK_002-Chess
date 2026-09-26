import type { MoveQuality } from '../chess/moveQuality';

const QUALITY: Record<MoveQuality, { mark: string; label: string }> = {
  brilliant: { mark: '!!', label: 'Brilliant — sound piece sacrifice' },
  best: { mark: '★', label: 'Best move' },
  excellent: { mark: '!', label: 'Excellent move' },
  good: { mark: '✓', label: 'Good move' },
  inaccuracy: { mark: '?!', label: 'Inaccuracy' },
  mistake: { mark: '?', label: 'Mistake' },
  blunder: { mark: '??', label: 'Blunder' },
};

export function MoveQualityBadge({ quality }: { quality: MoveQuality }) {
  const { mark, label } = QUALITY[quality];
  return <span className={`move-quality move-quality-${quality}`} title={label} aria-label={label}>{mark}</span>;
}
