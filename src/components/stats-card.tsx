/**
 * Props for the StatCard component.
 */
export interface StatCardProps {
  color?: string; // bg color of the card
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
  color = '#FFE2A5',
  title = '',
  image = '',
  description = '',
  rotation = '0',
  left = '24px',
}: StatCardProps) {
  return (
    <div
      className='relative flex h-[300px] w-[200px] flex-col overflow-hidden rounded-lg p-4 shadow-md sm:h-72 sm:w-48 md:h-80 md:w-56 lg:h-96 lg:w-64'
      style={{ backgroundColor: color, color: '#00000099' }}
    >
      {title && (
        <h2 className='mb-1 text-left text-[48px] leading-none font-extrabold tracking-[-0.04em]'>
          {title}
        </h2>
      )}

      {description && (
        <p className='text-left text-sm leading-none font-medium'>
          {description}
        </p>
      )}

      {image && (
        <img
          src={image}
          alt={title || 'stat image'}
          className='/* Mobile (fixed size) */ /* Scale proportionally at breakpoints */ absolute top-[154px] h-[119px] w-[187px] rounded-lg border-2 object-cover sm:h-[114px] sm:w-[180px] md:h-[132px] md:w-[209px] lg:h-[151px] lg:w-[239px]'
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
