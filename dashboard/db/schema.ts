import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(), userId: text('user_id').notNull(),
  createdAt: text('created_at').notNull(), repository: text('repository').notNull(), payload: text('payload').notNull(),
}, t => [index('reviews_user_created').on(t.userId, t.createdAt)]);

export const cliSessions = sqliteTable('cli_sessions', {
  tokenHash: text('token_hash').primaryKey(), userId: text('user_id').notNull(),
  createdAt: integer('created_at').notNull(), expiresAt: integer('expires_at').notNull(),
}, t => [index('sessions_user').on(t.userId)]);

export const devices = sqliteTable('cli_devices', {
  deviceHash: text('device_hash').primaryKey(), userCode: text('user_code').notNull().unique(),
  userId: text('user_id'), ipHash: text('ip_hash').notNull(), createdAt: integer('created_at').notNull(),
  expiresAt: integer('expires_at').notNull(), consumed: integer('consumed').notNull().default(0),
}, t => [index('devices_ip_created').on(t.ipHash, t.createdAt)]);
