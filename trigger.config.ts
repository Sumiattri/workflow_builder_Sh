import { defineConfig } from "@trigger.dev/sdk";
import { ffmpeg } from "@trigger.dev/build/extensions/core";
import { prismaExtension } from "@trigger.dev/build/extensions/prisma";

export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? "proj_REPLACE_ME",
  runtime: "node",
  logLevel: "info",
  maxDuration: 300, // 5 min ceiling - Crop Image alone waits 30s+
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
    },
  },
  dirs: ["./src/trigger"],
  build: {
    extensions: [
      // Generate Prisma Client inside Trigger's Linux build image.
      prismaExtension({
        mode: "legacy",
        schema: "./prisma/schema.prisma",
      }),
      // FFmpeg binary available inside the Crop Image task.
      ffmpeg(),
    ],
    external: ["transloadit"],
  },
});
