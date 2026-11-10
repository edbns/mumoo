export type NotchItem<Id extends string | number> = { id: Id; label: string; disabled?: boolean };

/** The notch hanging from the top edge of the page. The place the person is at is green; the green moves on when the person does, or when the work does. */
export function NotchNav<Id extends string | number>({ label, items, current, onSelect }: {
  label: string;
  items: readonly NotchItem<Id>[];
  current: Id;
  onSelect: (id: Id) => void;
}) {
  return <nav className="step-nav" aria-label={label}>
    <ol>
      {items.map(item => <li key={item.id}>
        <button type="button" aria-current={item.id === current ? 'step' : undefined} disabled={item.disabled} onClick={() => onSelect(item.id)}>{item.label}</button>
      </li>)}
    </ol>
  </nav>;
}
