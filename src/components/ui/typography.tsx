import React from "react";

/**
 * PreTitle
 * Small section label text 
 */
export function PreTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-sm font-semibold text-pre-title-blue sm:text-base">
      {children}
    </p>
  );
}

/**
 * MainTitle
 * Primary section heading
 */
export function MainTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mb-4 text-2xl font-semibold tracking-tight sm:mb-6 sm:text-3xl">
      {children}
    </h1>
  );
}

/**
 * Description
 * Paragraph text used for sections
 */
export function Description({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-6 text-base text-description sm:mb-10 sm:text-lg">
      {children}
    </p>
  );
}