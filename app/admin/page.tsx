"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Activity,
  Users,
  Zap,
  Database,
  TrendingUp,
  BarChart3,
} from "lucide-react";

interface AnalyticsSummary {
  activeUsers: number;
  uniqueVisitors: number;
  totalUniqueUsers: number;
  totalApiCalls: number;
  cacheHitRate: number;
  totalTokensUsed: number;
  ttsUsageCount: number;
  ttsUsagePercentage: number;
  topProviders: Array<{ provider: string; calls: number }>;
  topEndpoints: Array<{ endpoint: string; calls: number }>;
  queue: {
    waiting: number;
    active: number;
  };
  providerUtilization: Record<
    string,
    {
      rpm: number;
      rpmLimit: number;
      tpm: number;
      tpmLimit: number;
      utilization: number;
    }
  >;
}

export default function AdminPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adminSecret, setAdminSecret] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    try {
      // In development, try to get secret from localStorage or prompt once
      let secret = adminSecret;
      if (!secret && typeof window !== "undefined") {
        const stored = localStorage.getItem("admin_secret");
        if (stored) {
          secret = stored;
          setAdminSecret(stored);
        } else {
          const input = prompt(
            "Enter admin secret (or leave empty if not set):"
          );
          if (input !== null) {
            secret = input;
            setAdminSecret(input);
            if (input) {
              localStorage.setItem("admin_secret", input);
            }
          }
        }
      }

      const response = await fetch("/api/admin/analytics?type=summary", {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
      });

      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }

      const data = await response.json();
      setSummary(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <Activity className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <button
              onClick={fetchAnalytics}
              className="w-full rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!summary) {
    return null;
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Admin Dashboard</h1>
          <p className="mt-2 text-muted-foreground">
            Real-time analytics and usage statistics
          </p>
        </div>

        {/* Key Metrics */}
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.activeUsers}</div>
              <p className="text-xs text-muted-foreground">Currently online</p>
            </CardContent>

          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Unique Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(summary.totalUniqueUsers)}
              </div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">API Calls</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(summary.totalApiCalls)}
              </div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Cache Hit Rate
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(summary.cacheHitRate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Cache efficiency</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatNumber(summary.totalTokensUsed)}
              </div>
              <p className="text-xs text-muted-foreground">Last 7 days</p>
            </CardContent>
          </Card>
        </div>

        {/* TTS Usage */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              TTS Usage
            </CardTitle>
            <CardDescription>Text-to-Speech feature adoption</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
              <div>
                <div className="text-2xl font-bold">
                  {summary.ttsUsageCount}
                </div>
                <p className="text-sm text-muted-foreground">Total Uses</p>
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {summary.ttsUsagePercentage.toFixed(1)}%
                </div>
                <p className="text-sm text-muted-foreground">User Adoption</p>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.activeUsers}</div>
                <p className="text-sm text-muted-foreground">Active Users</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue Status */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Queue Status</CardTitle>
            <CardDescription>Current job queue statistics</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-2xl font-bold">
                  {summary.queue.waiting}
                </div>
                <p className="text-sm text-muted-foreground">Jobs Waiting</p>
              </div>
              <div>
                <div className="text-2xl font-bold">{summary.queue.active}</div>
                <p className="text-sm text-muted-foreground">Jobs Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Providers */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Top API Providers</CardTitle>
            <CardDescription>Most used LLM providers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summary.topProviders.map((item, index) => {
                const utilization =
                  summary.providerUtilization[item.provider]?.utilization || 0;
                return (
                  <div key={item.provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">
                        {item.provider}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formatNumber(item.calls)} calls
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${utilization * 100}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(utilization * 100).toFixed(1)}% utilization
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Top Endpoints */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Top API Endpoints</CardTitle>
            <CardDescription>Most called API endpoints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary.topEndpoints.map((item) => (
                <div
                  key={item.endpoint}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <span className="font-mono text-sm">{item.endpoint}</span>
                  <span className="font-medium">
                    {formatNumber(item.calls)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Provider Utilization */}
        <Card>
          <CardHeader>
            <CardTitle>Provider Utilization</CardTitle>
            <CardDescription>Rate limit usage by provider</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(summary.providerUtilization).map(
                ([provider, stats]) => (
                  <div key={provider} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium capitalize">{provider}</span>
                      <span className="text-sm text-muted-foreground">
                        {stats.rpm}/{stats.rpmLimit} RPM
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${stats.utilization * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {formatNumber(stats.tpm)}/{formatNumber(stats.tpmLimit)}{" "}
                        TPM
                      </span>
                      <span>{(stats.utilization * 100).toFixed(1)}%</span>
                    </div>
                  </div>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
