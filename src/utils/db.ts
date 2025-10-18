import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";

const isProduction = false && process.env.NODE_ENV === "production";

export const db = drizzle({
  connection: {
    connectionString: process.env.DATABASE_URL!,
    ssl: isProduction
      ? { rejectUnauthorized: false } // allow Heroku, Supabase, etc.
      : false,
  },
});

export default db;
