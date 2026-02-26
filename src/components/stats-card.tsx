/**
 * Props for the StatCard component.
 */
export interface StatCardProps {
  color?: 'yellow' | 'skyblue' | 'purple' | 'red' | 'blue'; // bg color of the card
  title?: string; // heading for stat
  image?: string; // url of image displayed in card
  description?: string; // description about stat
  rotation?: string; // rotation applied to image in degrees
  left?: string; // horizontal offset for the image
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
  rotation = '0',
  left = '1.5em',
}: StatCardProps) {
  const colors = {
    'yellow': 'bg-card-yellow',
    'skyblue': 'bg-card-skyblue',
    'purple': 'bg-card-purple',
    'red': 'bg-card-red',
    'blue': 'bg-card-blue',
  };

  return (
    <div
    className={`
      ${colors[color]}
      relative flex h-[18.75em] w-[12.5em] flex-col overflow-hidden rounded-lg p-4 shadow-md
      sm:h-72 sm:w-48 md:h-80 md:w-56 lg:h-96 lg:w-64
      text-card-text
    `}
  >
      {title && (
        <h2 className='mb-1 text-5xl leading-none font-extrabold tracking-[-0.04em]'>
          {title}
        </h2>
      )}

      {description && (
        <p className='text-sm leading-none font-medium'>
          {description}
        </p>
      )}

      {image && (
        <img
          src={image}
          alt={title || 'stat image'}
          className='absolute bottom-[1.5em] h-[7.4375em] w-[11.6875em] rounded-lg border-2 object-cover sm:h-[7.125em] sm:w-[11.25em] md:h-[8.25em] md:w-[13.0625em] lg:h-[9.4375em] lg:w-[14.9375em]'
          style={{
            left,
            borderColor: '#00000099',
            transform: `rotate(${rotation}deg)`,
            transformOrigin: 'center',
          }}
        />
      )}
    </div>
  );
}
