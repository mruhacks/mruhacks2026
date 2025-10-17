import { getDatabaseURL } from "@/utils/db";
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseURL(),
  },
  migrations: {
    table: "journal",
    schema: "drizzle",
  },
  casing: "snake_case",
});
