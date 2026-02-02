/**
 * V3 CLI Migrate Command
 * Migration tools for V2 to V3 transition
 *
 * Re-exports the modular migration command from ./migrate/command.js
 * The actual implementation is in ./migrate/ for better organization
 */

export { migrateCommand, migrateCommand as default } from './migrate/command.js';
