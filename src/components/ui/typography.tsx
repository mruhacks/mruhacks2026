import { cn } from "@/lib/utils";

interface TypographyProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * PreTitle
 * Small section label text
 */
export function PreTitle({ children, className }: TypographyProps) {
  return (
    <p className={cn("mb-2 text-sm font-semibold sm:text-base", className)}>
      {children}
    </p>
  );
}

/**
 * MainTitle
 * Primary section heading
 */
export function MainTitle({ children, className }: TypographyProps) {
  return (
    <h1
      className={cn(
        "mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl",
        className
      )}
    >
      {children}
    </h1>
  );
}

/**
 * Description
 * Paragraph text used for sections
 */
export function Description({ children, className }: TypographyProps) {
  return (
    <p
      className={cn(
        "mb-6 text-base text-description sm:mb-10 sm:text-lg",
        className
      )}
    >
      {children}
    </p>
  );
}