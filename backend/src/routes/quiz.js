import express from "express";
import { createQuestion, checkAnswer, computeProgression, getLevelRules, getGameModes } from "../services/quizService.js";

const router = express.Router();

router.get("/config", (_req, res) => {
  res.json({
    levels: getLevelRules(),
    modes: getGameModes()
  });
});

router.post("/question", (req, res) => {
  const level = req.body?.level ?? "A1";
  const mode = req.body?.mode;
  const verbGroups = req.body?.verbGroups;
  const question = createQuestion(level, mode, { verbGroups });

  if (!question) {
    return res.status(500).json({
      error: "AUCUNE_QUESTION_DISPONIBLE"
    });
  }

  return res.json(question);
});

router.post("/answer", (req, res) => {
  const { questionId, answer } = req.body ?? {};

  if (!questionId) {
    return res.status(400).json({ error: "questionId requis" });
  }

  const result = checkAnswer(questionId, answer);

  if (result.error === "QUESTION_EXPIREE") {
    return res.status(410).json(result);
  }

  return res.json(result);
});

router.post("/progress", (req, res) => {
  const level = req.body?.level ?? "A1";
  const history = Array.isArray(req.body?.history) ? req.body.history : [];

  const normalizedHistory = history.map((value) => Boolean(value));
  const progression = computeProgression(level, normalizedHistory);

  return res.json(progression);
});

export default router;
