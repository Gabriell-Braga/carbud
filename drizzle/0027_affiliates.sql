CREATE TABLE `affiliates` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`phone` text,
	`notes` text,
	`status` text DEFAULT 'active' NOT NULL,
	`default_commission_bps` integer NOT NULL,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliates_code_unique` ON `affiliates` (`code`);
--> statement-breakpoint
CREATE INDEX `affiliates_status_idx` ON `affiliates` (`status`);
--> statement-breakpoint
CREATE TABLE `tenant_affiliations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`affiliate_id` text NOT NULL,
	`code_snapshot` text NOT NULL,
	`commission_bps_snapshot` integer NOT NULL,
	`attributed_at` integer NOT NULL,
	`source` text NOT NULL,
	`created_by_user_id` text,
	`created_by_email` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_affiliations_tenant_unique` ON `tenant_affiliations` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `tenant_affiliations_affiliate_idx` ON `tenant_affiliations` (`affiliate_id`,`attributed_at`);
--> statement-breakpoint
CREATE TABLE `affiliate_payment_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`environment` text NOT NULL,
	`source_payment_id` text NOT NULL,
	`tenant_id` text,
	`gateway_customer_id` text,
	`gateway_subscription_id` text,
	`currency` text DEFAULT 'BRL' NOT NULL,
	`gateway_status` text NOT NULL,
	`gross_cents` integer DEFAULT 0 NOT NULL,
	`base_cents` integer,
	`base_override_cents` integer,
	`refunded_cents` integer DEFAULT 0 NOT NULL,
	`effective_at` integer,
	`review_reason` text,
	`last_checked_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_payment_facts_source_unique` ON `affiliate_payment_facts` (`source`,`environment`,`source_payment_id`);
--> statement-breakpoint
CREATE INDEX `affiliate_payment_facts_tenant_idx` ON `affiliate_payment_facts` (`tenant_id`,`effective_at`);
--> statement-breakpoint
CREATE TABLE `affiliate_commissions` (
	`id` text PRIMARY KEY NOT NULL,
	`payment_fact_id` text NOT NULL,
	`affiliation_id` text NOT NULL,
	`affiliate_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`base_cents` integer NOT NULL,
	`commission_bps` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`competence_at` integer NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`payment_fact_id`) REFERENCES `affiliate_payment_facts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliation_id`) REFERENCES `tenant_affiliations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_commissions_fact_unique` ON `affiliate_commissions` (`payment_fact_id`);
--> statement-breakpoint
CREATE INDEX `affiliate_commissions_affiliate_idx` ON `affiliate_commissions` (`affiliate_id`,`competence_at`);
--> statement-breakpoint
CREATE INDEX `affiliate_commissions_tenant_idx` ON `affiliate_commissions` (`tenant_id`);
--> statement-breakpoint
CREATE TABLE `affiliate_commission_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`commission_id` text NOT NULL,
	`affiliate_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text NOT NULL,
	`source_ref` text,
	`actor_user_id` text,
	`actor_email` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`commission_id`) REFERENCES `affiliate_commissions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_adjustments_key_unique` ON `affiliate_commission_adjustments` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `affiliate_adjustments_commission_idx` ON `affiliate_commission_adjustments` (`commission_id`);
--> statement-breakpoint
CREATE INDEX `affiliate_adjustments_affiliate_idx` ON `affiliate_commission_adjustments` (`affiliate_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `affiliate_payouts` (
	`id` text PRIMARY KEY NOT NULL,
	`affiliate_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`paid_at` integer NOT NULL,
	`reference` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'recorded' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_by_user_id` text,
	`created_by_email` text,
	`voided_at` integer,
	`voided_by_email` text,
	`void_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`affiliate_id`) REFERENCES `affiliates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_payouts_key_unique` ON `affiliate_payouts` (`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `affiliate_payouts_affiliate_idx` ON `affiliate_payouts` (`affiliate_id`,`paid_at`);
--> statement-breakpoint
CREATE TABLE `affiliate_event_processing` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`source_payment_id` text,
	`event_type` text,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`payment_fact_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `affiliate_event_processing_state_idx` ON `affiliate_event_processing` (`state`,`updated_at`);
