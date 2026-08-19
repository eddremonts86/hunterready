ALTER TABLE "auth_users" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "auth_users" ADD CONSTRAINT "auth_users_stripe_customer_id_unique" UNIQUE("stripe_customer_id");