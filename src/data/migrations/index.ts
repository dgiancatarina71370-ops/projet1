import type { Migration } from '../migrate.ts';
import m0001 from './0001_init.ts';
import m0002 from './0002_domain_model.ts';
import m0003 from './0003_stakeholders_and_updates.ts';

// Ajouter ici chaque nouvelle migration, dans l'ordre. Les versions doivent se suivre sans trou (vérifié au démarrage et par les tests).
export const migrations: Migration[] = [m0001, m0002, m0003];

export const SCHEMA_VERSION = migrations.length;
