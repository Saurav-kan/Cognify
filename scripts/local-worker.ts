import * as dotenv from "dotenv";
import * as path from "path";

// 1. LOAD ENV VARS BEFORE ANYTHING ELSE
// This ensures 'getRedisClient' inside the workers can actually see the URL
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

// 2. Import the worker logic
// We must import this AFTER dotenv.config, or the imports might fail
import { runWorker } from "../backend/workers/llm-worker"; 

async function main() {
  console.log("[Local Worker] Starting queue worker...");
  
  // Debug: Confirm Env Vars are actually loaded
  if (!process.env.UPSTASH_REDIS_REST_URL) {
     console.error("❌ CRITICAL ERROR: Environment variables are missing!");
     console.error("   - Check that .env.local exists in the root folder");
     console.error("   - Make sure you are running this from the project root");
     process.exit(1);
  } else {
     console.log("✅ Environment variables loaded successfully.");
  }

  // 3. Run the worker loop
  // You can wrap this in a while(true) loop if you want it to run forever locally
  console.log("🔄 Polling for jobs...");
  await runWorker();
}

main().catch((err) => {
  console.error("Fatal Worker Error:", err);
  process.exit(1);
});