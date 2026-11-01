ALTER TABLE `vehicles` ADD `is_auction` integer DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE `vehicle_finance` (
	`vehicle_id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`purchase_price_cents` integer,
	`purchase_date` text,
	`purchase_source` text,
	`sale_price_cents` integer,
	`sale_date` text,
	`buyer_name` text,
	`buyer_document` text,
	`buyer_phone` text,
	`bank_return_cents` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vehicle_finance_tenant_sale_idx` ON `vehicle_finance` (`tenant_id`,`sale_date`);
--> statement-breakpoint
CREATE TABLE `vehicle_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`category` text NOT NULL,
	`description` text,
	`amount_cents` integer NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `vehicle_expenses_vehicle_idx` ON `vehicle_expenses` (`vehicle_id`,`date`);
--> statement-breakpoint
CREATE INDEX `vehicle_expenses_tenant_idx` ON `vehicle_expenses` (`tenant_id`,`date`);
