import Image, { ImageProps, StaticImageData } from 'next/image';

import whiteChevron from './white_chevron.png';
import blackChevron from './black_chevron.png';
import gradientChevron from './color_chevron.png';

export type ChevronVariant = 'white' | 'black' | 'gradient';

const chevronSources: Record<ChevronVariant, StaticImageData> = {
  white: whiteChevron,
  black: blackChevron,
  gradient: gradientChevron,
};

export interface ChevronProps extends Omit<ImageProps, 'src' | 'alt'> {
  variant?: ChevronVariant;
  alt?: string;
}

export default function Chevron({
  variant = 'gradient',
  alt = 'MRUHacks Chevron Logo',
  ...props
}: ChevronProps) {
  const src = chevronSources[variant];
  return <Image src={src} alt={alt} {...props} />;
}
