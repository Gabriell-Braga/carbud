ALTER TABLE `platform_settings` ADD `gateway_environment` text DEFAULT 'production' NOT NULL;
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `gateway_environment` text;
--> statement-breakpoint
ALTER TABLE `affiliate_event_processing` ADD `environment` text;
