import { figurine } from '../chess/notation';

/** SAN with a figurine for the piece letter. */
export function San({ san }: { san: string }) {
  const [piece, rest] = figurine(san);
  return (
    <span className="san">
      {piece && <span className="san-piece">{piece}</span>}
      {rest}
    </span>
  );
}
