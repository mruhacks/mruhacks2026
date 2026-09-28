import { BentoCardSkeleton } from '../../_components/bento-card';

export default function BreakdownLoading() {
  return (
    <section className='space-y-4'>
      <div className='bg-muted h-7 w-72 animate-pulse rounded-sm' />
      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        {[0, 1, 2, 3].map((i) => (
          <BentoCardSkeleton key={i} rows={4} />
        ))}
      </div>
    </section>
  );
}
