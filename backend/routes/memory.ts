import { Router, Request, Response } from "express";
import {
  addMemory,
  recent,
  semantic,
  keyword,
} from "../services/memoryService";

const router = Router();

router.post("/add", async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      content,
      type = "conversation",
      sessionId,
      metadata,
    } = req.body || {};
    if (!content || typeof content !== "string") {
      res.status(400).json({ error: "content(string) required" });
      return;
    }
    const r = await addMemory(content, type, sessionId, metadata);
    res.json({ ok: true, ...r });
  } catch (e: any) {
    console.error("[Memory/add]", e);
    res
      .status(500)
      .json({ error: "add-failed", details: String(e?.message || e) });
  }
});

router.get("/recent", (req: Request, res: Response): void => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit ?? 20)));
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;
    res.json({ ok: true, items: recent(limit, sessionId) });
  } catch (e: any) {
    console.error("[Memory/recent]", e);
    res
      .status(500)
      .json({ error: "recent-failed", details: String(e?.message || e) });
  }
});

router.get("/search", async (req: Request, res: Response): Promise<void> => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.status(400).json({ error: "q required" });
      return;
    }
    const k = Math.max(1, Math.min(50, Number(req.query.k ?? 8)));
    const sessionId =
      typeof req.query.sessionId === "string" ? req.query.sessionId : undefined;

    const items = await semantic(q, k, sessionId);
    res.json({
      ok: true,
      items: items.length ? items : keyword(q, k, sessionId),
    });
  } catch (e: any) {
    console.error("[Memory/search]", e);
    res
      .status(500)
      .json({ error: "search-failed", details: String(e?.message || e) });
  }
});

export default router;
