"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";

interface ActivityHeatMapProps {
  adminSecret: string | null;
}

interface DayData {
  date: string;
  count: number;
  level: number; // 0-4 for intensity levels
}

export function ActivityHeatMap({ adminSecret }: ActivityHeatMapProps) {
  const [activityData, setActivityData] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await fetch(
          "/api/admin/analytics?type=daily-activity&days=365",
          {
            headers: adminSecret ? { Authorization: `Bearer ${adminSecret}` } : {},
          }
        );

        if (!response.ok) {
          throw new Error("Failed to fetch activity data");
        }

        const data = await response.json();
        setActivityData(data);
      } catch (error) {
        console.error("Error fetching activity data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchActivity();
    // Refresh every 5 minutes
    const interval = setInterval(fetchActivity, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [adminSecret]);

  // Generate calendar data
  const generateCalendarData = (): DayData[] => {
    const days: DayData[] = [];
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364); // Last 365 days

    // Find max count for normalization
    const maxCount = Math.max(...Object.values(activityData), 1);

    // Generate data for each day
    for (let i = 0; i < 365; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const count = activityData[dateStr] || 0;
      
      // Calculate intensity level (0-4)
      const level = maxCount > 0 ? Math.min(4, Math.floor((count / maxCount) * 4)) : 0;

      days.push({
        date: dateStr,
        count,
        level,
      });
    }

    return days;
  };

  const calendarData = generateCalendarData();
  const maxCount = Math.max(...calendarData.map((d) => d.count), 1);

  // Group days by week (starting from the first day of the first week)
  const weeks: (DayData | null)[][] = [];
  const firstDate = new Date(calendarData[0].date);
  const firstDayOfWeek = firstDate.getDay(); // 0 = Sunday, 6 = Saturday
  
  // Add empty days at the start if needed to align with Sunday
  const alignedData: (DayData | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) {
    alignedData.push(null);
  }
  alignedData.push(...calendarData);
  
  // Group into weeks (keep nulls for alignment)
  for (let i = 0; i < alignedData.length; i += 7) {
    weeks.push(alignedData.slice(i, i + 7));
  }

  // Get color based on level
  const getColor = (level: number): string => {
    const colors = [
      "bg-muted", // 0 - no activity
      "bg-green-100 dark:bg-green-900/30", // 1 - low
      "bg-green-300 dark:bg-green-800/50", // 2 - medium-low
      "bg-green-500 dark:bg-green-700/70", // 3 - medium-high
      "bg-green-700 dark:bg-green-600", // 4 - high
    ];
    return colors[level] || colors[0];
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Activity Heat Map
          </CardTitle>
          <CardDescription>User activity over the last year</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-64 items-center justify-center">
            <div className="text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          Activity Heat Map
        </CardTitle>
        <CardDescription>
          User activity over the last year • {maxCount} max visitors in a day
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Calendar Grid */}
          <div className="overflow-x-auto">
            <div className="flex gap-1 min-w-max">
              {weeks.map((week, weekIndex) => (
                <div key={weekIndex} className="flex flex-col gap-1">
                  {week.map((day, dayIndex) => {
                    if (!day) {
                      return <div key={dayIndex} className="h-3 w-3" />;
                    }
                    const isToday =
                      day.date === new Date().toISOString().split("T")[0];
                    return (
                      <div
                        key={`${weekIndex}-${dayIndex}`}
                        className={`h-3 w-3 rounded-sm cursor-pointer transition-all hover:scale-125 hover:ring-2 hover:ring-primary ${
                          isToday ? "ring-2 ring-primary" : ""
                        } ${getColor(day.level)}`}
                        onMouseEnter={() => setSelectedDay(day)}
                        onMouseLeave={() => setSelectedDay(null)}
                        title={`${formatDate(day.date)}: ${day.count} unique visitor${day.count !== 1 ? "s" : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Less</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`h-3 w-3 rounded-sm ${getColor(level)}`}
                  />
                ))}
              </div>
              <span className="text-muted-foreground">More</span>
            </div>
            {selectedDay && (
              <div className="text-sm font-medium">
                {formatDate(selectedDay.date)}: {selectedDay.count} visitor
                {selectedDay.count !== 1 ? "s" : ""}
              </div>
            )}
          </div>

          {/* Month labels - show at start of each month */}
          <div className="flex gap-1 text-xs text-muted-foreground min-w-max">
            {weeks.map((week, weekIndex) => {
              // Find first non-null day in week
              const firstDay = week.find((d) => d !== null);
              if (!firstDay) return <div key={weekIndex} className="w-[8px]" />;
              
              const date = new Date(firstDay.date);
              const isFirstWeekOfMonth = date.getDate() <= 7;
              
              if (isFirstWeekOfMonth) {
                return (
                  <div key={weekIndex} className="w-[8px] text-left">
                    {date.toLocaleDateString("en-US", { month: "short" })}
                  </div>
                );
              }
              return <div key={weekIndex} className="w-[8px]" />;
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
