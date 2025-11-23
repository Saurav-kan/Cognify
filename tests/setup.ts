/**
 * Jest setup file
 * Loads environment variables for tests
 */

// Load environment variables from .env.local if it exists
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(__dirname, "../.env.local") });

// Set test timeout
jest.setTimeout(30000);

