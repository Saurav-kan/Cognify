
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-black?style=for-the-badge&logo=next.js&logoColor=white)
![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-%23000000.svg?style=for-the-badge&logo=vercel&logoColor=white)

An accessibility-first study aid that converts "hostile" educational content into neuro-friendly formats. NeuroFocus utilizes a custom multi-model AI mesh to provide bionic reading, cognitive load management, and context-aware summarization without infrastructure costs.

## 🏗 System Architecture

NeuroFocus utilizes a **client-side logic mesh** to route prompts based on task complexity, creating a resilient "Free Tier Mesh" that maximizes throughput.
    
An accessibility-first study aid that converts hostile educational content into neuro-friendly formats using bionic reading, AI summarization, and gamified chunking.

## Features

- **Neuro-Bionic Reader**: Transforms dense text to visually guide your eyes and prevent line skipping
- **Smart PDF Reader**: Upload PDFs (up to 25MB) with automatic page-by-page AI summarization
- **Flashcard Generator**: Automatically generates study flashcards from your reading material
- **Text-to-Speech (TTS)**: Listen to content with synchronized word highlighting and adjustable speed
- **Panic Button (Focus Mode)**: Hides everything except the current sentence when feeling overwhelmed
- **Jargon Crusher**: Select any text to get an AI-powered explanation with:
  - **Definition**: Simple, clear meaning
  - **Synonyms**: Alternative words
  - **Context**: Original usage context preserved
- **Themes**: Multiple reading themes including Light Grey, Grey, Dim, and Dark
- **PDF Un-Breaker (OCR)**: Upload images of textbooks to extract and process text

## System Architecture

<img width="570" height="367" alt="image" src="https://github.com/user-attachments/assets/66739ffe-250e-4e31-b732-be9e9f3ff6b8" />

## Technical Deep Dive

### Architecture Overview

NeuroFocus is built on a **hybrid client-server architecture** optimized for zero-cost operation using free-tier AI providers. The system employs several key design patterns:

- **Queue-Based Job Processing**: Redis-backed priority queue for async AI operations
- **Smart Provider Routing**: Dynamic AI provider selection based on task characteristics
- **Distributed Rate Limiting**: Redis-based token bucket algorithm for RPM/TPM tracking
- **Hybrid Communication**: SSE (Server-Sent Events) with polling fallback for resilience
- **Multi-Layer Caching**: Client-side (IndexedDB) + server-side (Redis) caching strategy

### 1. Queue System Architecture

**Design Choice**: Redis-based priority queue using sorted sets (ZSET) for job management.

**Why Redis?**
- **Atomic Operations**: Lua scripts ensure race-condition-free enqueue/dequeue
- **Priority Support**: Sorted sets enable job prioritization (explain > batch-summarize > summarize)
- **TTL Management**: Automatic cleanup of stale jobs (24h TTL)
- **Upstash Compatibility**: Serverless Redis that works with Vercel Edge Functions

**Implementation Details**:

```typescript
// Priority scoring: priority * 10^12 + timestamp
// Ensures higher priority jobs are processed first, with FIFO within same priority
const score = priority * 1000000000000 + Date.now();
```

**Key Components**:
- **Priority Queue** (`priority:{jobType}`): Redis ZSET for O(log N) priority-based dequeuing
- **Legacy Queue** (`queue:{jobType}`): Redis LIST for backward compatibility
- **Job Storage** (`job:{jobId}`): JSON-serialized job data with 24h TTL
- **Status Tracking** (`status:{jobId}`): Real-time job status updates

**Lua Scripts for Atomicity**:
All queue operations use Lua scripts to prevent race conditions and handle Upstash Redis client quirks:
- `enqueueJob`: Atomically stores job data, adds to priority queue, and initializes status
- `dequeueJob`: Atomically pops highest-priority job and handles various return formats
- `updateJobStatus`: Atomically merges status updates without read-modify-write races

**Job Priorities**:
- `explain`: Priority 10 (user-initiated, highest priority)
- `summarize-batch`: Priority 5 (batch processing, medium priority)
- `summarize`: Priority 1 (individual pages, lowest priority)

### 2. Smart Router & Provider Selection

**Design Choice**: Client-side routing logic that selects optimal AI provider based on task characteristics.

**Why Client-Side?**
- **Zero Backend Cost**: No need for dedicated routing service
- **Fast Decision Making**: No network latency for routing decisions
- **Flexible Fallback**: Easy to add new providers without backend changes

**Routing Strategy**:

| Condition | Provider | Reason |
|-----------|----------|--------|
| Has image OR >10k words | Gemini | 1M token window, vision support |
| Complex reasoning task | HuggingFace | Generous free tier for reasoning |
| History > 10 messages | SiliconFlow | 1K RPM handles long conversations |
| Default (short interaction) | SiliconFlow | 1K RPM vs Groq's 30 RPM |

**Token Optimization**:
- **Compressed System Prompt**: ~80% token reduction (from ~200 to ~40 tokens)
- **Rolling Window**: Groq/SiliconFlow only get last 6 messages (Gemini gets full history)
- **Context-Aware Truncation**: Automatically truncates context based on provider limits

**Fallback Chain**:
```
SiliconFlow → Groq → Gemini → HuggingFace → OpenRouter → GitHub
```

### 3. Distributed Rate Limiting

**Design Choice**: Redis-based sliding window + token bucket algorithm for RPM/TPM tracking.

**Why Distributed?**
- **Multi-Instance Safe**: Works across multiple Vercel serverless functions
- **Atomic Operations**: Lua scripts prevent race conditions
- **Provider-Specific**: Tracks limits per provider independently

**Implementation**:

```typescript
// RPM: Sliding window using Redis ZSET
// TPM: Token bucket using Redis counter with expiration
```

**Rate Limits** (Conservative estimates):
- **Groq**: 30 RPM, 6,000 TPM
- **SiliconFlow**: 1,000 RPM, 80,000 TPM
- **Gemini**: 15 RPM, 1,000,000 TPM
- **HuggingFace**: 100 RPM, 100,000 TPM
- **OpenRouter**: 20 RPM, 100,000 TPM
- **GitHub**: 1 RPM, 10,000 TPM

**Lua Script Benefits**:
- Single network round-trip for RPM + TPM checks
- Automatic cleanup of expired entries
- Atomic increment/decrement prevents overshooting limits

### 4. Hybrid Communication: SSE + Polling

**Design Choice**: Server-Sent Events (SSE) as primary, with polling fallback for resilience.

**Why Hybrid?**
- **SSE Advantages**: Real-time updates, low latency, efficient for streaming
- **Polling Fallback**: Handles SSE failures, timeouts, and network interruptions
- **User Experience**: No false timeout errors - eventually consistent

**Implementation Flow**:

1. **Initial Request**: Client sends job request → API enqueues job → Returns jobId
2. **SSE Connection**: Client opens SSE stream to `/api/queue/stream/${jobId}`
3. **Real-Time Updates**: Server streams job status updates (`queued` → `processing` → `completed`)
4. **Fallback Trigger**: On SSE error/timeout → Switch to polling every 2-3 seconds
5. **Completion**: Extract result from `status.result.data` and display

**Polling Strategy**:
- **Interval**: 2-3 seconds (less frequent than SSE to reduce load)
- **Max Duration**: 5 minutes total from job creation
- **Status Checks**: `completed` → extract result, `failed` → show error, `queued/processing` → continue

**Benefits**:
- Resilient to network issues
- No lost jobs (worker continues processing even if SSE fails)
- Better UX (no false timeouts)

### 5. Caching Strategy

**Design Choice**: Multi-layer caching (client-side + server-side) with context-aware invalidation.

**Client-Side (IndexedDB)**:
- **Purpose**: Store large PDF data, session state
- **TTL**: Session-based (cleared on browser close)
- **Use Case**: PDF pages, reading progress, flashcard data

**Server-Side (Redis/Vercel KV)**:
- **Purpose**: Cache AI responses to reduce API calls
- **TTL**: 24 hours (configurable)
- **Cache Key**: Hash of (term + context + taskType) for explain jobs
- **Invalidation**: Context-aware (different context = different cache key)

**Cache Key Generation**:
```typescript
// Without context: hash(term.toLowerCase().trim() + taskType)
// With context: hash(term + context + taskType)
// Ensures context-specific explanations are cached separately
```

**Benefits**:
- **Cost Reduction**: Cached responses don't hit AI APIs
- **Latency Improvement**: Instant responses for cached queries
- **Rate Limit Preservation**: Reduces API calls, staying within free tier limits

### 6. Context Extraction & Processing

**Design Choice**: Multi-strategy DOM extraction with UI filtering.

**Why Multiple Strategies?**
- **Reliability**: Fallback if primary method fails
- **Accuracy**: Extracts only content, excludes UI elements
- **Performance**: Prioritizes fast methods (text prop) over DOM traversal

**Extraction Strategy**:

1. **Primary**: Use `text` prop (passed from BionicText component)
2. **Secondary**: Query `<p data-section-id>` elements (BionicText paragraphs)
3. **Tertiary**: DOM walk-up with UI filtering:
   - Skips: buttons, inputs, nav, headers, footers, switches
   - Targets: `.prose`, `.text-relaxed`, `article`, `section` containers
   - Clones container and removes UI elements before extraction

**Context Window**:
- **Surrounding Words**: 100 words before/after selected text
- **Purpose**: Provides enough context for accurate AI explanations
- **Optimization**: Normalizes whitespace, removes extra newlines

**UI Filtering**:
```typescript
// Explicitly skips common UI elements:
- button, input, select, label
- nav, header, footer
- Elements with className containing "switch", "card-header", "card-footer"
- Elements with role="button"
```

### 7. Error Handling & Resilience

**Design Philosophy**: Fail gracefully, log extensively, provide fallbacks.

**Error Handling Layers**:

1. **API Route Level**:
   - Rate limit errors → 429 with retry-after header
   - Validation errors → 400 with descriptive message
   - Provider errors → Automatic fallback to next provider

2. **Worker Level**:
   - Job processing errors → Update status to `failed` with error message
   - Provider failures → Try fallback providers before failing
   - Network errors → Retry with exponential backoff (future enhancement)

3. **Frontend Level**:
   - SSE errors → Switch to polling fallback
   - Network errors → Show user-friendly error message
   - Timeout errors → Continue polling (don't give up immediately)

**Logging Strategy**:
- **Structured Logging**: `[Component] Action: details` format
- **Error Context**: Includes jobId, provider, error type, stack trace
- **Performance Metrics**: Logs processing time, token usage, cache hits/misses

**Resilience Features**:
- **Fail-Open Rate Limiting**: If Redis is down, allow requests (prevents single point of failure)
- **Automatic Fallback**: Provider failures trigger next provider in chain
- **Job Persistence**: Jobs survive server restarts (stored in Redis with 24h TTL)
- **Orphan Cleanup**: Periodic cleanup of zombie jobs (missing data but present in queue)

### 8. Performance Optimizations

**Token Optimization**:
- **Compressed Prompts**: ~80% reduction in system prompt tokens
- **Rolling Windows**: Only send relevant message history to providers
- **Context Truncation**: Automatically truncate context based on provider limits

**Network Optimization**:
- **Streaming Responses**: Stream AI responses as they're generated (lower perceived latency)
- **Caching**: Aggressive caching reduces redundant API calls
- **Batch Processing**: Batch summarize jobs process multiple pages efficiently

**Client-Side Optimization**:
- **IndexedDB**: Efficient storage for large PDF data
- **Lazy Loading**: Components load on demand
- **Debouncing**: Text selection debounced to prevent excessive API calls

### 9. Security Considerations

**API Key Management**:
- **Environment Variables**: All API keys stored in `.env.local` (gitignored)
- **No Client Exposure**: API keys never sent to client-side code
- **Key Validation**: Trims whitespace, validates format before use

**Rate Limiting**:
- **Client-Based**: Uses IP + User-Agent for client identification
- **Per-Endpoint**: Different limits for explain (100/hour) vs summarize (unlimited)
- **Distributed**: Redis-based rate limiting works across serverless instances

**Data Privacy**:
- **Local-First**: PDFs and reading data stored locally (IndexedDB)
- **Transient AI**: Text sent to AI providers is not stored (per API policies)
- **Anonymous Caching**: Cached responses don't contain user identifiers

### 10. Deployment Architecture

**Vercel Serverless Functions**:
- **Edge Runtime**: API routes use `runtime = "edge"` for low latency
- **Worker Runtime**: Background jobs use `runtime = "nodejs"` for full Node.js support
- **Auto-Scaling**: Functions scale automatically based on traffic

**Background Workers**:
- **Cron Trigger**: External cron service (cron-job.org) triggers worker endpoint
- **Local Development**: `npm run worker` runs worker locally for testing
- **Job Processing**: Worker polls Redis queue and processes jobs sequentially

**Redis Configuration**:
- **Upstash Redis**: Serverless Redis compatible with Vercel
- **Connection**: REST API (no persistent connections needed)
- **TTL Management**: Automatic expiration prevents unbounded growth

### Design Trade-offs

**Chosen Approaches**:

1. **Redis Queue vs Database**: Chose Redis for speed and simplicity, accepting eventual consistency
2. **SSE + Polling vs WebSockets**: Chose SSE for simplicity, added polling for resilience
3. **Client-Side Routing vs Backend**: Chose client-side for zero backend cost
4. **Multi-Provider vs Single Provider**: Chose multi-provider for resilience and higher throughput
5. **Lua Scripts vs Client Logic**: Chose Lua scripts for atomicity and Upstash compatibility

**Future Considerations**:
- **WebSocket Support**: Could replace SSE for bidirectional communication
- **Database Backend**: Could add PostgreSQL for persistent job history
- **GraphQL API**: Could add GraphQL layer for more flexible queries
- **Real-Time Updates**: Could use Redis Pub/Sub for instant job status updates

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **AI**: Multi-Provider Free Tier Mesh
  - Groq (llama-3.1-8b-instant) - Speed layer
  - SiliconFlow (Qwen/Qwen2.5-7B-Instruct) - Volume layer
  - Google Gemini (gemini-2.0-flash-lite) - Vision/context layer
  - GitHub Models (gpt-4o) - Intelligence layer
- **AI SDK**: Vercel AI SDK with smart routing
- **Caching & Storage**:
  - **Vercel KV (Redis)**: Server-side API response caching
  - **IndexedDB**: Client-side storage for large PDF data
  - **LocalStorage**: User preferences (themes, settings)
- **Background Jobs**:
  - **Vercel Functions**: Serverless processing
  - **Cron-job.org**: Reliable worker triggering
- **OCR**: Tesseract.js (client-side processing)
- **State Management**: Zustand
- **Animations**: Framer Motion

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:

```bash
git clone <your-repo-url>
cd AssisibiltyHelper
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

```bash
cp env.example .env.local
```

4. Edit `.env.local` and add your API keys (at minimum, configure SiliconFlow as fallback):

```bash
# Minimum required (recommended as fallback)
SILICONFLOW_API_KEY=your_siliconflow_api_key_here

# Optional but recommended for better performance
GROQ_API_KEY=your_groq_api_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_google_api_key_here
GITHUB_TOKEN=your_github_token_here

# Optional for Caching
KV_URL=your_vercel_kv_url
KV_REST_API_URL=your_vercel_kv_rest_api_url
KV_REST_API_TOKEN=your_vercel_kv_rest_api_token
```

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Starting a Reading Session

1. **Upload a PDF**: Use the "PDF Loader" to upload a PDF file
2. **Or Paste Text**: Paste your study material directly into the text area
3. Click "Start Reading" to begin

### Reading Features

- **Bionic Reading**: Toggle to enable visual guidance by bolding the first half of each word
- **Focus Mode**: Activate to hide everything except the current sentence. Use arrow keys (↑ ↓) to navigate
- **Jargon Crusher**: Select any text to get an AI-powered explanation
- **Flashcards**: Click the "Flashcards" tab to review auto-generated study questions
- **Listen**: Use the TTS controls to listen to the text
- **Themes**: Switch between Light Grey, Grey, Dim, and Dark themes for comfort
- **Font Selection**: Choose between Inter (default) or OpenDyslexic

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── explain/          # AI explanation endpoint
│   │   ├── summarize/        # Page summarization endpoint
│   │   └── cron/             # Background worker endpoints
│   ├── reader/
│   │   └── [id]/             # Reader page with dynamic session ID
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Home/dashboard page
│   └── globals.css           # Global styles
├── components/
│   ├── features/
│   │   ├── AIWidget.tsx      # Jargon Crusher component
│   │   ├── BionicText.tsx    # Bionic reading component
│   │   ├── FlashcardManager.tsx # Flashcard system
│   │   ├── PDFReader.tsx     # Main PDF reading interface
│   │   ├── PDFUpload.tsx     # PDF file upload
│   │   ├── ThemeSelector.tsx # Theme switcher
│   │   └── TTSReader.tsx     # Text-to-Speech component
│   └── ui/                   # shadcn/ui components
├── lib/
│   ├── api-cache.ts          # Server-side caching logic
│   ├── cache.ts              # Client-side IndexedDB caching
│   ├── store.ts              # Zustand state management
│   ├── smart-router.ts       # Multi-provider load balancer
│   └── ai-providers.ts       # AI provider clients and configuration
├── backend/
│   └── workers/              # Background job processors
└── package.json
```

## Environment Variables

This project uses a **multi-provider free tier mesh** to balance load across multiple AI services. **Configure at least one provider** - the app will automatically use whichever providers you have configured:

### Required (at least one):

- **`GROQ_API_KEY`**: Groq API key (Speed Layer - fastest for short interactions)
  - Get from: https://console.groq.com/keys
  - Free tier: 30 RPM, 6,000 TPM

- **`SILICONFLOW_API_KEY`**: SiliconFlow API key (Volume Layer - best throughput)
  - Get from: https://siliconflow.cn/
  - Free tier: 1,000 RPM, 80,000 TPM

- **`HUGGINGFACE_API_KEY`**: HuggingFace API key (Alternative Layer - good free tier models)
  - Get from: https://huggingface.co/settings/tokens
  - Free tier: Generous limits, good for complex reasoning tasks

- **`GOOGLE_GENERATIVE_AI_API_KEY`**: Google AI API key (Vision/Context Layer)
  - Get from: https://aistudio.google.com/app/apikey
  - Free tier: 30 RPM, 1,000,000 TPM (handles images & long context)

- **`GITHUB_TOKEN`**: GitHub token (Intelligence Layer - best reasoning)
  - Get from: https://github.com/settings/tokens
  - Free tier: 50 requests/day (very strict limit)

### Smart Router

The system automatically selects the best provider based on:

- **Groq**: Short interactions (< 10 messages, simple tasks)
- **SiliconFlow**: Long conversations (> 10 messages) or high volume
- **HuggingFace**: Complex reasoning tasks (good free tier models)
- **Gemini**: Images, very long text (> 10,000 words), or vision tasks
- **GitHub GPT-4o**: Complex reasoning tasks (very strict rate limits)

### Optimization Strategies

1. **Prompt Compression**: All requests use a compressed system prompt (saves ~80% tokens)
2. **Rolling Window**: Groq/SiliconFlow only get last 6 messages (Gemini gets full history)
3. **Automatic Fallback**: If primary provider fails or key is missing, automatically tries other configured providers in order (Groq → SiliconFlow → HuggingFace → Gemini → GitHub)
4. **Intelligent Caching**: Responses are cached to reduce API calls and latency

## Deployment

This project is designed for deployment on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Add your API keys and KV credentials in Vercel's environment variables
4. Deploy!

## Privacy & Data Storage

- **Local First**: Most data (PDFs, notes) is stored locally in your browser (IndexedDB/LocalStorage)
- **Transient AI**: Text sent to AI for summarization/explanation is not stored by the AI providers (per their API policies)
- **Caching**: Anonymous cached responses may be stored in Vercel KV to improve performance

## Cost Considerations

- **Hosting**: Free on Vercel Hobby plan
- **AI API**: **$0.00/month** - Uses only free tier providers
  - Combined capacity: ~1,200 requests/minute
  - Smart routing distributes load efficiently
- **Storage**: Browser LocalStorage/IndexedDB (free) + Vercel KV (Free Tier)

### Free Tier Limits (Combined)

- **Groq**: 30 RPM, 6,000 TPM
- **SiliconFlow**: 1,000 RPM, 80,000 TPM
- **HuggingFace**: Generous free tier limits
- **Google Gemini**: 30 RPM, 1,000,000 TPM
- **GitHub**: 50 requests/day

The smart router automatically balances load to stay within these limits.

## Accessibility

This tool is designed with neurodivergent users in mind:

- Screen reader compatible
- Keyboard navigation support
- High contrast options
- Relaxed spacing and line-height
- Optional OpenDyslexic font
- **TTS Support**: Auditory reinforcement for reading

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
