/**
 * Job Type Definitions for LLM Queue
 */

export type JobType = "explain" | "summarize" | "summarize-batch";

export interface BaseJobData {
  type: JobType;
  jobId: string;
  clientId: string;
  timestamp: number;
}

export interface ExplainJobData extends BaseJobData {
  type: "explain";
  term: string;
  context?: string;
  taskType?: string;
}

export interface SummarizeJobData extends BaseJobData {
  type: "summarize";
  pageNumber: number;
  pageText: string;
}

export interface SummarizeBatchJobData extends BaseJobData {
  type: "summarize-batch";
  pages: Array<{ pageNumber: number; pageText: string }>;
}

export type JobData =
  | ExplainJobData
  | SummarizeJobData
  | SummarizeBatchJobData;

export interface JobResult {
  success: boolean;
  data?: any;
  error?: string;
  provider?: string;
  model?: string;
}

export interface JobStatus {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  position?: number; // Position in queue
  progress?: number; // 0-100
  result?: JobResult;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Job priorities (higher number = higher priority)
 */
export const JOB_PRIORITIES = {
  explain: 10, // Highest priority - user-initiated
  "summarize-batch": 5, // Medium priority - batch processing
  summarize: 1, // Lowest priority - individual page summaries
} as const;

