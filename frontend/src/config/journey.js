export const TOTAL_GAMES = 200;
export const VERBS_PER_GAME = 10;

const BOARD_COLUMNS = 5;
const CELL_WIDTH = 48;
const CELL_HEIGHT = 42;
const BOARD_PADDING = 10;

export function createDefaultJourneyProgress() {
  return {
    currentGame: 1,
    completedGames: 0,
    currentGameAnswers: 0,
    currentGameCorrect: 0,
    gameStates: Array.from({ length: TOTAL_GAMES }, (_, index) => ({
      index: index + 1,
      unlocked: index === 0,
      completed: false,
      correct: 0,
      attempts: 0
    }))
  };
}

export function clampGameNumber(gameNumber) {
  return Math.min(Math.max(gameNumber, 1), TOTAL_GAMES);
}

export function getGameState(progress, gameNumber) {
  const index = clampGameNumber(gameNumber) - 1;
  return progress.gameStates[index];
}

export function getNextGameNumber(gameNumber) {
  const next = gameNumber + 1;
  return next <= TOTAL_GAMES ? next : TOTAL_GAMES;
}

export function getJourneyCellLayout(gameNumber) {
  const index = clampGameNumber(gameNumber) - 1;
  const row = Math.floor(index / BOARD_COLUMNS);
  const columnInRow = index % BOARD_COLUMNS;
  const serpentineColumn = row % 2 === 0 ? columnInRow : BOARD_COLUMNS - 1 - columnInRow;

  const x = BOARD_PADDING + serpentineColumn * CELL_WIDTH + (row % 3 === 0 ? 6 : 0);
  const y = BOARD_PADDING + row * CELL_HEIGHT + (columnInRow % 2 === 0 ? 3 : 0);

  const isStreet = columnInRow === 2;
  const isCorner = columnInRow === 0 || columnInRow === BOARD_COLUMNS - 1;

  return {
    x,
    y,
    row,
    column: serpentineColumn,
    street: isStreet,
    corner: isCorner,
    width: CELL_WIDTH - 6,
    height: CELL_HEIGHT - 8
  };
}

export function getJourneyBoardSize() {
  const rows = Math.ceil(TOTAL_GAMES / BOARD_COLUMNS);
  return {
    width: BOARD_PADDING * 2 + BOARD_COLUMNS * CELL_WIDTH,
    height: BOARD_PADDING * 2 + rows * CELL_HEIGHT
  };
}
