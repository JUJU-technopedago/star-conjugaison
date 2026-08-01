export const LEVEL_RULES = {
  A1: {
    pools: [{ mood: 'indicatif', tense: 'présent' }],
    successRateToPromote: 0.8,
    minQuestions: 10
  },
  A2: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur simple' }
    ],
    successRateToPromote: 0.8,
    minQuestions: 12
  },
  B1: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur simple' },
      { mood: 'indicatif', tense: 'passé composé' }
    ],
    successRateToPromote: 0.82,
    minQuestions: 14
  },
  B2: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur simple' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'conditionnel', tense: 'présent' },
      { mood: 'subjonctif', tense: 'présent' }
    ],
    successRateToPromote: 0.84,
    minQuestions: 16
  },
  C1: {
    pools: [
      { mood: 'indicatif', tense: 'présent' },
      { mood: 'indicatif', tense: 'imparfait' },
      { mood: 'indicatif', tense: 'futur simple' },
      { mood: 'indicatif', tense: 'passé composé' },
      { mood: 'indicatif', tense: 'passé simple' },
      { mood: 'conditionnel', tense: 'présent' },
      { mood: 'subjonctif', tense: 'présent' }
    ],
    successRateToPromote: 0.86,
    minQuestions: 18
  }
};
