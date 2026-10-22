CREATE TABLE "signing_public_keys" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"first_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "signing_public_keys_public_key_unique" UNIQUE("public_key")
);
