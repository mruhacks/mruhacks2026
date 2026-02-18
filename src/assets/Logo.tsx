import Image, { ImageProps } from 'next/image';

import blackLogo from '@/assets/black_logo.png';
import whiteLogo from '@/assets/white_logo.png';
import colorBlackLogo from '@/assets/color_black_logo.png';
import colorWhiteLogo from '@/assets/color_white_logo.png';

export type LogoVariant = 'black' | 'white' | 'gradient';
export type TextColor = 'black' | 'white';

export interface LogoProps extends Omit<ImageProps, 'src' | 'alt'> {
  /**
   * Logo variant: "black", "white", or "color"
   */
  variant?: LogoVariant;

  /**
   * Text color: "black" or "white"
   * Only relevant for the "color" variant
   */
  text?: TextColor;

  /** Alt text for accessibility */
  alt?: string;
}

/**
 * MRUHacks full logo component.
 * Supports black/white/color variants and text color control.
 */
export default function Logo({
  variant = 'gradient',
  text = 'black',
  alt = 'MRUHacks Logo',
  ...props
}: LogoProps) {
  const src = getLogoSource(variant, text);
  return <Image src={src} alt={alt} {...props} />;
}

function getLogoSource(variant: LogoVariant, text: TextColor) {
  switch (variant) {
    case 'black':
      return blackLogo;
    case 'white':
      return whiteLogo;
    case 'gradient':
      return text === 'white' ? colorWhiteLogo : colorBlackLogo;
  }
}
