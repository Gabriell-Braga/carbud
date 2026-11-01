CREATE TABLE `store_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `store_expenses_tenant_idx` ON `store_expenses` (`tenant_id`,`date`);