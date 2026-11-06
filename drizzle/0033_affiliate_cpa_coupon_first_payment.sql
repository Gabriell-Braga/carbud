ALTER TABLE `coupons` ADD `first_payment_cents` integer;--> statement-breakpoint
ALTER TABLE `affiliate_commissions` ADD `fixed_cents` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `affiliate_commissions_cpa_unique` ON `affiliate_commissions` (`affiliation_id`) WHERE fixed_cents IS NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `commission_type` text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `cpa_cents` integer;--> statement-breakpoint
ALTER TABLE `affiliates` ADD `coupon_id` text REFERENCES coupons(id);--> statement-breakpoint
ALTER TABLE `tenant_affiliations` ADD `commission_type_snapshot` text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE `tenant_affiliations` ADD `cpa_cents_snapshot` integer;