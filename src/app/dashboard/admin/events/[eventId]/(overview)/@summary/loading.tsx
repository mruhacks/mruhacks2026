import { StatTileSkeleton } from '../../_components/stat-tile';

export default function SummaryLoading() {
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5'>
      {[0, 1, 2, 3, 4].map((i) => (
        <StatTileSkeleton key={i} />
      ))}
    </div>
  );
}
