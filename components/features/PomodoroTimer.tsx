"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Play, Pause, RotateCcw, Coffee, SkipForward } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function PomodoroTimer() {
  const {
    pomodoroEnabled,
    pomodoroWorkMinutes,
    pomodoroBreakMinutes,
    pomodoroTimeRemaining,
    pomodoroIsBreak,
    togglePomodoro,
    setPomodoroTimeRemaining,
    setPomodoroIsBreak,
    setPomodoroWorkMinutes,
    setPomodoroBreakMinutes,
  } = useAppStore();

  const [isRunning, setIsRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Timer countdown effect
  useEffect(() => {
    if (!pomodoroEnabled || !isRunning) return;

    const interval = setInterval(() => {
      setPomodoroTimeRemaining((prev) => {
        if (prev <= 1) {
          // Timer finished - switch to break or work
          setIsRunning(false);
          
          // Use current state values to determine next phase
          const currentIsBreak = pomodoroIsBreak;
          const newIsBreak = !currentIsBreak;
          
          // Set the new phase
          setPomodoroIsBreak(newIsBreak);
          
          // Show notification
          if (typeof window !== "undefined" && "Notification" in window) {
            if (Notification.permission === "granted") {
              new Notification(
                newIsBreak ? "Break Time! ☕" : "Back to Work! 💪",
                {
                  body: newIsBreak
                    ? "Take a well-deserved break!"
                    : "Time to focus again!",
                  icon: "/favicon.ico",
                }
              );
            }
          }

          // Return time for next phase
          return newIsBreak
            ? pomodoroBreakMinutes * 60
            : pomodoroWorkMinutes * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [
    pomodoroEnabled,
    isRunning,
    pomodoroIsBreak,
    pomodoroWorkMinutes,
    pomodoroBreakMinutes,
    setPomodoroTimeRemaining,
    setPomodoroIsBreak,
  ]);

  const handleStartPause = () => {
    if (!pomodoroEnabled) {
      togglePomodoro();
    }
    setIsRunning(!isRunning);
  };

  const handleReset = () => {
    setIsRunning(false);
    setPomodoroTimeRemaining(
      pomodoroIsBreak ? pomodoroBreakMinutes * 60 : pomodoroWorkMinutes * 60
    );
  };

  const handleSkip = () => {
    setIsRunning(false);
    const newIsBreak = !pomodoroIsBreak;
    setPomodoroIsBreak(newIsBreak);
    setPomodoroTimeRemaining(
      newIsBreak ? pomodoroBreakMinutes * 60 : pomodoroWorkMinutes * 60
    );
  };

  const progress = pomodoroIsBreak
    ? (pomodoroTimeRemaining / (pomodoroBreakMinutes * 60)) * 100
    : (pomodoroTimeRemaining / (pomodoroWorkMinutes * 60)) * 100;

  // Request notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }
    }
  }, []);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Pomodoro Timer</CardTitle>
            <CardDescription>
              {pomodoroIsBreak ? "Break Time ☕" : "Focus Time 💪"}
            </CardDescription>
          </div>
          <Switch
            checked={pomodoroEnabled}
            onCheckedChange={(checked) => {
              if (checked) {
                togglePomodoro();
              } else {
                setIsRunning(false);
                togglePomodoro();
              }
            }}
            aria-label="Enable Pomodoro timer"
          />
        </div>
      </CardHeader>
      {pomodoroEnabled && (
        <CardContent className="space-y-4">
          {/* Timer Display */}
          <div className="relative flex items-center justify-center">
            <div className="relative">
              {/* Circular Progress */}
              <svg className="h-32 w-32 -rotate-90 transform">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  className="text-muted"
                />
                <motion.circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 56}`}
                  strokeDashoffset={`${2 * Math.PI * 56 * (1 - progress / 100)}`}
                  className={pomodoroIsBreak ? "text-green-500" : "text-blue-500"}
                  initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - progress / 100) }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div
                    className={`text-2xl font-bold ${
                      pomodoroIsBreak ? "text-green-500" : "text-blue-500"
                    }`}
                  >
                    {formatTime(pomodoroTimeRemaining)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {pomodoroIsBreak ? "Break" : "Focus"}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleStartPause}
              aria-label={isRunning ? "Pause timer" : "Start timer"}
            >
              {isRunning ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              aria-label="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
            >
              Settings
            </Button>
          </div>

          {/* Settings */}
          <AnimatePresence>
            {showSettings && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 border-t pt-3"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="work-minutes">Work (minutes)</Label>
                    <Input
                      id="work-minutes"
                      type="number"
                      min="1"
                      max="60"
                      value={pomodoroWorkMinutes}
                      onChange={(e) =>
                        setPomodoroWorkMinutes(parseInt(e.target.value) || 25)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="break-minutes">Break (minutes)</Label>
                    <Input
                      id="break-minutes"
                      type="number"
                      min="1"
                      max="30"
                      value={pomodoroBreakMinutes}
                      onChange={(e) =>
                        setPomodoroBreakMinutes(parseInt(e.target.value) || 5)
                      }
                    />
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={handleSkip}
                >
                  <SkipForward className="h-4 w-4 mr-2" />
                  {pomodoroIsBreak ? "Skip to Focus" : "Skip to Break"}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      )}
    </Card>
  );
}

