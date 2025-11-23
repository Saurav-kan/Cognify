"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";

interface SystemStatus {
  queueAvailable: boolean;
  status: "green" | "yellow" | "red";
  queue: {
    waiting: number;
    active: number;
    estimatedWaitTimeSeconds: number;
  };
  utilization: number;
  timestamp: number;
}

export function AppUsageBar() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch("/api/system/status");
        if (response.ok) {
          const data = await response.json();
          setStatus(data);
        }
      } catch (error) {
        console.error("[AppUsageBar] Error fetching status:", error);
      } finally {
        setIsLoading(false);
      }
    };

    // Fetch immediately
    fetchStatus();

    // Poll every 10 seconds
    const interval = setInterval(fetchStatus, 10000);

    return () => clearInterval(interval);
  }, []);

  if (isLoading || !status) {
    return null; // Don't show anything while loading
  }

  if (!status.queueAvailable) {
    return null; // Don't show if queue not available
  }

  const getStatusColor = () => {
    switch (status.status) {
      case "green":
        return "bg-green-500";
      case "yellow":
        return "bg-yellow-500";
      case "red":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getStatusText = () => {
    switch (status.status) {
      case "green":
        return "Low Load";
      case "yellow":
        return "Medium Load";
      case "red":
        return "High Load";
      default:
        return "Unknown";
    }
  };

  const formatWaitTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg border bg-card px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${getStatusColor()}`}
            title={getStatusText()}
            aria-label={`System status: ${getStatusText()}`}
          />
          <span className="text-xs font-medium text-foreground">
            {getStatusText()}
          </span>
        </div>
      </div>
      {status.queue.waiting > 0 && (
        <div className="border-l border-border pl-2 text-xs text-muted-foreground">
          <span>
            {status.queue.waiting} in queue
            {status.queue.estimatedWaitTimeSeconds > 0 && (
              <> (~{formatWaitTime(status.queue.estimatedWaitTimeSeconds)})</>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

