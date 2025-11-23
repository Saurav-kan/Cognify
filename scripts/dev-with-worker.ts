/**
 * Development Script with Auto-Running Worker
 * Runs Next.js dev server and automatically processes queue every 5 seconds
 * Usage: tsx scripts/dev-with-worker.ts
 */

import { spawn } from "child_process";
import { runWorker } from "../backend/workers/llm-worker";

console.log("[Dev Worker] Starting development server with auto-worker...");

// Start Next.js dev server
const devServer = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  shell: true,
});

// Run worker every 5 seconds
const workerInterval = setInterval(async () => {
  try {
    await runWorker();
  } catch (error) {
    // Silently fail - don't spam console
  }
}, 5000);

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("\n[Dev Worker] Shutting down...");
  clearInterval(workerInterval);
  devServer.kill();
  process.exit(0);
});

process.on("SIGTERM", () => {
  clearInterval(workerInterval);
  devServer.kill();
  process.exit(0);
});

