import * as React from 'react';

type OverviewLayoutProps = {
  children: React.ReactNode;
  summary: React.ReactNode;
  description: React.ReactNode;
  copy: React.ReactNode;
  wiki: React.ReactNode;
  applications: React.ReactNode;
  breakdown: React.ReactNode;
};

/**
 * The bento grid. Each cell is a parallel-route slot so it owns its own
 * Suspense boundary (`loading.tsx`) and error boundary — one slow or failing
 * section can't hold up or take down the others.
 *
 * Sync, with no `await` anywhere: per the parallel-routes rules, if one slot
 * at a segment is dynamic then every slot at that segment is, so a single
 * top-level await here would collapse the static shell for the whole page.
 * Each cell keeps its own dynamic work behind its own boundary instead.
 *
 * The two-column row is built here rather than inside a cell because its
 * columns come from different slots: the description reads the event row
 * while the wiki and the chart read their own tables, and stacking them in
 * one slot would put all three behind a single boundary.
 */
export default function EventOverviewLayout({
  children,
  summary,
  description,
  copy,
  wiki,
  applications,
  breakdown,
}: OverviewLayoutProps) {
  return (
    <div className='flex flex-col gap-8'>
      {children}
      {summary}

      <div className='grid grid-cols-1 gap-4 lg:min-h-96 lg:grid-cols-5'>
        {/* Size containment lets the neighboring column determine the row's
            height; the schedule scrolls inside that available space. */}
        <div className='min-w-0 lg:col-span-3 lg:contain-[size]'>
          {description}
        </div>
        {/* Wiki, then applications-over-time beneath it. A cell the viewer
            can't see renders null, so the column simply gets shorter. */}
        <div className='flex flex-col gap-4 lg:col-span-2'>
          {copy}
          {wiki}
          {applications}
        </div>
      </div>

      {breakdown}
    </div>
  );
}
