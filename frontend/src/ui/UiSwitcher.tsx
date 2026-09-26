import { UI_VARIANTS } from './variants';

interface Props {
  current: string;
  onChange: (id: string) => void;
}

/** Dev-only floating switcher between the UI variants. */
export function UiSwitcher({ current, onChange }: Props) {
  const active = UI_VARIANTS.find((v) => v.id === current);
  return (
    <div className="ui-switcher" onClick={(event) => event.stopPropagation()}>
      <span className="ui-switcher-label">UI</span>
      {UI_VARIANTS.map((variant, index) => (
        <button
          key={variant.id}
          type="button"
          className={`ui-switcher-item${variant.id === current ? ' ui-switcher-item-active' : ''}`}
          onClick={() => onChange(variant.id)}
          title={variant.pitch}
        >
          <span className="ui-switcher-index">{index + 1}</span>
          {variant.name}
        </button>
      ))}
      {active && <span className="ui-switcher-pitch">{active.pitch}</span>}
    </div>
  );
}
