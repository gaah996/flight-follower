type Props = {
  label: string;
  children: React.ReactNode;
};

export function Row({ label, children }: Props) {
  return (
    <div className="ff-row flex justify-between text-sm">
      <span style={{ color: 'var(--ff-fg-muted)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>{children}</span>
    </div>
  );
}
