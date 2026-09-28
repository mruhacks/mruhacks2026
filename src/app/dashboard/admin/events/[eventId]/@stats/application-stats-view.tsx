'use client';

import * as React from 'react';
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import {
  getApplicationStats,
  type EventApplicationStats,
} from '@/app/dashboard/admin/events/actions';
import type { QuestionStats, StatsBucket } from '@/lib/application-stats';
import {
  applicationStatusDisplayList,
  type ApplicationStatus,
} from '@/types/lookups';

type ApplicationStatsViewProps = {
  eventId: string;
  initialStats: EventApplicationStats;
};

type StatusFilter = ApplicationStatus | 'all';

type DemographicField = keyof EventApplicationStats['demographics'];

const STATUS_TITLES = Object.fromEntries(
  applicationStatusDisplayList.map((entry) => [entry.label, entry.title]),
) as Record<ApplicationStatus, string>;

const DEMOGRAPHIC_LABELS: Record<DemographicField, string> = {
  university: 'University',
  major: 'Major',
  yearOfStudy: 'Year of study',
  gender: 'Gender',
};

// One series per chart, one colour — this key is the only entry in every
// chart's config, matching the "one colour per chart" rule (bars are a
// single series; nothing here is rainbow-coded by category).
const barChartConfig: ChartConfig = {
  count: { label: 'Applicants', color: 'var(--chart-5)' },
};

function bucketChartHeight(bucketCount: number): number {
  return Math.max(160, 48 + bucketCount * 44);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function tooltipFormatter(
  value: unknown,
  _name: unknown,
  item: { payload?: { percent?: number } },
) {
  const percent = item.payload?.percent;
  return (
    <div className='flex w-full items-center justify-between gap-4'>
      <span className='text-muted-foreground'>Applicants</span>
      <span className='text-foreground font-mono font-medium tabular-nums'>
        {String(value)}
        {typeof percent === 'number' ? ` (${percent.toFixed(0)}%)` : ''}
      </span>
    </div>
  );
}

function OtherTexts({ texts }: { texts: string[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? texts : texts.slice(0, 3);

  return (
    <div className='mt-1 space-y-1'>
      {shown.map((text, index) => (
        <p key={index} className='text-muted-foreground text-xs italic'>
          &ldquo;{text}&rdquo;
        </p>
      ))}
      {texts.length > 3 && (
        <button
          type='button'
          className='text-primary text-xs underline underline-offset-2'
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Show less' : `Show all ${texts.length} responses`}
        </button>
      )}
    </div>
  );
}

/** Horizontal bars — used for single_select / multi_select / boolean, whose
 * option labels are long sentences that need the room. */
function HorizontalBucketChart({ buckets }: { buckets: StatsBucket[] }) {
  const data = buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.inactive ? `${bucket.label} (inactive)` : bucket.label,
    count: bucket.count,
    percent: bucket.percent,
    inactive: Boolean(bucket.inactive),
  }));

  return (
    <ChartContainer
      config={barChartConfig}
      style={{ aspectRatio: 'auto', height: bucketChartHeight(data.length) }}
      className='w-full'
    >
      <BarChart
        accessibilityLayer
        data={data}
        layout='vertical'
        margin={{ left: 8, right: 16 }}
      >
        <CartesianGrid horizontal={false} strokeDasharray='3 3' />
        <XAxis type='number' allowDecimals={false} tickLine={false} axisLine={false} />
        <YAxis
          dataKey='label'
          type='category'
          tickLine={false}
          axisLine={false}
          width={160}
          tick={{ fontSize: 12 }}
        />
        <ChartTooltip
          content={<ChartTooltipContent formatter={tooltipFormatter} />}
        />
        <Bar dataKey='count' fill='var(--color-count)' radius={4}>
          {data.map((entry) => (
            <Cell
              key={entry.key}
              fill='var(--color-count)'
              fillOpacity={entry.inactive ? 0.45 : 1}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

function NumberHistogram({ question }: { question: QuestionStats }) {
  const data = question.buckets.map((bucket) => ({
    label: bucket.label,
    count: bucket.count,
    percent: bucket.percent,
  }));

  return (
    <div className='space-y-4'>
      {question.numeric && (
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
          <Stat label='Min' value={question.numeric.min} />
          <Stat label='Max' value={question.numeric.max} />
          <Stat label='Mean' value={round1(question.numeric.mean)} />
          <Stat label='Median' value={round1(question.numeric.median)} />
        </div>
      )}
      <ChartContainer
        config={barChartConfig}
        style={{ aspectRatio: 'auto', height: 220 }}
        className='w-full'
      >
        <BarChart accessibilityLayer data={data} margin={{ left: 8, right: 8 }}>
          <CartesianGrid vertical={false} strokeDasharray='3 3' />
          <XAxis
            dataKey='label'
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
          <ChartTooltip
            content={<ChartTooltipContent formatter={tooltipFormatter} />}
          />
          <Bar dataKey='count' fill='var(--color-count)' radius={4} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className='rounded-lg border p-3'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <p className='text-lg font-semibold'>{value}</p>
    </div>
  );
}

function QuestionCard({ question }: { question: QuestionStats }) {
  const noResponse = question.total - question.answered;
  const otherBuckets = question.buckets.filter(
    (bucket) => bucket.isOther && bucket.otherTexts?.length,
  );

  return (
    <Card>
      <CardHeader>
        <CardDescription className='text-foreground text-sm font-medium'>
          {question.label}
        </CardDescription>
        <p className='text-muted-foreground text-xs'>
          {question.answered} of {question.total} answered
          {noResponse > 0 ? ` · ${noResponse} no response` : ''}
          {question.type === 'multi_select'
            ? ' · percentages are of respondents and can exceed 100%'
            : ''}
        </p>
      </CardHeader>
      <CardContent className='space-y-3'>
        {question.type === 'number' ? (
          <NumberHistogram question={question} />
        ) : (
          <HorizontalBucketChart buckets={question.buckets} />
        )}
        {otherBuckets.length > 0 && (
          <div className='space-y-2 border-t pt-3'>
            {otherBuckets.map((bucket) => (
              <div key={bucket.key}>
                <p className='text-xs font-medium'>
                  &ldquo;{bucket.label}&rdquo; responses
                </p>
                <OtherTexts texts={bucket.otherTexts ?? []} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBreakdown({ buckets }: { buckets: StatsBucket[] }) {
  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
      {buckets.map((bucket) => (
        <Card key={bucket.key}>
          <CardHeader className='pb-2'>
            <CardDescription>
              {STATUS_TITLES[bucket.key as ApplicationStatus] ?? bucket.label}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-semibold'>{bucket.count}</div>
            <p className='text-muted-foreground text-xs'>
              {bucket.percent.toFixed(0)}%
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// Demographic buckets come back in first-seen insertion order, not sorted —
// unlike question option buckets (deliberately kept in authored order), so
// sort these by count and, when the list is long (university/major can run
// to dozens of options), fold the long tail into a single "Other" bucket
// rather than letting it dominate the chart.
const DEMOGRAPHIC_TOP_N = 8;

function capBucketsForDisplay(
  buckets: StatsBucket[],
  topN = DEMOGRAPHIC_TOP_N,
): StatsBucket[] {
  const sorted = [...buckets].sort((a, b) => b.count - a.count);
  if (sorted.length <= topN) return sorted;

  const head = sorted.slice(0, topN - 1);
  const rest = sorted.slice(topN - 1);
  const restCount = rest.reduce((sum, bucket) => sum + bucket.count, 0);
  const restPercent = rest.reduce((sum, bucket) => sum + bucket.percent, 0);

  return [
    ...head,
    {
      key: '__other__',
      label: `Other (${rest.length})`,
      count: restCount,
      percent: restPercent,
    },
  ];
}

function DemographicCard({
  field,
  buckets,
}: {
  field: DemographicField;
  buckets: StatsBucket[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className='text-foreground text-sm font-medium'>
          {DEMOGRAPHIC_LABELS[field]}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <HorizontalBucketChart buckets={capBucketsForDisplay(buckets)} />
      </CardContent>
    </Card>
  );
}

export function ApplicationStatsView({
  eventId,
  initialStats,
}: ApplicationStatsViewProps) {
  const [status, setStatus] = React.useState<StatusFilter>('all');
  const [stats, setStats] = React.useState<EventApplicationStats>(initialStats);
  const [loading, setLoading] = React.useState(false);
  const isFirstRun = React.useRef(true);

  React.useEffect(() => {
    // The server already fetched the unfiltered ('all') view for first
    // paint — skip the redundant re-fetch on mount and only load again when
    // the filter actually changes.
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    let cancelled = false;
    async function load() {
      setLoading(true);
      const result = await getApplicationStats(eventId, status);
      if (cancelled) return;
      if (result.success && result.data) {
        setStats(result.data);
      } else if (!result.success) {
        toast.error(result.error || 'Failed to load statistics');
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [eventId, status]);

  if (!stats.hasApplication) {
    return (
      <div className='space-y-4'>
        <div>
          <h2 className='text-lg font-semibold'>Application Statistics</h2>
        </div>
        <p className='text-muted-foreground text-sm'>
          This event does not use an application form, so there is nothing to
          report on.
        </p>
      </div>
    );
  }

  const demographicEntries = Object.entries(stats.demographics) as [
    DemographicField,
    StatsBucket[],
  ][];

  return (
    <div className='space-y-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>Application Statistics</h2>
          <p className='text-muted-foreground mt-1 text-sm'>
            {stats.total} application{stats.total !== 1 ? 's' : ''} in scope
          </p>
        </div>
        <Select
          value={status}
          onValueChange={(value) => setStatus(value as StatusFilter)}
        >
          <SelectTrigger className='w-[200px]' aria-label='Filter by status'>
            <SelectValue placeholder='All applications' />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='all'>All applications</SelectItem>
            {applicationStatusDisplayList.map((entry) => (
              <SelectItem key={entry.label} value={entry.label}>
                {entry.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={cn('space-y-6', loading && 'opacity-60')}>
        <section>
          <h3 className='mb-3 text-sm font-semibold'>Status breakdown</h3>
          <StatusBreakdown buckets={stats.statusBreakdown} />
        </section>

        <section>
          <h3 className='mb-3 text-sm font-semibold'>Demographics</h3>
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
            {demographicEntries.map(([field, buckets]) => (
              <DemographicCard key={field} field={field} buckets={buckets} />
            ))}
          </div>
        </section>

        <section>
          <h3 className='mb-3 text-sm font-semibold'>Questions</h3>
          {stats.questionStats.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              No questions are flagged for reports. Turn on &quot;Show in
              Reports&quot; on a question to see it here.
            </p>
          ) : (
            <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
              {stats.questionStats.map((question) => (
                <QuestionCard key={question.questionId} question={question} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
