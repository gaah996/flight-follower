import { Tooltip, TooltipContent, TooltipTrigger } from '@heroui/react';

type Props = {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
};

export function Row({ label, tooltip, children }: Props) {
  const labelEl = (
    <span
      style={{
        color: 'var(--ff-fg-muted)',
        cursor: tooltip ? 'help' : undefined,
      }}
    >
      {label}
    </span>
  );
  return (
    <div className="ff-row flex justify-between text-sm">
      {tooltip ? (
        <Tooltip>
          <TooltipTrigger>{labelEl}</TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </Tooltip>
      ) : (
        labelEl
      )}
      <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--ff-fg)' }}>{children}</span>
    </div>
  );
}
