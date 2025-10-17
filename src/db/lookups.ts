/**
 * Database lookup tables for the registration system
 * 
 * This module defines all the lookup/reference tables used in the
 * participant registration form. These tables contain predefined options
 * for dropdowns and multi-select inputs.
 * 
 * All lookup tables follow a consistent structure:
 * - id: Auto-incrementing primary key
 * - label: Unique, human-readable string value
 */

import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

/**
 * Gender options for participant registration
 * 
 * Example values: "Male", "Female", "Non-binary", "Prefer not to say"
 */
export const genders = pgTable("genders", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 100 }).unique().notNull(),
});

/**
 * University/institution options
 * 
 * Contains list of universities and educational institutions
 * that participants may attend.
 */
export const universities = pgTable("universities", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 200 }).unique().notNull(),
});

/**
 * Academic major/field of study options
 * 
 * Example values: "Computer Science", "Engineering", "Business", etc.
 */
export const majors = pgTable("majors", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

/**
 * Year of study options
 * 
 * Example values: "1st Year", "2nd Year", "3rd Year", "4th Year", "Graduate"
 */
export const yearsOfStudy = pgTable("years_of_study", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 10 }).unique().notNull(),
});

/**
 * Participant interest areas
 * 
 * Technical and non-technical interests that participants can select.
 * Example values: "Web Development", "Machine Learning", "Design", etc.
 */
export const interests = pgTable("interests", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

/**
 * Dietary restriction options
 * 
 * Used to accommodate participants' dietary needs for meals.
 * Example values: "Vegetarian", "Vegan", "Gluten-Free", "Halal", etc.
 */
export const dietaryRestrictions = pgTable("dietary_restrictions", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

/**
 * Sources where participants heard about the hackathon
 * 
 * Marketing attribution data to track how participants discovered the event.
 * Example values: "Social Media", "Friend", "Professor", "Website", etc.
 */
export const heardFromSources = pgTable("heard_from_sources", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});
