import { useState } from 'react';

export function PlayerAvatar({ id, name, className = '' }: { id?: number | null; name?: string | null; className?: string }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  return <span className={`player-portrait ${className}`} aria-hidden="true">
    {id && failedId !== id ? <img src={`/player-photos/${id}.webp`} alt="" onError={() => setFailedId(id)} /> : <span>{name?.trim().charAt(0) || '♞'}</span>}
  </span>;
}
