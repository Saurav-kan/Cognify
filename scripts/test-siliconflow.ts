/**
 * Test SiliconFlow API Key
 * Run with: tsx scripts/test-siliconflow.ts
 */

import * as dotenv from "dotenv";
import * as path from "path";
import OpenAI from "openai";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function testSiliconFlow() {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  
  if (!apiKey) {
    console.error("❌ SILICONFLOW_API_KEY is not set in environment variables");
    process.exit(1);
  }

  console.log("🔑 API Key found:");
  console.log(`   Format: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`   Length: ${apiKey.length} characters`);
  console.log(`   Starts with 'sk-': ${apiKey.startsWith("sk-")}`);
  console.log("");

  const client = new OpenAI({
    baseURL: "https://api.siliconflow.com/v1",
    apiKey: apiKey,
  });

  console.log("📡 Testing API connection...");
  console.log(`   Base URL: https://api.siliconflow.com/v1`);
  console.log(`   Model: tencent/Hunyuan-MT-7B`);
  console.log("");

  try {
    const response = await client.chat.completions.create({
      model: "tencent/Hunyuan-MT-7B",
      messages: [
        { role: "user", content: "Say 'Hello' in one word." }
      ],
      max_tokens: 10,
      stream: false, // Use non-streaming for easier testing
    });

    console.log("✅ SUCCESS! API key is working correctly.");
    console.log("");
    console.log("Response:", response.choices[0]?.message?.content || "No content");
    console.log("");
    console.log("Full response object:");
    console.log(JSON.stringify(response, null, 2));

  } catch (error: any) {
    console.error("❌ FAILED! API key test failed.");
    console.error("");
    console.error("Error details:");
    console.error(`   Status: ${error?.status || "N/A"}`);
    console.error(`   Code: ${error?.code || "N/A"}`);
    console.error(`   Type: ${error?.type || "N/A"}`);
    console.error(`   Message: ${error?.message || "N/A"}`);
    
    if (error?.response) {
      console.error(`   Response status: ${error.response.status || "N/A"}`);
      console.error(`   Response headers:`, error.response.headers || "N/A");
      
      try {
        const responseData = await error.response.json?.() || error.response.data;
        console.error(`   Response body:`, JSON.stringify(responseData, null, 2));
      } catch (e) {
        console.error(`   Response body: Could not parse`);
      }
    }

    console.error("");
    console.error("Possible issues:");
    console.error("   1. API key is incorrect or expired");
    console.error("   2. API key doesn't have access to model 'tencent/Hunyuan-MT-7B'");
    console.error("   3. IP address is restricted (check SiliconFlow dashboard)");
    console.error("   4. API key has insufficient permissions");
    console.error("");
    console.error("Next steps:");
    console.error("   1. Verify API key in SiliconFlow dashboard: https://siliconflow.cn/");
    console.error("   2. Check if model 'tencent/Hunyuan-MT-7B' is available for your account");
    console.error("   3. Check IP restrictions in API key settings");
    console.error("   4. Try regenerating the API key");

    process.exit(1);
  }
}

testSiliconFlow().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

