CREATE TABLE `buyers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`phone` text,
	`marketing_opt_in` integer DEFAULT false NOT NULL,
	`marketing_opt_in_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buyers_email_unique` ON `buyers` (`email`);
--> statement-breakpoint
CREATE TABLE `buyer_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `buyer_codes_email_idx` ON `buyer_codes` (`email`,`created_at`);
--> statement-breakpoint
CREATE TABLE `buyer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`buyer_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`buyer_id`) REFERENCES `buyers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `buyer_sessions_token_unique` ON `buyer_sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `buyer_sessions_buyer_idx` ON `buyer_sessions` (`buyer_id`);
--> statement-breakpoint
CREATE TABLE `buyer_favorites` (
	`buyer_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`buyer_id`, `vehicle_id`),
	FOREIGN KEY (`buyer_id`) REFERENCES `buyers`(`id`) ON UPDATE no action ON DELETE cascade
);
