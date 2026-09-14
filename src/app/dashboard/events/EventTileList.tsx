import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { EventWithUserStatus } from '@/app/dashboard/events/actions';
import { LocalDateRange } from '@/components/local-date-time';

// ── Design tokens ──────────────────────────────────────────────────────────────

export function SectionEyebrow({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-ds-mono)',
        fontSize: '13px',
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase' as const,
        color,
      }}
    >
      {children}
    </span>
  );
}

function StatusPill({
  bg,
  fg,
  label,
}: {
  bg: string;
  fg: string;
  label: string;
}) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 15px',
        borderRadius: 'var(--radius-pill)',
        background: bg,
        color: fg,
        fontFamily: 'var(--font-ui)',
        fontWeight: 'var(--fw-semibold)',
        fontSize: '14px',
        letterSpacing: 'var(--track-ui)',
        lineHeight: 1,
        whiteSpace: 'nowrap' as const,
      }}
    >
      <span
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '999px',
          background: 'currentColor',
          display: 'block',
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  approved: { bg: 'var(--green)', fg: 'var(--white)' },
  denied: { bg: 'var(--pink)', fg: 'var(--white)' },
  waitlisted: { bg: 'var(--orange)', fg: 'var(--white)' },
  pending_review: { bg: 'var(--yellow)', fg: 'var(--black)' },
};

function EventStatusPill({ e }: { e: EventWithUserStatus }) {
  if (e.statusKey && STATUS_COLORS[e.statusKey]) {
    const { bg, fg } = STATUS_COLORS[e.statusKey]!;
    return (
      <StatusPill
        bg={bg}
        fg={fg}
        label={e.statusDisplay?.title ?? e.statusKey}
      />
    );
  }
  if (e.userStatus === 'registered') {
    return <StatusPill bg='var(--blue)' fg='var(--white)' label='Registered' />;
  }
  if (e.hasApplication) {
    return (
      <StatusPill bg='var(--green)' fg='var(--white)' label='Open to apply' />
    );
  }
  return (
    <StatusPill bg='var(--green)' fg='var(--white)' label='Registration open' />
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

const emptyTile: React.CSSProperties = {
  background: 'var(--white)',
  border: 'var(--border-hairline)',
  borderRadius: 'var(--radius-md)',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  boxShadow: 'var(--shadow-card)',
};

export function EventTileList({ events }: { events: EventWithUserStatus[] }) {
  if (events.length === 0) {
    return (
      <div style={emptyTile}>
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontWeight: 'var(--fw-semibold)',
            fontSize: '16px',
            margin: 0,
          }}
        >
          No events yet
        </p>
        <p style={{ fontSize: '14px', color: 'var(--ink-500)', margin: 0 }}>
          Check back later — events will appear here once they&apos;re live.
        </p>
      </div>
    );
  }

  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/dashboard/events/${event.id}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '16px',
              background: 'var(--white)',
              border: 'var(--border-hairline)',
              borderRadius: 'var(--radius-md)',
              padding: '18px 20px',
              boxShadow: 'var(--shadow-card)',
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontFamily: 'var(--font-ui)',
                  fontWeight: 'var(--fw-semibold)',
                  fontSize: '17px',
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {event.name}
              </p>
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--ink-500)',
                  margin: '3px 0 0',
                }}
              >
                {event.hasApplication ? 'Application · ' : ''}
                <LocalDateRange start={event.startsAt} end={event.endsAt} />
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                flexShrink: 0,
              }}
            >
              <EventStatusPill e={event} />
              <ArrowRight
                className='text-muted-foreground size-4'
                style={{ flexShrink: 0 }}
              />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
