import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const rooms = sqliteTable('ov_rooms', {
  code: text('code').primaryKey(), state: text('state').notNull(),
  revision: integer('revision').notNull().default(0), expires: integer('expires').notNull(),
});
