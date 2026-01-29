/**
 * Main database schema export module
 *
 * This file re-exports all database schemas from their respective modules:
 * - auth-schema: Better Auth authentication tables
 * - events-and-participation: Events, user profiles, event applications, and event attendees
 * - lookups: Reference/lookup tables for form options
 *
 * Import from this file to access all schema definitions in one place.
 */

export * from "./auth-schema";
export * from "./events-and-participation";
export * from "./lookups";
export * from "./authz";
