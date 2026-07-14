import { task, wait, logger } from "@trigger.dev/sdk";
import { spawn } from "node:child_process";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface CropImagePayload {
  imageUrl: string;
  x: number; // 0-100
  y: number; // 0-100
  width: number; // 0-100
  height: number; // 0-100
}

export interface CropImageResult {
  outputUrl: string;
}

function clampPct(n: number, fallback: number): number {
  const v = typeof n === "number" && !Number.isNaN(n) ? n : fallback;
  return Math.min(100, Math.max(0, v));
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`))
    );
  });
}

/**
 * Crop an image by percentage via FFmpeg.
 * MANDATORY: this task awaits at least 30 seconds before returning.
 */
export const cropImageTask = task({
  id: "crop-image",
  maxDuration: 120,
  run: async (payload: CropImagePayload): Promise<CropImageResult> => {
    const { imageUrl } = payload;
    if (!imageUrl) throw new Error("Crop Image: no input image provided.");

    const x = clampPct(payload.x, 0);
    const y = clampPct(payload.y, 0);
    const width = clampPct(payload.width, 100);
    const height = clampPct(payload.height, 100);

    // ── MANDATORY 30s+ artificial delay (hard requirement) ──
    logger.info("Crop Image: starting mandatory 30s wait");
    await wait.for({ seconds: 31 });
    logger.info("Crop Image: wait complete, processing");

    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`Failed to fetch input image (${res.status}).`);
    const inputBuf = Buffer.from(await res.arrayBuffer());

    const dir = await mkdtemp(join(tmpdir(), "crop-"));
    const inPath = join(dir, "in.img");
    const outPath = join(dir, "out.png");

    try {
      await writeFile(inPath, inputBuf);

      // Clamp the crop region to the image bounds: the rectangle starts at
      // (x%, y%) and can't extend past the right/bottom edge, so the effective
      // width/height is capped at the space remaining from the offset.
      const cropW = Math.max(1, Math.min(width, 100 - x));
      const cropH = Math.max(1, Math.min(height, 100 - y));
      const cropExpr = `crop=iw*${cropW}/100:ih*${cropH}/100:iw*${x}/100:ih*${y}/100`;
      await runFfmpeg(["-y", "-i", inPath, "-vf", cropExpr, outPath]);

      const outBuf = await readFile(outPath);
      const { uploadBuffer } = await import("@/lib/transloadit-server");
      const outputUrl = await uploadBuffer(outBuf, "cropped.png");
      return { outputUrl };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
});
