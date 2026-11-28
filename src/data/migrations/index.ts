import type { Migration } from '../migrate.ts';
import m0001 from './0001_init.ts';
import m0002 from './0002_domain_model.ts';
import m0003 from './0003_stakeholders_and_updates.ts';
import m0004 from './0004_requirement_details.ts';
import m0005 from './0005_decision_risk_details.ts';
import m0006 from './0006_story_test_details.ts';
import m0007 from './0007_workshop_details.ts';
import m0008 from './0008_documents_workflow.ts';
import m0009 from './0009_distribution.ts';

// Ajouter ici chaque nouvelle migration, dans l'ordre. Les versions doivent se suivre sans trou (vérifié au démarrage et par les tests).
export const migrations: Migration[] = [m0001, m0002, m0003, m0004, m0005, m0006, m0007, m0008, m0009];

export const SCHEMA_VERSION = migrations.length;
