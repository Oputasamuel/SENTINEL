CREATE TABLE `cli_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `cli_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `cli_devices` (
	`device_hash` text PRIMARY KEY NOT NULL,
	`user_code` text NOT NULL,
	`user_id` text,
	`ip_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cli_devices_user_code_unique` ON `cli_devices` (`user_code`);--> statement-breakpoint
CREATE INDEX `devices_ip_created` ON `cli_devices` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`repository` text NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reviews_user_created` ON `reviews` (`user_id`,`created_at`);