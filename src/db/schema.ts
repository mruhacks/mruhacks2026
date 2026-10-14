/**
 * Main database schema export module
 *
 * This file re-exports all database schemas from their respective modules:
 * - auth-schema: Better Auth authentication tables
 * - events-and-participation: Events, user profiles, event participants, and RSVP invitations
 * - lookups: Reference/lookup tables for form options
 * - campaigns: Email campaigns, saved audiences and per-recipient deliveries
 *
 * Import from this file to access all schema definitions in one place.
 */

export * from './auth-schema';
export * from './events-and-participation';
export * from './lookups';
export * from './authz';
export * from './campaigns';
