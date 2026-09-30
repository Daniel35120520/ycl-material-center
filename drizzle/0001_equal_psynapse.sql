CREATE TABLE `submission_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`standard_batch_id` text,
	`submitted_by` text NOT NULL,
	`submitted_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `submission_groups_project_date_idx` ON `submission_groups` (`project_id`,`submitted_at`);--> statement-breakpoint
DROP INDEX `machines_type_code_unique`;--> statement-breakpoint
ALTER TABLE `machines` ADD `project_id` text REFERENCES projects(id);--> statement-breakpoint
CREATE UNIQUE INDEX `machines_project_type_code_unique` ON `machines` (`project_id`,`type`,`code`);--> statement-breakpoint
CREATE INDEX `machines_project_idx` ON `machines` (`project_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_group_id` text NOT NULL,
	`project_id` text NOT NULL,
	`branch_id` text,
	`batch_no` text NOT NULL,
	`production_date` text NOT NULL,
	`reporter_id` text NOT NULL,
	`is_standard` integer DEFAULT false NOT NULL,
	`input_weight` real,
	`output_weight` real,
	`yield_percent` real,
	`pan_weight` real,
	`wet_weight` real,
	`dry_weight` real,
	`solid_percent` real,
	`viscosity` real,
	`viscosities_json` text NOT NULL,
	`ti_value` real,
	`sheet_resistance_json` text NOT NULL,
	`sheet_exponent` integer,
	`thickness_json` text NOT NULL,
	`resistivity` real,
	`fineness_main` real,
	`fineness_second` real,
	`film_success` integer,
	`machines_json` text NOT NULL,
	`recipe_json` text NOT NULL,
	`process_json` text NOT NULL,
	`note` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`submission_group_id`) REFERENCES `submission_groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
-- 此版本尚未有正式批次資料；舊版示範表不含 submission group 與完整量測欄位，
-- 因此不嘗試把不完整的舊資料搬入新模型，避免建立無法追溯的標準品／DOE 關聯。
DROP TABLE `batches`;--> statement-breakpoint
ALTER TABLE `__new_batches` RENAME TO `batches`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `batches_batch_no_unique` ON `batches` (`batch_no`);--> statement-breakpoint
CREATE INDEX `batches_project_date_idx` ON `batches` (`project_id`,`production_date`);--> statement-breakpoint
CREATE INDEX `batches_submission_group_idx` ON `batches` (`submission_group_id`);
