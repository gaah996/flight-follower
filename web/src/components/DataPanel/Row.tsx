type Props = {
  label: string;
  children: React.ReactNode;
};

export function Row({ label, children }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--ff-fg-muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>{children}</span>
    </div>
  );
}
