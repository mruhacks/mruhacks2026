import { pgTable, serial, varchar } from "drizzle-orm/pg-core";

export const genders = pgTable("genders", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 100 }).unique().notNull(),
});

export const universities = pgTable("universities", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 200 }).unique().notNull(),
});

export const majors = pgTable("majors", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

export const yearsOfStudy = pgTable("years_of_study", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 10 }).unique().notNull(),
});

export const interests = pgTable("interests", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

export const dietaryRestrictions = pgTable("dietary_restrictions", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});

export const heardFromSources = pgTable("heard_from_sources", {
  id: serial("id").primaryKey(),
  label: varchar("label", { length: 150 }).unique().notNull(),
});
