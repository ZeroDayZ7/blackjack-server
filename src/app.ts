import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";

import { env } from "./config/env.js";
import apiRouter from "./routes/api.js";
import { globalLimiter } from "./middleware/globalLimiter.js";

const app = express();
app.disable("x-powered-by");

app.use(helmet());
app.use(
  cors({
    origin: "*",
    credentials: false,
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(globalLimiter);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "OK",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.use("/api", apiRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Not found",
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);

  const message = err instanceof Error ? err.message : "Internal Server Error";

  res.status(500).json({
    status: "error",
    message,
    ...(process.env.NODE_ENV !== "production" && {
      stack: err instanceof Error ? err.stack : undefined,
    }),
  });
});

export default app;
