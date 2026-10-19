/**
 * Roughly how wide one character of the label renders, in ems. Digits are
 * about 0.6em in the display face and capitals a little wider; erring wide
 * keeps a long label like "XXIII-12" inside the sheet.
 */
const CHAR_WIDTH_EM = 0.65;
/** Share of the sheet's width the label may fill. */
const MAX_WIDTH_CQW = 86;
/** Cap for short labels, so a lone "1" doesn't run off the top and bottom. */
const MAX_FONT_CQW = 58;

/**
 * One table's sign: a single sheet with the table label as large as it fits.
 *
 * Sized in container-query units against the sheet itself, so the on-screen
 * preview and the printed page lay out identically at any width. Plain React
 * and Tailwind on purpose — this is the piece to redesign as signs get
 * fancier (event branding, a QR code, the project's name).
 */
export function TableSign({ label }: { label: string }) {
  const fontSize = `${Math.min(
    MAX_FONT_CQW,
    MAX_WIDTH_CQW / (label.length * CHAR_WIDTH_EM),
  )}cqw`;

  return (
    <section
      aria-label={`Table ${label}`}
      className='@container flex aspect-[11/8.5] w-full max-w-[11in] items-center justify-center overflow-hidden bg-white text-black shadow-md print:h-[8.5in] print:w-[11in] print:max-w-none print:break-after-page print:shadow-none print:last:break-after-auto'
    >
      <span
        className='leading-none font-bold tracking-tight tabular-nums'
        style={{ fontFamily: 'var(--font-display)', fontSize }}
      >
        {label}
      </span>
    </section>
  );
}
