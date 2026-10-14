import { Icon, type IconName } from './Icon';
export function CategoryPill({
  label,
  active = false,
  onClick,
  icon,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  icon?: IconName;
}) {
  return (
    <button
      type="button"
      className={`category-pill ${active ? 'is-active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon && <Icon name={icon} />}
      {label}
    </button>
  );
}
