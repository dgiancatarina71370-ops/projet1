import type { Migration } from '../migrate.ts';
import m0001 from './0001_init.ts';

// Ajouter ici chaque nouvelle migration, dans l'ordre. Les versions doivent se suivre sans trou (vérifié au démarrage et par les tests).
export const migrations: Migration[] = [m0001];

export const SCHEMA_VERSION = migrations.length;
