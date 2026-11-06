CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teams_tenant_idx` ON `teams` (`tenant_id`);--> statement-breakpoint
CREATE TABLE `campaign_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`sent_at` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_recipients_unique` ON `campaign_recipients` (`campaign_id`,`lead_id`);--> statement-breakpoint
CREATE INDEX `campaign_recipients_status_idx` ON `campaign_recipients` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`purpose` text NOT NULL,
	`audience` text NOT NULL,
	`template_name` text NOT NULL,
	`template_language` text DEFAULT 'pt_BR' NOT NULL,
	`parameters` text NOT NULL,
	`template_body` text,
	`header_image_url` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`sent` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`created_by_user_id` text,
	`created_by_name` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `campaigns_tenant_idx` ON `campaigns` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `lead_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`lead_id` text NOT NULL,
	`assigned_to_user_id` text,
	`kind` text DEFAULT 'call' NOT NULL,
	`due_at` integer NOT NULL,
	`note` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`done_at` integer,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lead_tasks_tenant_due_idx` ON `lead_tasks` (`tenant_id`,`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `lead_tasks_lead_idx` ON `lead_tasks` (`lead_id`,`status`);--> statement-breakpoint
CREATE TABLE `meta_lead_connections` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`page_name` text,
	`credentials` text NOT NULL,
	`last_error` text,
	`last_lead_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `meta_lead_page_unique` ON `meta_lead_connections` (`page_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `team_id` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `lost_reason` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `negotiation` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `marketing_opt_out_at` integer;