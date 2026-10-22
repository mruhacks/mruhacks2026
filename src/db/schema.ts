/**
 * Main database schema export module
 *
 * This file re-exports all database schemas from their respective modules:
 * - auth-schema: Better Auth authentication tables
 * - events-and-participation: Events, user profiles, event participants, and RSVP invitations
 * - judging: Expo judging criteria, roster, votes and model state
 * - lookups: Reference/lookup tables for form options
 * - display: Lobby display settings
 * - campaigns: Email campaigns, saved audiences and per-recipient deliveries
 * - signing: Public keys that have signed email tokens, kept for verification after rotation
 *
 * Import from this file to access all schema definitions in one place.
 */

export * from '@/db/auth-schema';
export * from '@/db/events-and-participation';
export * from '@/db/judging';
export * from '@/db/lookups';
export * from '@/db/authz';
export * from '@/db/display';
export * from '@/db/campaigns';
export * from '@/db/signing';
