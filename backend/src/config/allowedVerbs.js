import {
  group1verbs as a1Group1Verbs,
  group2verbs as a1Group2Verbs,
  group3verbs as a1Group3Verbs
} from "./a1Verbs.js";
import {
  group1verbs as a2Group1Verbs,
  group2verbs as a2Group2Verbs,
  group3verbs as a2Group3Verbs
} from "./a2Verbs.js";
import {
  group1verbs as b1Group1Verbs,
  group2verbs as b1Group2Verbs,
  group3verbs as b1Group3Verbs
} from "./b1Verbs.js";
import {
  group1verbs as b2Group1Verbs,
  group2verbs as b2Group2Verbs,
  group3verbs as b2Group3Verbs
} from "./b2Verbs.js";
import {
  group1verbs as c1Group1Verbs,
  group2verbs as c1Group2Verbs,
  group3verbs as c1Group3Verbs
} from "./c1Verbs.js";

const whitelist = new Set([
  ...a1Group1Verbs,
  ...a1Group2Verbs,
  ...a1Group3Verbs,
  ...a2Group1Verbs,
  ...a2Group2Verbs,
  ...a2Group3Verbs,
  ...b1Group1Verbs,
  ...b1Group2Verbs,
  ...b1Group3Verbs,
  ...b2Group1Verbs,
  ...b2Group2Verbs,
  ...b2Group3Verbs,
  ...c1Group1Verbs,
  ...c1Group2Verbs,
  ...c1Group3Verbs
]);

export const GLOBAL_ALLOWED_VERBS = Array.from(whitelist);