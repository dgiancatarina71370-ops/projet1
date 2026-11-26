// Projet d'exemple (lot M9, décisions D105 à D109) : le scénario de référence, sous forme de DONNÉES pures (aucune base, aucune interface).
// Un cas entièrement fictif (commune inventée, aucune personne, uniquement des fonctions) : il se montre partout.
// Chaque élément porte une clé identique au code qu'il recevra à la création (PP-001, BES-001, EX-001…) : les liens s'y réfèrent par clé.
// Les codes sont attribués par séquences dans l'ordre de ces listes ; un test du lot vérifie que clé et code coïncident.
// Les manques sont VOLONTAIRES (D109) : EX-006, EX-007 et EX-008 sans story, EX-008 sans test, US-006 sans exigence ni test.
import type { ItemKind } from './kinds.ts';
import type { LinkType } from './links.ts';
import type { DecisionFields } from './decisions.ts';
import type { RequirementFields } from './requirements.ts';
import type { RiskFields } from './risks.ts';
import type { StakeholderFields } from './stakeholders.ts';
import type { StoryFields } from './stories.ts';
import type { TestFields } from './testcases.ts';
import type { WorkshopFields } from './workshops.ts';

export const SAMPLE_PROJECT_NAME = '[Exemple] Portail de réservation de salles';

interface Base<K extends ItemKind, F> {
  key: string;
  kind: K;
  title: string;
  description: string;
  /** Statut à fixer après la création (le statut initial d'un élément est le premier de sa liste). */
  status: string;
  fields: F;
}

export type SampleItem =
  | Base<'stakeholder', StakeholderFields>
  | Base<'need', Record<string, never>>
  | Base<'requirement', RequirementFields>
  | Base<'decision', DecisionFields>
  | Base<'risk', RiskFields>
  | Base<'story', StoryFields>
  | Base<'test', TestFields>
  | Base<'workshop', WorkshopFields>;

export interface SampleLink {
  type: LinkType;
  from: string;
  to: string;
}

const none: Record<string, never> = {};

export const SAMPLE_ITEMS: readonly SampleItem[] = [
  // ---- Parties prenantes
  { key: 'PP-001', kind: 'stakeholder', title: 'Direction générale des services', description: 'Commande le projet et arbitre les priorités. Attend un suivi simple de l\'occupation des salles.', status: 'active', fields: { organisation: 'Mairie de Val-des-Sources', role: 'Sponsor', influence: 'high', interest: 'high' } },
  { key: 'PP-002', kind: 'stakeholder', title: 'Service Vie associative', description: 'Instruit aujourd\'hui les demandes de salles par téléphone et par courrier. Propriétaire du processus de validation.', status: 'active', fields: { organisation: 'Mairie de Val-des-Sources', role: 'Propriétaire métier', influence: 'high', interest: 'high' } },
  { key: 'PP-003', kind: 'stakeholder', title: 'Collectif des associations', description: 'Regroupe les associations qui réservent régulièrement des salles. Demande de pouvoir réserver sans se déplacer.', status: 'active', fields: { organisation: 'Associations locales', role: 'Utilisateur', influence: 'medium', interest: 'high' } },
  { key: 'PP-004', kind: 'stakeholder', title: 'Agents d\'accueil des salles', description: 'Remettent les clés et constatent les conflits de réservation sur place.', status: 'active', fields: { organisation: 'Mairie de Val-des-Sources', role: 'Utilisateur interne', influence: 'medium', interest: 'high' } },
  { key: 'PP-005', kind: 'stakeholder', title: 'Service informatique', description: 'Héberge et sécurise les applications de la mairie. Impose ses règles d\'exploitation.', status: 'active', fields: { organisation: 'Mairie de Val-des-Sources', role: 'Hébergement et sécurité', influence: 'high', interest: 'medium' } },

  // ---- Besoins
  { key: 'BES-001', kind: 'need', title: 'Réserver une salle sans passer par l\'accueil', description: 'Les associations veulent déposer une demande à toute heure, sans appeler ni se déplacer en mairie.', status: 'validated', fields: none },
  { key: 'BES-002', kind: 'need', title: 'Éviter les doubles réservations', description: 'Une même salle est parfois attribuée deux fois au même créneau ; les conflits sont découverts le jour même, à l\'accueil.', status: 'validated', fields: none },
  { key: 'BES-003', kind: 'need', title: 'Suivre l\'occupation des salles', description: 'La direction veut savoir quelles salles sont utilisées, à quel rythme, pour décider des investissements.', status: 'validated', fields: none },
  { key: 'BES-004', kind: 'need', title: 'Héberger la solution dans le système d\'information de la mairie', description: 'Les données des associations ne doivent pas quitter l\'infrastructure de la commune.', status: 'validated', fields: none },

  // ---- Exigences
  { key: 'EX-001', kind: 'requirement', title: 'Rechercher une salle par date, capacité et équipement', description: 'Le demandeur trouve les salles libres qui correspondent à son besoin.', status: 'validated', fields: { nature: 'functional', priority: 'must', criteria: 'La recherche accepte une date, une capacité minimale et une liste d\'équipements.\nSeules les salles libres sur le créneau demandé sont proposées.\nSans résultat, un message propose d\'élargir les critères.' } },
  { key: 'EX-002', kind: 'requirement', title: 'Demande de réservation en ligne avec confirmation par e-mail', description: 'Le demandeur dépose sa demande depuis le portail et reçoit un accusé de réception.', status: 'validated', fields: { nature: 'functional', priority: 'must', criteria: 'Une demande contient la salle, le créneau, l\'association et le motif.\nUn e-mail d\'accusé de réception est envoyé dans les 5 minutes.\nLa demande apparaît « en attente » dans le suivi du demandeur.' } },
  { key: 'EX-003', kind: 'requirement', title: 'Blocage automatique d\'un créneau déjà réservé', description: 'Un créneau réservé ne peut plus être demandé par un autre utilisateur.', status: 'validated', fields: { nature: 'functional', priority: 'must', criteria: 'Un créneau validé n\'est plus proposé à la recherche.\nUne demande concurrente sur le même créneau est refusée avec un message explicite.\nDeux demandes simultanées ne peuvent pas être toutes deux validées.' } },
  { key: 'EX-004', kind: 'requirement', title: 'Validation des demandes par le service Vie associative sous 3 jours ouvrés', description: 'Chaque demande est acceptée ou refusée par un agent, avec un motif en cas de refus.', status: 'validated', fields: { nature: 'functional', priority: 'should', criteria: 'Les demandes en attente sont listées par ancienneté.\nUn refus exige un motif, transmis au demandeur.\nUne demande en attente depuis plus de 3 jours ouvrés est signalée.' } },
  { key: 'EX-005', kind: 'requirement', title: 'Tableau de bord mensuel du taux d\'occupation', description: 'Présente, par salle et par mois, le taux d\'occupation des créneaux.', status: 'draft', fields: { nature: 'functional', priority: 'should', criteria: 'Le taux est calculé par salle et par mois.\nLe mois affiché est modifiable.\nLes demandes refusées ou annulées ne comptent pas.' } },
  { key: 'EX-006', kind: 'requirement', title: 'Résultats de recherche en moins de 2 secondes', description: 'La recherche reste fluide, y compris en période de forte fréquentation.', status: 'validated', fields: { nature: 'non_functional', priority: 'should', criteria: 'Le temps de réponse est inférieur à 2 secondes pour 95 % des recherches.\nLa mesure est faite avec 50 utilisateurs simultanés.' } },
  { key: 'EX-007', kind: 'requirement', title: 'Hébergement sur l\'infrastructure de la mairie, sans service externe', description: 'Aucune donnée n\'est stockée ni traitée hors du système d\'information de la commune.', status: 'validated', fields: { nature: 'constraint', priority: 'must', criteria: 'L\'application et sa base sont installées sur les serveurs de la mairie.\nAucun service tiers n\'est appelé pour stocker ou traiter les données des demandeurs.' } },
  { key: 'EX-008', kind: 'requirement', title: 'Export du planning au format iCalendar', description: 'Permet d\'importer le planning d\'une salle dans un agenda externe.', status: 'draft', fields: { nature: 'functional', priority: 'could', criteria: 'L\'export d\'une salle sur un mois produit un fichier iCalendar valide.\nChaque réservation validée devient un événement.' } },

  // ---- Décisions
  { key: 'DEC-001', kind: 'decision', title: 'Acheter un progiciel de réservation du marché', description: 'Première orientation prise à l\'issue du cadrage.', status: 'superseded', fields: { decidedOn: '2026-02-24', decider: 'Direction générale des services', alternatives: 'Développement sur mesure ; maintien du processus actuel par téléphone et courrier.', rationale: 'Mise en service rapide et solution déjà éprouvée dans d\'autres communes.' } },
  { key: 'DEC-002', kind: 'decision', title: 'Développer un portail sur mesure, hébergé en interne', description: 'Remplace l\'achat d\'un progiciel après l\'analyse des licences et des contraintes d\'hébergement.', status: 'decided', fields: { decidedOn: '2026-03-17', decider: 'Comité de pilotage', alternatives: 'Progiciel en mode hébergé par l\'éditeur ; progiciel installé en interne.', rationale: 'Le coût des licences dépasse le budget et les progiciels étudiés exigent un hébergement chez l\'éditeur, incompatible avec la contrainte EX-007.' } },
  { key: 'DEC-003', kind: 'decision', title: 'Validation manuelle des demandes dans la première version', description: 'Aucune acceptation automatique en première version.', status: 'decided', fields: { decidedOn: '2026-03-17', decider: 'Comité de pilotage', alternatives: 'Acceptation automatique des demandes des associations déjà connues.', rationale: 'Le service Vie associative garde la maîtrise des attributions tant que les règles de priorité ne sont pas stabilisées.' } },

  // ---- Risques
  { key: 'RIS-001', kind: 'risk', title: 'Saturation du service en période de pointe', description: 'La rentrée de septembre concentre les demandes : le portail pourrait ralentir.', status: 'identified', fields: { probability: 'medium', impact: 'high', owner: 'Service informatique', mitigation: 'Réaliser un test de charge avant la mise en service. Dimensionner le serveur sur la période de rentrée.' } },
  { key: 'RIS-002', kind: 'risk', title: 'Demandes non traitées dans les délais, faute d\'agents', description: 'La validation manuelle dépend de la disponibilité de quelques agents.', status: 'mitigating', fields: { probability: 'high', impact: 'medium', owner: 'Service Vie associative', mitigation: 'Signaler les demandes proches du délai. Désigner un suppléant par période de congés.' } },
  { key: 'RIS-003', kind: 'risk', title: 'Résistance au changement des associations habituées à l\'accueil physique', description: 'Certaines associations préfèrent encore le contact direct.', status: 'accepted', fields: { probability: 'medium', impact: 'low', owner: 'Service Vie associative', mitigation: 'Maintenir le guichet pendant les trois premiers mois. Proposer une séance de présentation aux associations.' } },
  { key: 'RIS-004', kind: 'risk', title: 'Indisponibilité du prestataire de messagerie', description: 'Risque écarté : la messagerie est désormais assurée par le service informatique de la mairie.', status: 'archived', fields: { probability: 'low', impact: 'medium', owner: 'Service informatique', mitigation: 'Sans objet depuis le passage à la messagerie interne.' } },

  // ---- User stories
  { key: 'US-001', kind: 'story', title: 'Rechercher une salle libre', description: '', status: 'done', fields: { role: 'représentant d\'association', goal: 'rechercher les salles libres selon la date, la capacité et l\'équipement', benefit: 'trouver rapidement une salle adaptée sans appeler la mairie', criteria: 'Étant donné une date et une capacité, quand je lance la recherche, alors je vois uniquement les salles libres.' } },
  { key: 'US-002', kind: 'story', title: 'Demander une réservation', description: '', status: 'done', fields: { role: 'représentant d\'association', goal: 'déposer une demande de réservation en ligne', benefit: 'obtenir une réponse sans me déplacer', criteria: 'Étant donné une salle libre, quand je valide ma demande, alors je reçois un e-mail d\'accusé de réception.' } },
  { key: 'US-003', kind: 'story', title: 'Voir les créneaux déjà pris', description: '', status: 'ready', fields: { role: 'représentant d\'association', goal: 'voir les créneaux déjà réservés d\'une salle', benefit: 'éviter de déposer une demande vouée au refus', criteria: 'Étant donné un créneau réservé, quand j\'affiche le planning de la salle, alors il est signalé comme indisponible.' } },
  { key: 'US-004', kind: 'story', title: 'Valider ou refuser une demande', description: '', status: 'ready', fields: { role: 'agent du service Vie associative', goal: 'accepter ou refuser une demande en attente', benefit: 'garder la maîtrise des attributions et informer le demandeur', criteria: 'Étant donné une demande en attente, quand je la refuse, alors un motif est obligatoire et transmis au demandeur.' } },
  { key: 'US-005', kind: 'story', title: 'Consulter le taux d\'occupation', description: '', status: 'draft', fields: { role: 'membre de la direction', goal: 'consulter le taux d\'occupation mensuel par salle', benefit: 'décider des investissements sur les salles les plus utilisées', criteria: 'Étant donné un mois choisi, quand j\'ouvre le tableau de bord, alors je vois le taux de chaque salle.' } },
  { key: 'US-006', kind: 'story', title: 'Imprimer l\'affiche de la salle du jour', description: 'Idée issue des agents d\'accueil, pas encore rattachée à une exigence.', status: 'draft', fields: { role: 'agent d\'accueil', goal: 'imprimer l\'affiche des réservations du jour pour une salle', benefit: 'informer les occupants sans écran', criteria: '' } },

  // ---- Tests
  { key: 'TEST-001', kind: 'test', title: 'Recherche par date et capacité', description: '', status: 'passed', fields: { testType: 'acceptance', preconditions: 'Trois salles de capacités différentes ; une est réservée le jour testé.', steps: '1. Ouvrir la recherche.\n2. Saisir la date et une capacité de 40.\n3. Lancer la recherche.', expected: 'Seules les salles libres de capacité au moins 40 sont listées.', lastRunOn: '2026-09-08' } },
  { key: 'TEST-002', kind: 'test', title: 'Demande avec e-mail de confirmation', description: '', status: 'passed', fields: { testType: 'acceptance', preconditions: 'Une salle libre ; une adresse e-mail de test.', steps: '1. Choisir la salle et le créneau.\n2. Renseigner l\'association et le motif.\n3. Valider la demande.', expected: 'La demande passe « en attente » et l\'e-mail d\'accusé de réception arrive en moins de 5 minutes.', lastRunOn: '2026-09-08' } },
  { key: 'TEST-003', kind: 'test', title: 'Double réservation refusée', description: 'Échec constaté lors de la dernière exécution : le second utilisateur a pu valider.', status: 'failed', fields: { testType: 'integration', preconditions: 'Deux comptes de test ; un créneau libre.', steps: '1. Le premier compte réserve le créneau.\n2. Le second compte tente de réserver le même créneau.', expected: 'La seconde demande est refusée avec un message explicite.', lastRunOn: '2026-09-10' } },
  { key: 'TEST-004', kind: 'test', title: 'Validation sous 3 jours', description: '', status: 'to_run', fields: { testType: 'acceptance', preconditions: 'Une demande en attente depuis 4 jours ouvrés.', steps: '1. Ouvrir la liste des demandes en attente.\n2. Repérer la demande ancienne.', expected: 'La demande est signalée comme proche ou au-delà du délai.', lastRunOn: '' } },
  { key: 'TEST-005', kind: 'test', title: 'Temps de réponse de la recherche', description: 'Bloqué : l\'environnement de charge n\'est pas encore disponible.', status: 'blocked', fields: { testType: 'integration', preconditions: 'Environnement de charge simulant 50 utilisateurs simultanés.', steps: '1. Lancer 50 recherches simultanées.\n2. Relever les temps de réponse.', expected: '95 % des réponses en moins de 2 secondes.', lastRunOn: '' } },
  { key: 'TEST-006', kind: 'test', title: 'Hébergement interne', description: '', status: 'passed', fields: { testType: 'acceptance', preconditions: 'Accès à la documentation d\'architecture et aux serveurs de la mairie.', steps: '1. Relever où sont installées l\'application et sa base.\n2. Lister les appels sortants vers des services tiers.', expected: 'Tout est sur l\'infrastructure de la mairie ; aucun appel vers un service tiers de stockage ou de traitement.', lastRunOn: '2026-09-12' } },
  { key: 'TEST-007', kind: 'test', title: 'Calcul du taux d\'occupation', description: '', status: 'passed', fields: { testType: 'unit', preconditions: 'Un jeu de réservations connu sur un mois.', steps: '1. Calculer le taux d\'une salle sur le mois.\n2. Comparer au résultat attendu.', expected: 'Le taux calculé correspond au résultat attendu ; les demandes refusées ne comptent pas.', lastRunOn: '2026-09-09' } },

  // ---- Atelier
  { key: 'ATL-001', kind: 'workshop', title: 'Atelier de cadrage du portail de réservation', description: 'Premier atelier réunissant tous les acteurs.', status: 'held', fields: { heldOn: '2026-02-10', place: 'Salle du conseil, mairie de Val-des-Sources', objective: 'Partager le constat sur la gestion actuelle des salles et recueillir les besoins prioritaires.', notes: 'Les conflits de réservation sont découverts le jour même, à l\'accueil.\nLes associations souhaitent déposer leurs demandes à toute heure.\nLa direction veut un suivi de l\'occupation des salles.\nUne première orientation vers un progiciel du marché est évoquée.', followUp: 'Le service informatique précise les contraintes d\'hébergement avant le prochain comité.\nLe service Vie associative chiffre le nombre de demandes par mois.' } },
];

export const SAMPLE_LINKS: readonly SampleLink[] = [
  { type: 'expresses', from: 'PP-003', to: 'BES-001' },
  { type: 'expresses', from: 'PP-002', to: 'BES-001' },
  { type: 'expresses', from: 'PP-004', to: 'BES-002' },
  { type: 'expresses', from: 'PP-002', to: 'BES-002' },
  { type: 'expresses', from: 'PP-001', to: 'BES-003' },
  { type: 'expresses', from: 'PP-005', to: 'BES-004' },
  { type: 'derives', from: 'BES-001', to: 'EX-001' },
  { type: 'derives', from: 'BES-001', to: 'EX-002' },
  { type: 'derives', from: 'BES-001', to: 'EX-006' },
  { type: 'derives', from: 'BES-002', to: 'EX-003' },
  { type: 'derives', from: 'BES-002', to: 'EX-004' },
  { type: 'derives', from: 'BES-003', to: 'EX-005' },
  { type: 'derives', from: 'BES-003', to: 'EX-008' },
  { type: 'derives', from: 'BES-004', to: 'EX-007' },
  { type: 'refines', from: 'EX-006', to: 'EX-001' },
  { type: 'implements', from: 'US-001', to: 'EX-001' },
  { type: 'implements', from: 'US-002', to: 'EX-002' },
  { type: 'implements', from: 'US-003', to: 'EX-003' },
  { type: 'implements', from: 'US-004', to: 'EX-004' },
  { type: 'implements', from: 'US-005', to: 'EX-005' },
  { type: 'verifies', from: 'TEST-001', to: 'EX-001' },
  { type: 'verifies', from: 'TEST-001', to: 'US-001' },
  { type: 'verifies', from: 'TEST-002', to: 'EX-002' },
  { type: 'verifies', from: 'TEST-002', to: 'US-002' },
  { type: 'verifies', from: 'TEST-003', to: 'EX-003' },
  { type: 'verifies', from: 'TEST-003', to: 'US-003' },
  { type: 'verifies', from: 'TEST-004', to: 'US-004' },
  { type: 'verifies', from: 'TEST-005', to: 'EX-006' },
  { type: 'verifies', from: 'TEST-006', to: 'EX-007' },
  { type: 'verifies', from: 'TEST-007', to: 'EX-005' },
  { type: 'verifies', from: 'TEST-007', to: 'US-005' },
  { type: 'concerns', from: 'DEC-001', to: 'BES-004' },
  { type: 'concerns', from: 'DEC-002', to: 'BES-004' },
  { type: 'concerns', from: 'DEC-002', to: 'EX-007' },
  { type: 'concerns', from: 'DEC-003', to: 'EX-004' },
  { type: 'supersedes', from: 'DEC-002', to: 'DEC-001' },
  { type: 'mitigates', from: 'DEC-003', to: 'RIS-002' },
  { type: 'mitigates', from: 'EX-004', to: 'RIS-002' },
  { type: 'threatens', from: 'RIS-001', to: 'EX-006' },
  { type: 'threatens', from: 'RIS-002', to: 'EX-004' },
  { type: 'threatens', from: 'RIS-003', to: 'BES-001' },
  { type: 'threatens', from: 'RIS-004', to: 'EX-002' },
  { type: 'participates', from: 'PP-001', to: 'ATL-001' },
  { type: 'participates', from: 'PP-002', to: 'ATL-001' },
  { type: 'participates', from: 'PP-003', to: 'ATL-001' },
  { type: 'participates', from: 'PP-004', to: 'ATL-001' },
  { type: 'participates', from: 'PP-005', to: 'ATL-001' },
  { type: 'originates', from: 'BES-001', to: 'ATL-001' },
  { type: 'originates', from: 'BES-002', to: 'ATL-001' },
  { type: 'originates', from: 'BES-003', to: 'ATL-001' },
  { type: 'originates', from: 'DEC-001', to: 'ATL-001' },
  { type: 'originates', from: 'RIS-002', to: 'ATL-001' },
];
