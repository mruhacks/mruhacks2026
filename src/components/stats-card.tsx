import Image from 'next/image';

/**
 * Props for the StatCard component.
 */
export interface StatCardProps {
  color?: 'yellow' | 'skyblue' | 'purple' | 'red' | 'blue'; // bg color of the card
  title?: string; // heading for stat
  image?: string; // url of image displayed in card
  description?: string; // description about stat
  left?: string; // left horizontal offset for the image
  right?: string; // right horizontal offset for the image
  imageWidth?: number; // default width of image
  imageHeight?: number; // default height of image
}

/**
 * StatCard
 *
 * A responsive statistics card component that displays a title, desciption, and image.
 *
 * This component is intended to be used for the homepage statistics section.
 *
 * @param props - configuration options for rendering the StatCard
 * @returns a styled responsive statistics card component
 */
export function StatCard({
  color = 'yellow',
  title = '',
  image = '',
  description = '',
  left = '1.5em',
  right,
  imageWidth = 10,
  imageHeight = 7,
}: StatCardProps) {
  const colors = {
    yellow: 'bg-card-yellow',
    skyblue: 'bg-card-skyblue',
    purple: 'bg-card-purple',
    red: 'bg-card-red',
    blue: 'bg-card-blue',
  };

  const horizontalStyle = right ? { right } : { left };

  return (
    <div
      className={` ${colors[color]} text-card-text relative flex h-[18.75em] w-[12.5em] flex-col justify-between rounded-lg p-4 text-left shadow-md sm:h-72 sm:w-48 md:h-80 md:w-56 lg:h-96 lg:w-64`}
    >
      <div className='flex flex-col gap-1'>
        {title && (
          <h2 className='text-5xl leading-none font-extrabold tracking-[-0.04em] lg:text-6xl'>
            {title}
          </h2>
        )}
        {description && (
          <p className='text-sm/snug font-medium lg:text-base'>{description}</p>
        )}
      </div>

      {image && imageWidth && imageHeight && (
        <div
          className='absolute bottom-6 z-10 w-[75%] max-w-60'
          style={horizontalStyle}
        >
          <div
            className='relative w-full'
            style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
          >
            <Image
              src={image}
              alt={title || 'stat image'}
              fill
              className='rounded-lg object-contain'
              sizes='(max-width: 640px) 75vw,
                     (max-width: 1024px) 40vw,
                     300px'
            />
          </div>
        </div>
      )}
    </div>
  );
}
