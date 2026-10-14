export function Spinner({ label, small = false }: { label: string; small?: boolean }) {
  return <span aria-label={label} className={small ? 'loading-spinner loading-spinner-sm' : 'loading-spinner'} role="status" />;
}
