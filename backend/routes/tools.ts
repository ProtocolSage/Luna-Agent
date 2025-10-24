import { Router, Request, Response } from "express";
import { executeTool } from "../services/toolExecutor";

const router = Router();

router.post("/execute", async (req: Request, res: Response): Promise<void> => {
  try {
    const { tool, input, sessionId } = req.body || {};
    if (!tool || typeof tool !== "string") {
      res.status(400).json({ error: "tool(string) required" });
      return;
    }
    const out = await executeTool(tool, input, sessionId);
    if (!out.ok) {
      res.status(500).json(out);
      return;
    }
    res.json(out);
  } catch (e: any) {
    console.error("[Tools/execute]", e);
    res
      .status(500)
      .json({ error: "execute-failed", details: String(e?.message || e) });
  }
});

export default router;
