import Image from 'next/image';

export interface StatCardProps {
  color?: 'yellow' | 'skyblue' | 'purple' | 'red' | 'blue';
  title?: string;
  image?: string;
  description?: string;
}

export function StatCard({ color = 'yellow', title, image, description }: StatCardProps) {
  const colors = {
    yellow: 'bg-card-yellow',
    skyblue: 'bg-card-skyblue',
    purple: 'bg-card-purple',
    red: 'bg-card-red',
    blue: 'bg-card-blue',
  };

  return (
    <div className={`${colors[color]} text-card-text flex h-full w-full flex-col justify-between overflow-hidden rounded-lg p-6 text-left`}>
      <div className='flex flex-col gap-4'>
        {title && (
          <h2 className='text-6xl leading-none font-extrabold tracking-[-0.04em]'>{title}</h2>
        )}
        {description && (
          <p className='text-xl font-medium lg:text-base'>{description}</p>
        )}
      </div>

      {image && (
        <div className='mt-4 w-full'>
          <div className='relative aspect-4/3 w-full overflow-hidden rounded-lg border-2 border-black/60'>
            <Image
              src={image}
              alt={title || 'stat image'}
              fill
              className='rounded-lg object-cover'
              sizes='(max-width: 640px) 75vw, (max-width: 1024px) 40vw, 300px'
            />
          </div>
        </div>
      )}
    </div>
  );
}
