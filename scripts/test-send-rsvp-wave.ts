import 'dotenv/config';

import { client } from '@/utils/db';
import {
  sendRsvpWave,
  type SendRsvpWaveResult,
} from '@/lib/rsvp/send-rsvp-wave';

const USAGE = `
Usage:
  pnpm test:rsvp-wave -- <eventId> <respondBy>

Arguments:
  eventId    UUID of the event to send RSVP invitations for
  respondBy  RSVP deadline (ISO 8601, must be in the future)

Example:
  pnpm test:rsvp-wave -- 123e4567-e89b-12d3-a456-426614174000 2026-08-15T23:59:59Z
`.trim();

type ParsedArgs = {
  eventId: string;
  respondBy: Date;
};

function printUsage(error?: string): void {
  if (error) {
    console.error(`Error: ${error}\n`);
  }
  console.error(USAGE);
}

function parseArgs(): ParsedArgs | null {
  const eventId = process.argv[2]?.trim();
  const respondByRaw = process.argv[3]?.trim();

  if (!eventId) {
    printUsage('An event ID is required.');
    return null;
  }

  if (!respondByRaw) {
    printUsage('An RSVP deadline (respondBy) is required.');
    return null;
  }

  const respondBy = new Date(respondByRaw);
  if (Number.isNaN(respondBy.getTime())) {
    printUsage(`Invalid deadline: "${respondByRaw}". Use an ISO 8601 date/time.`);
    return null;
  }

  if (respondBy.getTime() <= Date.now()) {
    printUsage(
      `Deadline must be in the future. Received: ${respondBy.toISOString()}`,
    );
    return null;
  }

  return { eventId, respondBy };
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
  console.log('Emails sent:         ', result.emailsSent);

  if (result.emailFailures.length === 0) {
    console.log('Email failures:      none');
  } else {
    console.log('Email failures:      ', result.emailFailures.length);
    for (const failure of result.emailFailures) {
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

  const { eventId, respondBy } = parsed;

  console.warn('');
  console.warn('⚠️  WARNING: This script performs real actions:');
  console.warn('   • Creates a new event_rsvp_waves row');
  console.warn('   • Creates event_rsvp_responses rows for approved applicants');
  console.warn('   • Requests Better Auth magic links and sends RSVP emails via SMTP');
  console.warn('');
  console.warn(`   Event ID:   ${eventId}`);
  console.warn(`   Respond by: ${respondBy.toISOString()}`);
  console.warn('   MailHog UI: http://localhost:8025');
  console.warn('');

  try {
    const result = await sendRsvpWave(eventId, respondBy);
    printResult(result, eventId);

    if (!result.success) {
      process.exitCode = 1;
      return;
    }

    if (result.emailFailures.length > 0) {
      console.error(
        'Completed with email failures. RSVP records were kept in the database.',
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
