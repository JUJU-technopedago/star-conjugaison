import { A1_ESSENTIAL_VERBS } from "./a1Verbs.js";
import { A2_ESSENTIAL_VERBS } from "./a2Verbs.js";
import { B1_ESSENTIAL_VERBS } from "./b1Verbs.js";
import { B2_ESSENTIAL_VERBS } from "./b2Verbs.js";
import { C1_ESSENTIAL_VERBS } from "./c1Verbs.js";

const whitelist = new Set([
  ...A1_ESSENTIAL_VERBS,
  ...A2_ESSENTIAL_VERBS,
  ...B1_ESSENTIAL_VERBS,
  ...B2_ESSENTIAL_VERBS,
  ...C1_ESSENTIAL_VERBS
]);

export const GLOBAL_ALLOWED_VERBS = Array.from(whitelist);