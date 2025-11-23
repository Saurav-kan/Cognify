/**
 * Stress Test Script for NeuroFocus Study Tool
 * Gradually increases load to test architecture limits
 */

import { performance } from "perf_hooks";

interface TestConfig {
  baseUrl: string;
  rampUpDuration: number; // seconds
  maxConcurrentUsers: number;
  testDuration: number; // seconds
  endpoints: {
    explain: boolean;
    summarize: boolean;
  };
  explainTerm: string;
  summarizeText: string;
}

interface TestResult {
  endpoint: string;
  status: number;
  responseTime: number;
  timestamp: number;
  error?: string;
}

interface TestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50: number;
  p95: number;
  p99: number;
  errorsByStatus: Record<number, number>;
  errorsByType: Record<string, number>;
}

const defaultConfig: TestConfig = {
  baseUrl: process.env.TEST_BASE_URL || "http://localhost:3000",
  rampUpDuration: 60, // 1 minute ramp-up
  maxConcurrentUsers: 50,
  testDuration: 300, // 5 minutes total
  endpoints: {
    explain: true,
    summarize: true,
  },
  explainTerm: "cognition",
  summarizeText: "This is a test page about cognitive psychology. It discusses how the brain processes information, memory formation, and learning mechanisms. The content covers various theories including information processing models and neural plasticity.",
};

class StressTester {
  private config: TestConfig;
  private results: TestResult[] = [];
  private startTime: number = 0;
  private activeUsers: number = 0;
  private shouldStop: boolean = false;

  constructor(config: Partial<TestConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
  }

  async run(): Promise<void> {
    console.log("🚀 Starting Stress Test");
    console.log("=" .repeat(60));
    console.log(`Base URL: ${this.config.baseUrl}`);
    console.log(`Ramp-up Duration: ${this.config.rampUpDuration}s`);
    console.log(`Max Concurrent Users: ${this.config.maxConcurrentUsers}`);
    console.log(`Test Duration: ${this.config.testDuration}s`);
    console.log(`Endpoints: ${Object.entries(this.config.endpoints).filter(([_, enabled]) => enabled).map(([name]) => name).join(", ")}`);
    console.log("=" .repeat(60));
    console.log("");

    this.startTime = Date.now();
    const endTime = this.startTime + this.config.testDuration * 1000;

    // Start ramp-up phase
    const rampUpInterval = (this.config.rampUpDuration * 1000) / this.config.maxConcurrentUsers;
    let currentUsers = 0;

    const rampUpIntervalId = setInterval(() => {
      if (currentUsers < this.config.maxConcurrentUsers && Date.now() < endTime) {
        currentUsers++;
        this.activeUsers++;
        this.startUser(currentUsers);
      } else {
        clearInterval(rampUpIntervalId);
      }
    }, rampUpInterval);

    // Stop after test duration
    setTimeout(() => {
      this.shouldStop = true;
      clearInterval(rampUpIntervalId);
      console.log("\n⏹️  Stopping stress test...");
    }, this.config.testDuration * 1000);

    // Wait for all users to finish
    while (this.activeUsers > 0 || Date.now() < endTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (this.shouldStop && this.activeUsers === 0) break;
    }

    // Generate report
    this.generateReport();
  }

  private async startUser(userId: number): Promise<void> {
    const userLoop = async () => {
      while (!this.shouldStop) {
        try {
          if (this.config.endpoints.explain) {
            await this.testExplain();
          }
          if (this.config.endpoints.summarize) {
            await this.testSummarize();
          }
          // Small delay between requests
          await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));
        } catch (error) {
          console.error(`User ${userId} error:`, error);
        }
      }
      this.activeUsers--;
    };

    userLoop();
  }

  private async testExplain(): Promise<void> {
    const startTime = performance.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/api/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          term: this.config.explainTerm,
        }),
      });

      const responseTime = performance.now() - startTime;
      const status = response.status;

      // Read response body (stream)
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      }

      this.recordResult({
        endpoint: "explain",
        status,
        responseTime,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResult({
        endpoint: "explain",
        status: 0,
        responseTime,
        timestamp: Date.now(),
        error: error.message || "Unknown error",
      });
    }
  }

  private async testSummarize(): Promise<void> {
    const startTime = performance.now();
    try {
      const response = await fetch(`${this.config.baseUrl}/api/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageText: this.config.summarizeText,
          pageNumber: Math.floor(Math.random() * 100) + 1,
        }),
      });

      const responseTime = performance.now() - startTime;
      const status = response.status;

      // Read response body (stream)
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
        }
      }

      this.recordResult({
        endpoint: "summarize",
        status,
        responseTime,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      const responseTime = performance.now() - startTime;
      this.recordResult({
        endpoint: "summarize",
        status: 0,
        responseTime,
        timestamp: Date.now(),
        error: error.message || "Unknown error",
      });
    }
  }

  private recordResult(result: TestResult): void {
    this.results.push(result);
    const status = result.status === 200 ? "✅" : "❌";
    const endpoint = result.endpoint.padEnd(10);
    const time = result.responseTime.toFixed(0).padStart(6);
    process.stdout.write(`\r${status} ${endpoint} | ${time}ms | Total: ${this.results.length}`);
  }

  private generateReport(): void {
    console.log("\n\n" + "=".repeat(60));
    console.log("📊 STRESS TEST RESULTS");
    console.log("=".repeat(60));

    // Overall stats
    const overallStats = this.calculateStats(this.results);
    this.printStats("Overall", overallStats);

    // Per endpoint stats
    const explainResults = this.results.filter((r) => r.endpoint === "explain");
    const summarizeResults = this.results.filter((r) => r.endpoint === "summarize");

    if (explainResults.length > 0) {
      console.log("");
      this.printStats("Explain Endpoint", this.calculateStats(explainResults));
    }

    if (summarizeResults.length > 0) {
      console.log("");
      this.printStats("Summarize Endpoint", this.calculateStats(summarizeResults));
    }

    // Time-based analysis
    console.log("\n" + "=".repeat(60));
    console.log("📈 TIME-BASED ANALYSIS");
    console.log("=".repeat(60));
    this.printTimeBasedAnalysis();

    // Error analysis
    if (overallStats.failedRequests > 0) {
      console.log("\n" + "=".repeat(60));
      console.log("⚠️  ERROR ANALYSIS");
      console.log("=".repeat(60));
      console.log("Errors by Status Code:");
      Object.entries(overallStats.errorsByStatus).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });
      console.log("\nErrors by Type:");
      Object.entries(overallStats.errorsByType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
      });
    }

    // Recommendations
    console.log("\n" + "=".repeat(60));
    console.log("💡 RECOMMENDATIONS");
    console.log("=".repeat(60));
    this.printRecommendations(overallStats);
  }

  private calculateStats(results: TestResult[]): TestStats {
    if (results.length === 0) {
      return {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        minResponseTime: 0,
        maxResponseTime: 0,
        p50: 0,
        p95: 0,
        p99: 0,
        errorsByStatus: {},
        errorsByType: {},
      };
    }

    const successful = results.filter((r) => r.status === 200);
    const failed = results.filter((r) => r.status !== 200);
    const responseTimes = results.map((r) => r.responseTime).sort((a, b) => a - b);

    const errorsByStatus: Record<number, number> = {};
    const errorsByType: Record<string, number> = {};

    failed.forEach((r) => {
      errorsByStatus[r.status] = (errorsByStatus[r.status] || 0) + 1;
      if (r.error) {
        errorsByType[r.error] = (errorsByType[r.error] || 0) + 1;
      }
    });

    return {
      totalRequests: results.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      averageResponseTime: responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length,
      minResponseTime: responseTimes[0],
      maxResponseTime: responseTimes[responseTimes.length - 1],
      p50: responseTimes[Math.floor(responseTimes.length * 0.5)],
      p95: responseTimes[Math.floor(responseTimes.length * 0.95)],
      p99: responseTimes[Math.floor(responseTimes.length * 0.99)],
      errorsByStatus,
      errorsByType,
    };
  }

  private printStats(label: string, stats: TestStats): void {
    console.log(`\n${label}:`);
    console.log(`  Total Requests: ${stats.totalRequests}`);
    console.log(`  Successful: ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`  Failed: ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(2)}%)`);
    console.log(`  Response Times:`);
    console.log(`    Average: ${stats.averageResponseTime.toFixed(2)}ms`);
    console.log(`    Min: ${stats.minResponseTime.toFixed(2)}ms`);
    console.log(`    Max: ${stats.maxResponseTime.toFixed(2)}ms`);
    console.log(`    P50: ${stats.p50.toFixed(2)}ms`);
    console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
    console.log(`    P99: ${stats.p99.toFixed(2)}ms`);
  }

  private printTimeBasedAnalysis(): void {
    const timeWindows = 10;
    const windowSize = (this.config.testDuration * 1000) / timeWindows;
    const windows: Array<{ start: number; end: number; results: TestResult[] }> = [];

    for (let i = 0; i < timeWindows; i++) {
      const start = this.startTime + i * windowSize;
      const end = start + windowSize;
      windows.push({
        start,
        end,
        results: this.results.filter((r) => r.timestamp >= start && r.timestamp < end),
      });
    }

    windows.forEach((window, index) => {
      if (window.results.length > 0) {
        const stats = this.calculateStats(window.results);
        const timeRange = `${(index * windowSize / 1000).toFixed(0)}s - ${((index + 1) * windowSize / 1000).toFixed(0)}s`;
        console.log(`\nWindow ${timeRange}:`);
        console.log(`  Requests: ${stats.totalRequests}`);
        console.log(`  Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)}%`);
        console.log(`  Avg Response Time: ${stats.averageResponseTime.toFixed(2)}ms`);
      }
    });
  }

  private printRecommendations(stats: TestStats): void {
    const successRate = (stats.successfulRequests / stats.totalRequests) * 100;
    const avgResponseTime = stats.averageResponseTime;

    if (successRate < 95) {
      console.log("⚠️  Low success rate detected. Consider:");
      console.log("   - Checking rate limiting configuration");
      console.log("   - Verifying API keys are valid");
      console.log("   - Reviewing error logs");
    }

    if (avgResponseTime > 5000) {
      console.log("⚠️  High response times detected. Consider:");
      console.log("   - Enabling more aggressive caching");
      console.log("   - Using faster providers (Groq) for simple tasks");
      console.log("   - Optimizing prompts to reduce token usage");
    }

    if (stats.p95 > 10000) {
      console.log("⚠️  High P95 latency. Consider:");
      console.log("   - Implementing request queuing");
      console.log("   - Adding more fallback providers");
      console.log("   - Scaling infrastructure");
    }

    if (successRate >= 99 && avgResponseTime < 2000) {
      console.log("✅ System is performing well!");
      console.log("   - Consider increasing load to find breaking point");
    }
  }
}

// CLI interface
const args = process.argv.slice(2);
const config: Partial<TestConfig> = {};

args.forEach((arg, index) => {
  switch (arg) {
    case "--url":
      config.baseUrl = args[index + 1];
      break;
    case "--ramp-up":
      config.rampUpDuration = parseInt(args[index + 1]);
      break;
    case "--max-users":
      config.maxConcurrentUsers = parseInt(args[index + 1]);
      break;
    case "--duration":
      config.testDuration = parseInt(args[index + 1]);
      break;
    case "--explain-only":
      config.endpoints = { explain: true, summarize: false };
      break;
    case "--summarize-only":
      config.endpoints = { explain: false, summarize: true };
      break;
  }
});

const tester = new StressTester(config);
tester.run().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

