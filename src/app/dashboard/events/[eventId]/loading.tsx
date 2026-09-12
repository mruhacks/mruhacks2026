export default function EventEntryLoading() {
  return (
    <div className='flex flex-col gap-8'>
      <div className='flex flex-col gap-3'>
        <div className='bg-muted h-4 w-24 animate-pulse rounded' />
        <div className='bg-muted h-10 w-2/3 animate-pulse rounded' />
        <div className='bg-muted h-4 w-40 animate-pulse rounded' />
      </div>
      <div className='bg-muted h-48 animate-pulse rounded-lg' />
    </div>
  );
}
