export const LEVEL_RULES = {
  A1: {
    pools: [{ mood: 'indicatif', tense: 'présent' }],
    successRateToPromote: 0.8,
    minQuestions: 10
  },
  A2: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'indicatif', tense: 'imparfait' }
    ],
    successRateToPromote: 0.8,
    minQuestions: 12
  },
  B1: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur simple' },
      { mood: 'indicatif', tense: 'plus-que-parfait' },
      { mood: 'conditionnel', tense: 'présent' },
      { mood: 'subjonctif', tense: 'présent' }
    ],
    successRateToPromote: 0.82,
    minQuestions: 14
  },
  B2: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur antérieur' },
      { mood: 'indicatif', tense: 'plus-que-parfait' },
      { mood: 'conditionnel', tense: 'présent' },
      { mood: 'conditionnel', tense: 'passé 1ère forme' },
      { mood: 'subjonctif', tense: 'présent' },
      { mood: 'subjonctif', tense: 'passé' }
    ],
    successRateToPromote: 0.84,
    minQuestions: 16
  },
  C1: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'plus-que-parfait' },
      { mood: 'indicatif', tense: 'passé simple' },
      { mood: 'indicatif', tense: 'passé antérieur' },
      { mood: 'conditionnel', tense: 'présent' },
      { mood: 'conditionnel', tense: 'passé 1ère forme' },
      { mood: 'subjonctif', tense: 'présent' },
      { mood: 'subjonctif', tense: 'passé' }
    ],
    successRateToPromote: 0.86,
    minQuestions: 18
  }
};
