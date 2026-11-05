CREATE TABLE IF NOT EXISTS `mechanics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`salary_cents` integer DEFAULT 0 NOT NULL,
	`commission_pct` integer DEFAULT 0 NOT NULL,
	`monthly_target_cents` integer DEFAULT 0 NOT NULL,
	`target_bonus_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text NOT NULL,
	`can_stock` integer DEFAULT false NOT NULL,
	`can_cost` integer DEFAULT false NOT NULL,
	`salary_cents` integer DEFAULT 0 NOT NULL,
	`commission_pct` integer DEFAULT 0 NOT NULL,
	`monthly_target_cents` integer DEFAULT 0 NOT NULL,
	`target_bonus_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`max_discount_pct` integer DEFAULT 5 NOT NULL,
	`auto_discount_over_cents` integer DEFAULT 500000 NOT NULL,
	`auto_discount_pct` integer DEFAULT 5 NOT NULL,
	`round_to_cents` integer DEFAULT 1000 NOT NULL,
	`round_direction` text DEFAULT 'down' NOT NULL,
	`tax_pct` integer DEFAULT 0 NOT NULL,
	`owner_auth_password_hash` text NOT NULL,
	`shop_name` text DEFAULT 'Spare Parts Shop' NOT NULL,
	`shop_address` text DEFAULT '' NOT NULL,
	`shop_phone` text DEFAULT '' NOT NULL,
	`receipt_footer` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `suppliers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`rep` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`brands` text DEFAULT '' NOT NULL,
	`term_days` integer DEFAULT 0 NOT NULL,
	`grades` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `customers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`vehicle_no` text DEFAULT '' NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`nic` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`credit_limit_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `part_grades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`cost_cents` integer DEFAULT 0 NOT NULL,
	`price_cents` integer,
	`qty` integer DEFAULT 0 NOT NULL,
	`reorder_level` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `part_grade_idx` ON `part_grades` (`part_id`,`grade`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `part_supplier_numbers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_id` integer NOT NULL,
	`supplier_id` integer NOT NULL,
	`supplier_part_no` text NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `supplier_part_no_idx` ON `part_supplier_numbers` (`supplier_id`,`supplier_part_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_no` text NOT NULL,
	`name` text NOT NULL,
	`manufacturer` text NOT NULL,
	`category` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`rack` text DEFAULT '' NOT NULL,
	`models` text NOT NULL,
	`unit` text,
	`sells` text,
	`brand_item` integer,
	`vehicle_class` text,
	`price_estimated` integer,
	`price_source` text,
	`price_source_url` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`updated_by` integer,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `parts_part_no_unique` ON `parts` (`part_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `stock_movements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`qty_delta` integer NOT NULL,
	`reason` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`ref_type` text,
	`ref_id` integer,
	`user_id` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `stock_movements_part_id_idx` ON `stock_movements` (`part_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`qty` integer NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sale_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sale_id` integer NOT NULL,
	`description` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`mechanic_id` integer,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mechanic_id`) REFERENCES `mechanics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sales` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`invoice_no` text NOT NULL,
	`customer_id` integer,
	`vehicle_no` text DEFAULT '' NOT NULL,
	`mechanic_id` integer,
	`job_id` integer,
	`pre_order_id` integer,
	`subtotal_cents` integer NOT NULL,
	`discount_pct` integer DEFAULT 0 NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`auto_discount_applied` integer DEFAULT false NOT NULL,
	`round_off_cents` integer DEFAULT 0 NOT NULL,
	`tax_cents` integer DEFAULT 0 NOT NULL,
	`advance_deducted_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`payment_method` text NOT NULL,
	`amount_paid_cents` integer DEFAULT 0 NOT NULL,
	`change_cents` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'completed' NOT NULL,
	`voided_at` text,
	`voided_by` integer,
	`void_reason` text,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mechanic_id`) REFERENCES `mechanics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `sales_invoice_no_unique` ON `sales` (`invoice_no`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_created_at_idx` ON `sales` (`created_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_customer_id_idx` ON `sales` (`customer_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sales_created_by_idx` ON `sales` (`created_by`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`payment_no` text NOT NULL,
	`type` text NOT NULL,
	`party_id` integer NOT NULL,
	`sale_id` integer,
	`amount_cents` integer NOT NULL,
	`method` text DEFAULT 'cash' NOT NULL,
	`cheque_no` text DEFAULT '' NOT NULL,
	`cheque_date` text,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `payments_payment_no_unique` ON `payments` (`payment_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`qty` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `service_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `job_services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_id` integer NOT NULL,
	`service_list_id` integer,
	`name` text NOT NULL,
	`price_cents` integer NOT NULL,
	`qty` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `service_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_list_id`) REFERENCES `service_price_list`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `service_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job_no` text NOT NULL,
	`customer_id` integer,
	`vehicle_no` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`mechanic_id` integer,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`sale_id` integer,
	`cancelled_at` text,
	`cancelled_by` integer,
	`cancel_reason` text,
	`created_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`mechanic_id`) REFERENCES `mechanics`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cancelled_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `service_jobs_job_no_unique` ON `service_jobs` (`job_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `service_price_list` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `missing_parts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`description` text NOT NULL,
	`manufacturer` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`customer_name` text DEFAULT '' NOT NULL,
	`customer_phone` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`recorded_by` integer,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pre_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`pre_order_no` text NOT NULL,
	`customer_id` integer,
	`part_id` integer,
	`grade` text,
	`qty` integer DEFAULT 1 NOT NULL,
	`part_description` text NOT NULL,
	`vehicle` text DEFAULT '' NOT NULL,
	`order_date` text NOT NULL,
	`promised_date` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`advance_paid_cents` integer DEFAULT 0 NOT NULL,
	`sale_id` integer,
	`recorded_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recorded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `pre_orders_pre_order_no_unique` ON `pre_orders` (`pre_order_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `grn_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grn_id` integer NOT NULL,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`qty` integer NOT NULL,
	`free_qty` integer DEFAULT 0 NOT NULL,
	`unit_cost_cents` integer NOT NULL,
	`new_sell_price_cents` integer,
	`supplier_part_no` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`grn_id`) REFERENCES `grns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `grns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`grn_no` text NOT NULL,
	`supplier_id` integer NOT NULL,
	`their_bill_no` text DEFAULT '' NOT NULL,
	`bill_date` text NOT NULL,
	`subtotal_cents` integer NOT NULL,
	`discount_cents` integer DEFAULT 0 NOT NULL,
	`total_cents` integer NOT NULL,
	`paid_now_cents` integer DEFAULT 0 NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `grns_grn_no_unique` ON `grns` (`grn_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `returns` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`return_no` text NOT NULL,
	`party_type` text NOT NULL,
	`supplier_id` integer,
	`customer_id` integer,
	`grn_id` integer,
	`sale_id` integer,
	`part_id` integer NOT NULL,
	`grade` text NOT NULL,
	`qty` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`reason` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`created_at` text NOT NULL,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`grn_id`) REFERENCES `grns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`part_id`) REFERENCES `parts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `returns_return_no_unique` ON `returns` (`return_no`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `advances` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_type` text NOT NULL,
	`staff_id` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`period` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_type` text NOT NULL,
	`staff_id` integer NOT NULL,
	`date` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`marked_by` integer NOT NULL,
	`marked_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `payslips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_type` text NOT NULL,
	`staff_id` integer NOT NULL,
	`period` text NOT NULL,
	`salary_cents` integer DEFAULT 0 NOT NULL,
	`commission_cents` integer DEFAULT 0 NOT NULL,
	`target_bonus_cents` integer DEFAULT 0 NOT NULL,
	`advances_deducted_cents` integer DEFAULT 0 NOT NULL,
	`expenses_cents` integer DEFAULT 0 NOT NULL,
	`absence_deduction_cents` integer DEFAULT 0 NOT NULL,
	`net_cents` integer DEFAULT 0 NOT NULL,
	`generated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `staff_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`staff_type` text NOT NULL,
	`staff_id` integer NOT NULL,
	`period` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `activity_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text,
	`entity_id` integer,
	`details` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
