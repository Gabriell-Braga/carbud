ALTER TABLE `vehicles` ADD `inspection_provider` text;
--> statement-breakpoint
ALTER TABLE `vehicles` ADD `inspection_date` text;
--> statement-breakpoint
ALTER TABLE `vehicles` ADD `inspection_result` text;
--> statement-breakpoint
ALTER TABLE `vehicles` ADD `inspection_report_key` text;
--> statement-breakpoint
CREATE TABLE `vehicle_media_360` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`kind` text NOT NULL,
	`keys` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_media_360_vehicle_kind_unique` ON `vehicle_media_360` (`vehicle_id`,`kind`);
