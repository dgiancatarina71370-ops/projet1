import type { Migration } from '../migrate.ts';
import m0001 from './0001_init.ts';
import m0002 from './0002_domain_model.ts';

// Ajouter ici chaque nouvelle migration, dans l'ordre. Les versions doivent se suivre sans trou (vérifié au démarrage et par les tests).
export const migrations: Migration[] = [m0001, m0002];

export const SCHEMA_VERSION = migrations.length;
