import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { EventWithUserStatus } from '@/app/dashboard/events/actions';
import {
  getApplicationDisplayStatus,
  type EventDisplayPill,
} from '@/app/dashboard/events/event-display-status';
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

const STATUS_COLORS: Record<EventDisplayPill, { bg: string; fg: string }> = {
  approved: { bg: 'var(--green)', fg: 'var(--white)' },
  denied: { bg: 'var(--pink)', fg: 'var(--white)' },
  waitlisted: { bg: 'var(--orange)', fg: 'var(--white)' },
  pending_review: { bg: 'var(--yellow)', fg: 'var(--black)' },
  rsvp_pending: { bg: 'var(--purple)', fg: 'var(--white)' },
  rsvp_accepted: { bg: 'var(--green)', fg: 'var(--white)' },
  rsvp_declined: { bg: 'var(--ink-500)', fg: 'var(--white)' },
  rsvp_expired: { bg: 'var(--ink-500)', fg: 'var(--white)' },
  registered: { bg: 'var(--blue)', fg: 'var(--white)' },
  open_to_apply: { bg: 'var(--green)', fg: 'var(--white)' },
  registration_open: { bg: 'var(--green)', fg: 'var(--white)' },
};

function EventStatusPill({ e }: { e: EventWithUserStatus }) {
  const display = getApplicationDisplayStatus(e);
  const { bg, fg } = STATUS_COLORS[display.pill];
  return <StatusPill bg={bg} fg={fg} label={display.label} />;
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
