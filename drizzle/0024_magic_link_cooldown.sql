CREATE UNLOGGED TABLE "magic_link_cooldown" (
	"email" text PRIMARY KEY NOT NULL,
	"last_sent_at" timestamp DEFAULT now() NOT NULL
);
