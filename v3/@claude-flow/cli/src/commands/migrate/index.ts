/**
 * Migration Module
 * Exports for v2 to v3 migration tooling
 */

export * from './types.js';
export { migrateConfig, ConfigMigrator } from './migrate-config.js';
export { migrateDatabase, DatabaseMigrator } from './migrate-database.js';
export { migratePlugins, PluginMigrator } from './migrate-plugins.js';
export { migrateSessions, SessionMigrator } from './migrate-sessions.js';
export { validateMigration, MigrationValidator } from './validate-migration.js';
export { rollbackMigration, listBackups, MigrationRollback } from './rollback.js';

// Re-export migration command
export { migrateCommand } from './command.js';
