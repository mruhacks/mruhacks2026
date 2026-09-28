'use client';

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts';

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { DEFAULT_LOCALE, EVENT_TIME_ZONE, formatInstant } from '@/lib/datetime';

export type OverTimePoint = {
  /** ISO instant for the start of that day in the event's zone. */
  day: string;
  count: number;
  cumulative: number;
};

/**
 * One series, so no legend box — the card title names the measure. Colour
 * carries no information here beyond "this is the line", which is why it's
 * the same single hue every other chart in the admin uses.
 */
const chartConfig: ChartConfig = {
  cumulative: { label: 'Applications', color: 'var(--chart-5)' },
};

/**
 * Axis ticks are formatted with an explicit `EVENT_TIME_ZONE` rather than the
 * ambient zone, so the label under a point matches the day the data was
 * bucketed into server-side. See AGENTS.md.
 */
function formatDay(iso: string) {
  return formatInstant(new Date(iso), EVENT_TIME_ZONE, DEFAULT_LOCALE, {
    month: 'short',
    day: 'numeric',
  });
}

export function ApplicationsOverTimeChart({ data }: { data: OverTimePoint[] }) {
  if (data.length === 0) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        No applications yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className='h-[220px] w-full'>
      <LineChart
        accessibilityLayer
        data={data}
        margin={{ left: 4, right: 12, top: 8, bottom: 4 }}
      >
        {/* Recessive: horizontal rules only, so the line stays the figure. */}
        <CartesianGrid vertical={false} strokeDasharray='3 3' />
        <XAxis
          dataKey='day'
          tickFormatter={formatDay}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tickLine={false}
          axisLine={false}
          width={36}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const iso = payload?.[0]?.payload?.day;
                return typeof iso === 'string' ? formatDay(iso) : '';
              }}
              formatter={(value) => [`${value} total`, '']}
            />
          }
        />
        <Line
          dataKey='cumulative'
          type='monotone'
          stroke='var(--color-cumulative)'
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, fill: 'var(--surface-card)' }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  );
}
