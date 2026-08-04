import { detectVerbGroup } from './verbGroups.js';

const A1_VERBS = [
  'aimer',
  'habiter',
  'parler',
  'ecouter',
  'regarder',
  'travailler',
  'etudier',
  'apprendre',
  'demander',
  'donner',
  'acheter',
  'payer',
  'chercher',
  'trouver',
  'arriver',
  'rester',
  'manger',
  'boire',
  'porter',
  'jouer',
  'finir',
  'choisir',
  'reussir',
  'grandir',
  'grossir',
  'maigrir',
  'remplir',
  'etre',
  'avoir',
  'aller',
  'faire',
  'pouvoir',
  'vouloir',
  'devoir',
  'savoir',
  'prendre',
  'venir',
  'dire',
  'lire',
  'ecrire',
  'voir',
  'mettre',
  'partir',
  'sortir',
  'dormir',
  'connaitre'
];

const group1verbs = A1_VERBS.filter((verb) => detectVerbGroup(verb) === 'group1');
const group2verbs = A1_VERBS.filter((verb) => detectVerbGroup(verb) === 'group2');
const group3verbs = A1_VERBS.filter((verb) => detectVerbGroup(verb) === 'group3');

export { group1verbs, group2verbs, group3verbs };
