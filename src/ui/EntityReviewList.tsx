import { itemKey } from '../domain/items';
import type { Item } from '../domain/types';

interface Props {
  items: Item[];
  excluded: Set<string>;
  onToggle: (key: string) => void;
}

export function EntityReviewList({ items, excluded, onToggle }: Props) {
  return (
    <ul className="review-list">
      {items.map((item) => {
        const key = itemKey(item.category, item.value);
        const checked = !excluded.has(key);
        return (
          <li key={key} className={checked ? 'row' : 'row excluded'}>
            <label className="row-label">
              <input type="checkbox" checked={checked} onChange={() => onToggle(key)} />
              <span className="row-category">{item.category}</span>
              <span className="row-value">{item.value}</span>
              <span className="row-count">{item.spans.length}×</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
