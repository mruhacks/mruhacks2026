import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/utils/db"; // your drizzle instance
import * as schema from "@/db/schema";
import { headers } from "next/headers";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg", // or "mysql", "sqlite"
    schema,
  }),
  emailAndPassword: { enabled: true },
  advanced: {
    database: {
      generateId: false,
    },
  },
});

export async function getSession() {
  const session = await auth.api.getSession({ headers: await headers() });

  return session;
}

export async function getUser() {
  return (await getSession())?.user || null;
}
