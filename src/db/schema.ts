/**
 * Main database schema export module
 *
 * This file re-exports all database schemas from their respective modules:
 * - auth-schema: Better Auth authentication tables
 * - registrations: Participant registration tables and views
 * - lookups: Reference/lookup tables for form options
 *
 * Import from this file to access all schema definitions in one place.
 */

export * from "./auth-schema";
export * from "./registrations";
export * from "./lookups";
export * from "./authz";
