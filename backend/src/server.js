import express from "express";
import cors from "cors";
import quizRoutes from "./routes/quiz.js";
import { conjugationService } from "./services/conjugationService.js";

const PORT = process.env.PORT || 3001;

conjugationService.load();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    stats: conjugationService.getStats()
  });
});

app.use("/api/quiz", quizRoutes);

app.listen(PORT, () => {
  const stats = conjugationService.getStats();
  console.log(`Backend démarré sur http://localhost:${PORT} avec ${stats.verbs} verbes.`);
});
