// ARQUIVO GERADO AUTOMATICAMENTE — não editar.
// Origem: drizzle/*.sql (rodar `npm run db:bundle`).

export type BundledMigration = { tag: string; statements: string[] };

export const MIGRATIONS: BundledMigration[] = [
  {
    "tag": "0000_init",
    "statements": [
      "CREATE TABLE `tenant_banners` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`image_key` text NOT NULL,\n\t`image_key_mobile` text,\n\t`title` text,\n\t`subtitle` text,\n\t`cta_label` text,\n\t`cta_href` text,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `tenant_banners_tenant_idx` ON `tenant_banners` (`tenant_id`,`position`);",
      "CREATE TABLE `tenant_sites` (\n\t`tenant_id` text PRIMARY KEY NOT NULL,\n\t`logo_key` text,\n\t`favicon_key` text,\n\t`theme` text,\n\t`gtm_code` text,\n\t`phone` text,\n\t`whatsapp` text,\n\t`email` text,\n\t`address_street` text,\n\t`address_number` text,\n\t`address_complement` text,\n\t`address_district` text,\n\t`address_city` text,\n\t`address_state` text,\n\t`address_zip` text,\n\t`maps_url` text,\n\t`business_hours` text,\n\t`social` text,\n\t`about_title` text,\n\t`about_text` text,\n\t`seo` text,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE TABLE `tenants` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`slug` text NOT NULL,\n\t`name` text NOT NULL,\n\t`legal_name` text,\n\t`cnpj` text,\n\t`status` text DEFAULT 'active' NOT NULL,\n\t`template_id` text DEFAULT 'template-1-clean' NOT NULL,\n\t`block_mode` text DEFAULT 'readonly' NOT NULL,\n\t`notes` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\t`deleted_at` integer\n);",
      "CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);",
      "CREATE INDEX `tenants_status_idx` ON `tenants` (`status`);",
      "CREATE TABLE `users` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text,\n\t`email` text NOT NULL,\n\t`name` text NOT NULL,\n\t`password_hash` text NOT NULL,\n\t`password_salt` text NOT NULL,\n\t`role` text NOT NULL,\n\t`status` text DEFAULT 'active' NOT NULL,\n\t`must_change_password` integer DEFAULT false NOT NULL,\n\t`sessions_valid_from` integer NOT NULL,\n\t`last_login_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);",
      "CREATE INDEX `users_tenant_idx` ON `users` (`tenant_id`,`status`);",
      "CREATE TABLE `billing_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`type` text NOT NULL,\n\t`amount_cents` integer,\n\t`reference_month` text,\n\t`status_from` text,\n\t`status_to` text,\n\t`note` text,\n\t`created_by_user_id` text,\n\t`created_by_email` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `billing_events_tenant_idx` ON `billing_events` (`tenant_id`,`created_at`);",
      "CREATE TABLE `billing_status` (\n\t`tenant_id` text PRIMARY KEY NOT NULL,\n\t`status` text DEFAULT 'adimplente' NOT NULL,\n\t`due_day` integer DEFAULT 10 NOT NULL,\n\t`amount_cents` integer DEFAULT 0 NOT NULL,\n\t`current_due_date` integer,\n\t`last_payment_at` integer,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `billing_status_status_idx` ON `billing_status` (`status`);",
      "CREATE TABLE `vehicle_brands` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`created_by_tenant_id` text\n);",
      "CREATE UNIQUE INDEX `vehicle_brands_slug_unique` ON `vehicle_brands` (`slug`);",
      "CREATE TABLE `vehicle_models` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`brand_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`created_by_tenant_id` text,\n\tFOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `vehicle_models_brand_slug_unique` ON `vehicle_models` (`brand_id`,`slug`);",
      "CREATE TABLE `vehicle_photos` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`variants` text NOT NULL,\n\t`width` integer,\n\t`height` integer,\n\t`size_bytes` integer,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`is_cover` integer DEFAULT false NOT NULL,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `vehicle_photos_vehicle_idx` ON `vehicle_photos` (`vehicle_id`,`position`);",
      "CREATE INDEX `vehicle_photos_tenant_idx` ON `vehicle_photos` (`tenant_id`);",
      "CREATE TABLE `vehicles` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`brand` text NOT NULL,\n\t`model` text NOT NULL,\n\t`version` text,\n\t`year_manufacture` integer NOT NULL,\n\t`year_model` integer NOT NULL,\n\t`mileage_km` integer DEFAULT 0 NOT NULL,\n\t`price_cents` integer DEFAULT 0 NOT NULL,\n\t`price_on_request` integer DEFAULT false NOT NULL,\n\t`transmission` text,\n\t`fuel` text,\n\t`body_type` text,\n\t`color` text,\n\t`doors` integer,\n\t`license_plate_end` text,\n\t`options` text,\n\t`description` text,\n\t`status` text DEFAULT 'draft' NOT NULL,\n\t`featured` integer DEFAULT false NOT NULL,\n\t`sort_order` integer DEFAULT 0 NOT NULL,\n\t`views` integer DEFAULT 0 NOT NULL,\n\t`cover_photo_key` text,\n\t`photos_count` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `vehicles_tenant_slug_unique` ON `vehicles` (`tenant_id`,`slug`);",
      "CREATE INDEX `vehicles_tenant_status_idx` ON `vehicles` (`tenant_id`,`status`);",
      "CREATE INDEX `vehicles_tenant_featured_idx` ON `vehicles` (`tenant_id`,`featured`,`status`);",
      "CREATE INDEX `vehicles_tenant_brand_idx` ON `vehicles` (`tenant_id`,`brand`,`model`);",
      "CREATE INDEX `vehicles_tenant_price_idx` ON `vehicles` (`tenant_id`,`price_cents`);",
      "CREATE INDEX `vehicles_tenant_created_idx` ON `vehicles` (`tenant_id`,`created_at`);",
      "CREATE TABLE `leads` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`vehicle_id` text,\n\t`vehicle_label` text,\n\t`name` text NOT NULL,\n\t`phone` text NOT NULL,\n\t`email` text,\n\t`message` text,\n\t`source` text DEFAULT 'form' NOT NULL,\n\t`status` text DEFAULT 'new' NOT NULL,\n\t`assigned_to_user_id` text,\n\t`internal_notes` text,\n\t`utm` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`assigned_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE INDEX `leads_tenant_status_idx` ON `leads` (`tenant_id`,`status`,`created_at`);",
      "CREATE INDEX `leads_tenant_created_idx` ON `leads` (`tenant_id`,`created_at`);",
      "CREATE INDEX `leads_vehicle_idx` ON `leads` (`vehicle_id`);",
      "CREATE TABLE `audit_log` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`actor_user_id` text,\n\t`actor_email` text,\n\t`actor_role` text,\n\t`impersonated` integer DEFAULT false NOT NULL,\n\t`tenant_id` text,\n\t`action` text NOT NULL,\n\t`entity` text,\n\t`entity_id` text,\n\t`metadata` text,\n\t`ip` text,\n\t`user_agent` text,\n\t`created_at` integer NOT NULL\n);",
      "CREATE INDEX `audit_log_tenant_idx` ON `audit_log` (`tenant_id`,`created_at`);",
      "CREATE INDEX `audit_log_actor_idx` ON `audit_log` (`actor_user_id`,`created_at`);",
      "CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);"
    ]
  },
  {
    "tag": "0001_tenant_gtm",
    "statements": [
      "ALTER TABLE `tenants` ADD `gtm_code` text;"
    ]
  },
  {
    "tag": "0002_grace_and_password_resets",
    "statements": [
      "CREATE TABLE `password_resets` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`user_id` text NOT NULL,\n\t`token_hash` text NOT NULL,\n\t`expires_at` integer NOT NULL,\n\t`used_at` integer,\n\t`delivered` integer DEFAULT false NOT NULL,\n\t`requested_ip` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `password_resets_token_unique` ON `password_resets` (`token_hash`);",
      "CREATE INDEX `password_resets_user_idx` ON `password_resets` (`user_id`,`created_at`);",
      "CREATE INDEX `password_resets_expires_idx` ON `password_resets` (`expires_at`);",
      "ALTER TABLE `billing_status` ADD `grace_days` integer DEFAULT 5 NOT NULL;"
    ]
  },
  {
    "tag": "0003_plans_and_subscriptions",
    "statements": [
      "CREATE TABLE `coupons` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`code` text NOT NULL,\n\t`description` text,\n\t`discount_type` text DEFAULT 'PERCENTAGE' NOT NULL,\n\t`discount_value` integer NOT NULL,\n\t`duration_cycles` integer,\n\t`max_redemptions` integer,\n\t`redemptions` integer DEFAULT 0 NOT NULL,\n\t`plan_ids` text,\n\t`expires_at` integer,\n\t`active` integer DEFAULT true NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE UNIQUE INDEX `coupons_code_unique` ON `coupons` (`code`);",
      "CREATE TABLE `plans` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`name` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`description` text,\n\t`price_cents` integer DEFAULT 0 NOT NULL,\n\t`cycle` text DEFAULT 'MONTHLY' NOT NULL,\n\t`billing_mode` text DEFAULT 'gateway' NOT NULL,\n\t`trial_days` integer DEFAULT 0 NOT NULL,\n\t`limits` text,\n\t`features` text,\n\t`public_visible` integer DEFAULT true NOT NULL,\n\t`highlighted` integer DEFAULT false NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`sort_order` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE UNIQUE INDEX `plans_slug_unique` ON `plans` (`slug`);",
      "CREATE INDEX `plans_active_idx` ON `plans` (`active`,`sort_order`);",
      "CREATE TABLE `platform_settings` (\n\t`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,\n\t`fine_percent` integer DEFAULT 2 NOT NULL,\n\t`interest_percent` integer DEFAULT 1 NOT NULL,\n\t`default_trial_days` integer DEFAULT 0 NOT NULL,\n\t`gateway_notifications` integer DEFAULT true NOT NULL,\n\t`default_grace_days` integer DEFAULT 5 NOT NULL,\n\t`updated_at` integer NOT NULL\n);",
      "CREATE TABLE `subscriptions` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`plan_id` text,\n\t`status` text DEFAULT 'manual' NOT NULL,\n\t`billing_type` text DEFAULT 'UNDEFINED' NOT NULL,\n\t`gateway_customer_id` text,\n\t`gateway_subscription_id` text,\n\t`price_cents` integer DEFAULT 0 NOT NULL,\n\t`coupon_code` text,\n\t`discount_cents` integer DEFAULT 0 NOT NULL,\n\t`trial_ends_at` integer,\n\t`current_period_end` integer,\n\t`canceled_at` integer,\n\t`last_event_type` text,\n\t`last_event_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE UNIQUE INDEX `subscriptions_tenant_unique` ON `subscriptions` (`tenant_id`);",
      "CREATE INDEX `subscriptions_gateway_idx` ON `subscriptions` (`gateway_subscription_id`);",
      "CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`gateway_customer_id`);",
      "CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);",
      "CREATE TABLE `webhook_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`provider` text DEFAULT 'asaas' NOT NULL,\n\t`event_type` text NOT NULL,\n\t`tenant_id` text,\n\t`payload` text,\n\t`processed_at` integer,\n\t`error` text,\n\t`created_at` integer NOT NULL\n);",
      "CREATE INDEX `webhook_events_received_idx` ON `webhook_events` (`created_at`);",
      "CREATE INDEX `webhook_events_tenant_idx` ON `webhook_events` (`tenant_id`,`created_at`);",
      "ALTER TABLE `tenants` ADD `plan_id` text;"
    ]
  },
  {
    "tag": "0004_provisional_drafts",
    "statements": [
      "ALTER TABLE `vehicles` ADD `draft_expires_at` integer;",
      "CREATE INDEX `vehicles_draft_expiry_idx` ON `vehicles` (`draft_expires_at`);"
    ]
  },
  {
    "tag": "0005_crm_stores_and_api",
    "statements": [
      "CREATE TABLE `stores` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`slug` text NOT NULL,\n\t`whatsapp` text,\n\t`phone` text,\n\t`email` text,\n\t`address_zip` text,\n\t`address_street` text,\n\t`address_number` text,\n\t`address_complement` text,\n\t`address_district` text,\n\t`address_city` text,\n\t`address_state` text,\n\t`is_default` integer DEFAULT false NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`sort_order` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `stores_tenant_slug_unique` ON `stores` (`tenant_id`,`slug`);",
      "CREATE INDEX `stores_tenant_active_idx` ON `stores` (`tenant_id`,`active`,`sort_order`);",
      "CREATE TABLE `pipeline_stages` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`kind` text DEFAULT 'open' NOT NULL,\n\t`position` integer DEFAULT 0 NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `pipeline_stages_tenant_idx` ON `pipeline_stages` (`tenant_id`,`position`);",
      "CREATE TABLE `lead_events` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`lead_id` text NOT NULL,\n\t`type` text DEFAULT 'note' NOT NULL,\n\t`body` text,\n\t`user_id` text,\n\t`user_name` text,\n\t`metadata` text,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE INDEX `lead_events_lead_idx` ON `lead_events` (`lead_id`,`created_at`);",
      "CREATE TABLE `lead_routing` (\n\t`tenant_id` text PRIMARY KEY NOT NULL,\n\t`mode` text DEFAULT 'off' NOT NULL,\n\t`last_assigned_user_id` text,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`last_assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE TABLE `financings` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`lead_id` text,\n\t`vehicle_id` text,\n\t`vehicle_label` text,\n\t`customer_name` text NOT NULL,\n\t`customer_document` text,\n\t`customer_phone` text,\n\t`bank` text,\n\t`vehicle_price_cents` integer DEFAULT 0 NOT NULL,\n\t`down_payment_cents` integer DEFAULT 0 NOT NULL,\n\t`financed_cents` integer DEFAULT 0 NOT NULL,\n\t`installments` integer DEFAULT 0 NOT NULL,\n\t`installment_cents` integer DEFAULT 0 NOT NULL,\n\t`status` text DEFAULT 'rascunho' NOT NULL,\n\t`notes` text,\n\t`store_id` text,\n\t`created_by_user_id` text,\n\t`decided_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE INDEX `financings_tenant_status_idx` ON `financings` (`tenant_id`,`status`,`created_at`);",
      "CREATE INDEX `financings_lead_idx` ON `financings` (`lead_id`);",
      "CREATE TABLE `api_keys` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`prefix` text NOT NULL,\n\t`key_hash` text NOT NULL,\n\t`created_by_user_id` text,\n\t`last_used_at` integer,\n\t`revoked_at` integer,\n\t`created_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE UNIQUE INDEX `api_keys_hash_unique` ON `api_keys` (`key_hash`);",
      "CREATE INDEX `api_keys_tenant_idx` ON `api_keys` (`tenant_id`,`revoked_at`);",
      "CREATE TABLE `tenant_webhooks` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`url` text NOT NULL,\n\t`secret` text NOT NULL,\n\t`events` text,\n\t`active` integer DEFAULT true NOT NULL,\n\t`last_status` integer,\n\t`last_error` text,\n\t`last_attempt_at` integer,\n\t`failure_count` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `tenant_webhooks_tenant_idx` ON `tenant_webhooks` (`tenant_id`,`active`);",
      "ALTER TABLE `vehicles` ADD `store_id` text;",
      "ALTER TABLE `leads` ADD `stage_id` text;",
      "ALTER TABLE `leads` ADD `store_id` text;",
      "ALTER TABLE `users` ADD `store_id` text;",
      "ALTER TABLE `users` ADD `receives_leads` integer DEFAULT true NOT NULL;",
      "ALTER TABLE `users` ADD `permission_overrides` text;",
      "CREATE INDEX `vehicles_store_idx` ON `vehicles` (`tenant_id`,`store_id`);",
      "CREATE INDEX `leads_stage_idx` ON `leads` (`tenant_id`,`stage_id`);"
    ]
  },
  {
    "tag": "0006_fipe_reference",
    "statements": [
      "ALTER TABLE `vehicles` ADD `fipe_code` text;",
      "ALTER TABLE `vehicles` ADD `fipe_price_cents` integer;",
      "ALTER TABLE `vehicles` ADD `fipe_reference` text;"
    ]
  },
  {
    "tag": "0007_message_templates",
    "statements": [
      "CREATE TABLE `message_templates` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`name` text NOT NULL,\n\t`channel` text DEFAULT 'whatsapp' NOT NULL,\n\t`body` text NOT NULL,\n\t`active` integer DEFAULT true NOT NULL,\n\t`sort_order` integer DEFAULT 0 NOT NULL,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE INDEX `message_templates_tenant_idx` ON `message_templates` (`tenant_id`,`channel`,`sort_order`);"
    ]
  },
  {
    "tag": "0008_portal_connections",
    "statements": [
      "CREATE TABLE `portal_connections` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`portal` text NOT NULL,\n\t`status` text DEFAULT 'desconectado' NOT NULL,\n\t`credentials` text,\n\t`settings` text,\n\t`connected_by_user_id` text,\n\t`last_sync_at` integer,\n\t`last_error` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`connected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE UNIQUE INDEX `portal_connections_tenant_portal_unique` ON `portal_connections` (`tenant_id`,`portal`);",
      "CREATE TABLE `vehicle_publications` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`vehicle_id` text NOT NULL,\n\t`portal` text NOT NULL,\n\t`external_id` text,\n\t`external_url` text,\n\t`status` text DEFAULT 'pendente' NOT NULL,\n\t`last_error` text,\n\t`synced_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON UPDATE no action ON DELETE cascade\n);",
      "CREATE UNIQUE INDEX `vehicle_publications_unique` ON `vehicle_publications` (`vehicle_id`,`portal`);",
      "CREATE INDEX `vehicle_publications_pending_idx` ON `vehicle_publications` (`tenant_id`,`status`);"
    ]
  },
  {
    "tag": "0009_whatsapp",
    "statements": [
      "CREATE TABLE `whatsapp_connections` (\n\t`tenant_id` text PRIMARY KEY NOT NULL,\n\t`phone_number_id` text NOT NULL,\n\t`waba_id` text,\n\t`display_phone` text,\n\t`credentials` text NOT NULL,\n\t`status` text DEFAULT 'conectado' NOT NULL,\n\t`last_error` text,\n\t`last_inbound_at` integer,\n\t`connected_by_user_id` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`connected_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE UNIQUE INDEX `whatsapp_phone_number_unique` ON `whatsapp_connections` (`phone_number_id`);",
      "ALTER TABLE `lead_events` ADD `direction` text;",
      "ALTER TABLE `lead_events` ADD `external_id` text;",
      "CREATE INDEX `lead_events_direction_idx` ON `lead_events` (`lead_id`,`direction`,`created_at`);"
    ]
  },
  {
    "tag": "0010_vehicle_appraisals",
    "statements": [
      "CREATE TABLE `vehicle_appraisals` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`lead_id` text,\n\t`customer_name` text NOT NULL,\n\t`customer_phone` text,\n\t`store_id` text,\n\t`brand` text NOT NULL,\n\t`model` text NOT NULL,\n\t`version` text,\n\t`year_manufacture` integer DEFAULT 0 NOT NULL,\n\t`year_model` integer DEFAULT 0 NOT NULL,\n\t`mileage_km` integer DEFAULT 0 NOT NULL,\n\t`color` text,\n\t`license_plate_end` text,\n\t`fipe_code` text,\n\t`fipe_price_cents` integer DEFAULT 0 NOT NULL,\n\t`fipe_reference` text,\n\t`condition_cents` integer DEFAULT 0 NOT NULL,\n\t`repairs_cents` integer DEFAULT 0 NOT NULL,\n\t`debts_cents` integer DEFAULT 0 NOT NULL,\n\t`market_adjust_cents` integer DEFAULT 0 NOT NULL,\n\t`suggested_cents` integer DEFAULT 0 NOT NULL,\n\t`offer_cents` integer DEFAULT 0 NOT NULL,\n\t`target_sale_cents` integer DEFAULT 0 NOT NULL,\n\t`status` text DEFAULT 'rascunho' NOT NULL,\n\t`valid_until` integer,\n\t`notes` text,\n\t`vehicle_id` text,\n\t`created_by_user_id` text,\n\t`decided_at` integer,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE set null,\n\tFOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE INDEX `vehicle_appraisals_tenant_status_idx` ON `vehicle_appraisals` (`tenant_id`,`status`,`created_at`);",
      "CREATE INDEX `vehicle_appraisals_lead_idx` ON `vehicle_appraisals` (`lead_id`);"
    ]
  },
  {
    "tag": "0011_tenant_domains",
    "statements": [
      "CREATE TABLE `tenant_domains` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`tenant_id` text NOT NULL,\n\t`domain` text NOT NULL,\n\t`status` text DEFAULT 'pendente' NOT NULL,\n\t`is_primary` integer DEFAULT false NOT NULL,\n\t`pending_records` text,\n\t`last_error` text,\n\t`last_checked_at` integer,\n\t`created_by_user_id` text,\n\t`created_at` integer NOT NULL,\n\t`updated_at` integer NOT NULL,\n\tFOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,\n\tFOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null\n);",
      "CREATE UNIQUE INDEX `tenant_domains_domain_unique` ON `tenant_domains` (`domain`);",
      "CREATE INDEX `tenant_domains_tenant_idx` ON `tenant_domains` (`tenant_id`,`is_primary`);"
    ]
  },
  {
    "tag": "0012_site_stats_legal_financing",
    "statements": [
      "ALTER TABLE `tenant_sites` ADD `stats` text;",
      "ALTER TABLE `tenant_sites` ADD `financing` text;",
      "ALTER TABLE `tenant_sites` ADD `legal_privacy` text;",
      "ALTER TABLE `tenant_sites` ADD `legal_terms` text;",
      "ALTER TABLE `tenant_sites` ADD `legal_updated_at` integer;"
    ]
  },
  {
    "tag": "0013_site_reviews",
    "statements": [
      "ALTER TABLE `tenant_sites` ADD `reviews` text;"
    ]
  },
  {
    "tag": "0014_license_plate",
    "statements": [
      "ALTER TABLE `vehicles` ADD `license_plate` text;",
      "ALTER TABLE `vehicle_appraisals` ADD `license_plate` text;",
      "CREATE INDEX `vehicles_tenant_plate_idx` ON `vehicles` (`tenant_id`,`license_plate`);"
    ]
  },
  {
    "tag": "0015_retire_old_templates",
    "statements": [
      "-- Os cinco templates anteriores ao Figma sairam do codigo.\n--\n-- `getTemplate` cai no padrao quando nao acha o id, entao a revenda nao ficaria\n-- fora do ar. Mas ela amanheceria com outro desenho e o painel mostraria uma\n-- escolha que nao existe mais na lista: o campo diria \"template-2-dark\" e a\n-- tela nao teria esse cartao para marcar.\nUPDATE `tenants`\nSET `template_id` = 'vitrine'\nWHERE `template_id` NOT IN ('vitrine', 'showroom', 'marketplace');"
    ]
  },
  {
    "tag": "0016_photo_order_cover_first",
    "statements": [
      "-- A capa passa a ser a PRIMEIRA foto, e as posicoes ficam densas.\n--\n-- Ate aqui definir a capa so acendia `is_cover` e deixava a foto onde estava:\n-- o card do estoque mostrava uma imagem e a galeria da ficha abria em outra.\n-- E apagar uma foto do meio deixava buraco na numeracao, que o envio seguinte\n-- reusava — duas fotos com a mesma posicao saem na ordem que o banco escolher.\n--\n-- O codigo novo mantem as duas invariantes a cada mudanca. Isto aqui conserta\n-- o que ja esta gravado, sem esperar que alguem reabra cada veiculo.\n--\n-- A nova ordem e calculada numa tabela auxiliar, e nao direto no UPDATE. Nao e\n-- capricho: um UPDATE com subconsulta correlacionada le a propria tabela ENQUANTO\n-- a altera, entao uma foto ja renumerada volta a ser contada e duas terminam com\n-- a mesma posicao. Foi o que aconteceu no primeiro teste desta migracao.\nDROP TABLE IF EXISTS `__ordem_fotos`;",
      "CREATE TABLE `__ordem_fotos` (\n  `id` text PRIMARY KEY NOT NULL,\n  `pos` integer NOT NULL\n);",
      "-- A capa vai para a frente; o resto mantem a ordem relativa. `created_at` e\n-- depois `id` desempatam as posicoes repetidas que os buracos criaram.\nINSERT INTO `__ordem_fotos` (`id`, `pos`)\nSELECT\n  `id`,\n  ROW_NUMBER() OVER (\n    PARTITION BY `vehicle_id`\n    ORDER BY `is_cover` DESC, `position` ASC, `created_at` ASC, `id` ASC\n  ) - 1\nFROM `vehicle_photos`;",
      "UPDATE `vehicle_photos`\nSET `position` = (\n  SELECT `pos` FROM `__ordem_fotos` WHERE `__ordem_fotos`.`id` = `vehicle_photos`.`id`\n);",
      "-- A marca de capa passa a sair da posicao, e nao o contrario.\nUPDATE `vehicle_photos`\nSET `is_cover` = CASE WHEN `position` = 0 THEN 1 ELSE 0 END;",
      "-- O card do estoque le `cover_photo_key`; alinha com a foto que ficou na\n-- frente, senao a lista continua mostrando a imagem antiga.\nUPDATE `vehicles`\nSET `cover_photo_key` = (\n  SELECT json_extract(`foto`.`variants`, '$.card')\n  FROM `vehicle_photos` AS `foto`\n  WHERE `foto`.`vehicle_id` = `vehicles`.`id`\n    AND `foto`.`position` = 0\n)\nWHERE EXISTS (\n  SELECT 1 FROM `vehicle_photos` AS `foto` WHERE `foto`.`vehicle_id` = `vehicles`.`id`\n);",
      "DROP TABLE `__ordem_fotos`;"
    ]
  },
  {
    "tag": "0017_lead_external_id",
    "statements": [
      "ALTER TABLE `leads` ADD `external_id` text;",
      "CREATE INDEX `leads_external_idx` ON `leads` (`tenant_id`,`external_id`);"
    ]
  },
  {
    "tag": "0018_tracking",
    "statements": [
      "ALTER TABLE `tenant_sites` ADD `tracking` text;",
      "ALTER TABLE `tenant_sites` ADD `tracking_secrets` text;"
    ]
  },
  {
    "tag": "0019_notifications",
    "statements": [
      "ALTER TABLE `tenant_sites` ADD `notifications` text;"
    ]
  },
  {
    "tag": "0020_email_templates",
    "statements": [
      "ALTER TABLE `platform_settings` ADD `email_templates` text;"
    ]
  }
];
