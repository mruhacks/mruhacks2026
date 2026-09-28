import { cn } from '@/lib/utils';

/**
 * Label / filled track / percentage row — the question-breakdown readout in
 * the mockup.
 *
 * A single hue across every bar on purpose: these bars encode one measure
 * (share of responses), so colour carries no extra information and varying
 * it would imply a grouping that doesn't exist. Inactive options are dimmed
 * rather than recoloured, matching the convention in the stats view.
 */
export function BarMeter({
  label,
  percent,
  inactive,
}: {
  label: string;
  percent: number;
  inactive?: boolean;
}) {
  const width = Math.max(0, Math.min(100, percent));

  return (
    <div className='flex items-center gap-3'>
      <span
        className={cn(
          'w-28 shrink-0 truncate text-sm sm:w-36',
          inactive && 'text-muted-foreground',
        )}
        title={label}
      >
        {label}
      </span>
      <span
        className='bg-muted relative h-2 flex-1 overflow-hidden rounded-full'
        role='img'
        aria-label={`${label}: ${Math.round(percent)} percent`}
      >
        <span
          className={cn(
            'absolute inset-y-0 left-0 rounded-full',
            inactive ? 'bg-(--chart-5)/45' : 'bg-(--chart-5)',
          )}
          style={{ width: `${width}%` }}
        />
      </span>
      <span className='text-muted-foreground w-10 shrink-0 text-right text-sm tabular-nums'>
        {Math.round(percent)}%
      </span>
    </div>
  );
}
