CREATE TABLE `inventory` (
	`sku` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`size` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "inventory_nonnegative" CHECK("inventory"."quantity" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inventory_variant_idx` ON `inventory` (`product_id`,`size`);--> statement-breakpoint
CREATE TABLE `payment_events` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`order_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `order_reservations` (
	`order_id` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`order_id`, `sku`),
	FOREIGN KEY (`order_id`) REFERENCES `sales_orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sku`) REFERENCES `inventory`(`sku`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reservation_positive" CHECK("order_reservations"."quantity">0)
);
--> statement-breakpoint
CREATE TABLE `sales_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`checkout_key` text NOT NULL,
	`session_hash` text NOT NULL,
	`request_digest` text NOT NULL,
	`request_hash` text NOT NULL,
	`request_window` integer NOT NULL,
	`mode` text NOT NULL,
	`email` text NOT NULL,
	`address` text NOT NULL,
	`items` text NOT NULL,
	`subtotal` integer NOT NULL,
	`shipping` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	`payment_status` text NOT NULL,
	`reservation_status` text NOT NULL,
	`paypal_order_id` text,
	`capture_id` text,
	`refund_id` text,
	`approval_url` text,
	`fulfillment_status` text DEFAULT 'unfulfilled' NOT NULL,
	`tracking_carrier` text DEFAULT '' NOT NULL,
	`tracking_number` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`expires_at` integer NOT NULL,
	`issue` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_orders_checkout_key_unique` ON `sales_orders` (`checkout_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_orders_paypal_order_id_unique` ON `sales_orders` (`paypal_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_orders_capture_id_unique` ON `sales_orders` (`capture_id`);--> statement-breakpoint
CREATE INDEX `orders_rate_idx` ON `sales_orders` (`request_hash`,`request_window`);--> statement-breakpoint
CREATE INDEX `orders_status_idx` ON `sales_orders` (`payment_status`,`expires_at`);