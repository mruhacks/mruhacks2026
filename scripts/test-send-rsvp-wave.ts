import 'dotenv/config';

import { client } from '@/utils/db';
import {
  sendRsvpWave,
  type SendRsvpWaveResult,
} from '@/lib/rsvp/send-rsvp-wave';

const USAGE = `
Usage:
  pnpm test:rsvp-wave -- <eventId>

Arguments:
  eventId    UUID of the event to send RSVP invitations for

The RSVP deadline is created_at plus the event's rsvp_response_window_hours
(default 48).

Example:
  pnpm test:rsvp-wave -- 123e4567-e89b-12d3-a456-426614174000
`.trim();

function printUsage(error?: string): void {
  if (error) {
    console.error(`Error: ${error}\n`);
  }
  console.error(USAGE);
}

function parseArgs(): { eventId: string } | null {
  const eventId = process.argv[2]?.trim();

  if (!eventId) {
    printUsage('An event ID is required.');
    return null;
  }

  return { eventId };
}

function printDivider(): void {
  console.log('─'.repeat(60));
}

function printResult(result: SendRsvpWaveResult, eventId: string): void {
  printDivider();
  console.log('sendRsvpWave result');
  printDivider();

  if (!result.success) {
    console.log('Status:              FAILED');
    console.log('Event ID:            ', eventId);
    console.log('Error:               ', result.error);
    printDivider();
    return;
  }

  console.log('Status:              SUCCESS');
  console.log('Event ID:            ', eventId);
  console.log('Wave ID:             ', result.wave.id);
  console.log('Wave number:         ', result.wave.wave);
  console.log('Respond by:          ', result.wave.respondBy.toISOString());
  console.log('Wave created at:     ', result.wave.createdAt.toISOString());
  console.log('Eligible applicants: ', result.eligibleApplicantCount);
  console.log('Responses created:   ', result.responsesCreated);
  console.log('Invitations queued:  ', result.invitationsQueued);

  if (result.queueFailures.length === 0) {
    console.log('Queue failures:      none');
  } else {
    console.log('Queue failures:      ', result.queueFailures.length);
    for (const failure of result.queueFailures) {
      console.log(`  - userId: ${failure.userId}`);
      console.log(`    email:  ${failure.email}`);
      console.log(`    error:  ${failure.error}`);
    }
  }

  printDivider();
}

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      'Refusing to run: this script creates RSVP records and sends real emails.',
    );
    console.error('It is disabled when NODE_ENV=production.');
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertNotProduction();

  const parsed = parseArgs();
  if (!parsed) {
    process.exit(1);
  }

  const { eventId } = parsed;

  console.warn('');
  console.warn('⚠️  WARNING: This script performs real actions:');
  console.warn('   • Creates a new event_rsvp_waves row');
  console.warn(
    '   • Creates event_rsvp_responses rows for approved applicants',
  );
  console.warn(
    '   • Publishes one RSVP invitation message per response to the queue',
  );
  console.warn('');
  console.warn(`   Event ID:   ${eventId}`);
  console.warn('   MailHog UI: http://localhost:8025');
  console.warn('');

  try {
    const result = await sendRsvpWave(eventId);
    printResult(result, eventId);

    if (!result.success) {
      process.exitCode = 1;
      return;
    }

    if (result.queueFailures.length > 0) {
      console.error(
        'Completed with queue failures. RSVP records were kept in the database.',
      );
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('');
    console.error('Unexpected error while running sendRsvpWave:');
    console.error(error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

void main();
