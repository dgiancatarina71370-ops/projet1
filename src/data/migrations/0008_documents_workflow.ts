import type { Migration } from '../migrate.ts';

// Schéma 8 (lot F5, décision F5-D02) : documents versionnés et figés (instantanés).
// Migration ADDITIVE sur la table « documents » de la V1 : six colonnes (défaut vide, sauf « version » à 1) et un index.
// Aucune ligne existante n'est réécrite : un document importé de la V1 garde toutes ses valeurs, sans série (series_key vide).
// « validation_comment » ne sert qu'au lot F6 : elle est ajoutée ici pour n'avoir qu'une seule migration (plan V1.0).
// « replaces_id » : version précédente de la série ; le document remplacé n'est jamais modifié (« Remplacé » = être désigné par ce lien).
const migration: Migration = {
  version: 8,
  name: 'documents_workflow',
  statements: [
    'ALTER TABLE documents ADD COLUMN series_key TEXT',
    'ALTER TABLE documents ADD COLUMN version INTEGER NOT NULL DEFAULT 1',
    'ALTER TABLE documents ADD COLUMN replaces_id INTEGER REFERENCES documents(id) ON DELETE SET NULL',
    'ALTER TABLE documents ADD COLUMN options_json TEXT',
    'ALTER TABLE documents ADD COLUMN items_snapshot TEXT',
    'ALTER TABLE documents ADD COLUMN validation_comment TEXT',
    'CREATE UNIQUE INDEX idx_documents_series ON documents(project_id, series_key, version) WHERE series_key IS NOT NULL',
  ],
};

export default migration;
