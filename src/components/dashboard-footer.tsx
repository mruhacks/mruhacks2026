import Link from 'next/link';
import { FOOTER_ICONS } from '@/components/footer';
import { FOOTER_LINKS } from '@/content';

export function DashboardFooter() {
  return (
    <footer
      style={{
        borderTop: 'var(--border-hairline)',
        background: 'var(--white)',
        padding: '20px 28px',
      }}
    >
      <div
        className='mx-auto flex w-full flex-wrap items-center gap-4'
        style={{ maxWidth: 'var(--content-max)' }}
      >
        <span
          style={{
            fontFamily: 'var(--font-ds-mono)',
            fontSize: '13px',
            fontWeight: 500,
            letterSpacing: '0.06em',
            textTransform: 'uppercase' as const,
            color: 'var(--pink)',
          }}
        >
          Join Us On
        </span>
        <div className='flex flex-wrap gap-3'>
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              target='_blank'
              rel='noreferrer noopener'
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 14px',
                borderRadius: 'var(--radius-pill)',
                background: 'var(--ink-050)',
                fontFamily: 'var(--font-ui)',
                fontWeight: 'var(--fw-semibold)',
                fontSize: '13px',
                color: 'var(--black)',
                textDecoration: 'none',
              }}
            >
              {FOOTER_ICONS[link.label]}
              {link.label}
            </Link>
          ))}
        </div>
        <span
          className='ml-auto'
          style={{
            fontFamily: 'var(--font-ds-mono)',
            fontSize: '12px',
            color: 'var(--ink-500)',
          }}
        >
          {process.env.BUILD_INFO ?? 'unknown'}
        </span>
      </div>
    </footer>
  );
}
