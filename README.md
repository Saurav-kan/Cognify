# NeuroFocus Study Tool

An accessibility-first study aid that converts hostile educational content into neuro-friendly formats using bionic reading, AI summarization, and gamified chunking.

## Features

- **Neuro-Bionic Reader**: Transforms dense text to visually guide your eyes and prevent line skipping
- **Panic Button (Focus Mode)**: Hides everything except the current sentence when feeling overwhelmed
- **Jargon Crusher**: Highlight complex terms to get simple, contextual explanations using AI
- **PDF Un-Breaker (OCR)**: Upload images of textbooks to extract and process text

## Tech Stack

- **Framework**: Next.js 14+ (App Router) with TypeScript
- **Styling**: Tailwind CSS with shadcn/ui components
- **AI**: Multi-Provider Free Tier Mesh
  - Groq (llama-3.1-8b-instant) - Speed layer
  - SiliconFlow (tencent/Hunyuan-MT-7B) - Volume layer
  - Google Gemini (gemini-2.0-flash-lite) - Vision/context layer
  - GitHub Models (gpt-4o) - Intelligence layer
- **AI SDK**: Vercel AI SDK with smart routing
- **OCR**: Tesseract.js (client-side processing)
- **State Management**: Zustand with LocalStorage persistence
- **Animations**: Framer Motion

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key (for Jargon Crusher feature)

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
```

5. Run the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Starting a Reading Session

1. **Upload an Image**: Use the "PDF Un-Breaker" section to upload a JPG or PNG image of your textbook
2. **Or Paste Text**: Paste your study material directly into the text area
3. Click "Start Reading" to begin

### Reading Features

- **Bionic Reading**: Toggle to enable visual guidance by bolding the first half of each word
- **Focus Mode**: Activate to hide everything except the current sentence. Use arrow keys (↑ ↓) to navigate
- **Jargon Crusher**: Select any text to get an AI-powered explanation
- **Dark Mode**: Toggle for comfortable reading in low light
- **Font Selection**: Choose between Inter (default) or OpenDyslexic

## Project Structure

```
├── app/
│   ├── api/
│   │   └── explain/          # AI explanation endpoint
│   ├── reader/
│   │   └── [id]/             # Reader page with dynamic session ID
│   ├── layout.tsx            # Root layout
│   ├── page.tsx              # Home/dashboard page
│   └── globals.css           # Global styles
├── components/
│   ├── features/
│   │   ├── AIWidget.tsx      # Jargon Crusher component
│   │   ├── BionicText.tsx    # Bionic reading component
│   │   ├── OCRUpload.tsx     # OCR file upload
│   │   └── PanicOverlay.tsx  # Focus mode overlay
│   └── ui/                   # shadcn/ui components
├── lib/
│   ├── bionic-algo.ts        # Bionic transformation logic
│   ├── store.ts              # Zustand state management
│   ├── utils.ts              # Utility functions
│   ├── smart-router.ts       # Multi-provider load balancer
│   ├── ai-providers.ts       # AI provider clients and configuration
│   └── optimization-utils.ts # Token reduction strategies
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
  - Free tier: 1,000 RPM, 500,000 TPM
  - **Optional**: App works without this - will use other available providers

- **`HUGGINGFACE_API_KEY`**: HuggingFace API key (Alternative Layer - good free tier models)

  - Get from: https://huggingface.co/settings/tokens
  - Free tier: Generous limits, good for complex reasoning tasks
  - Uses OpenAI-compatible Inference API

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

## Deployment

This project is designed for deployment on Vercel:

1. Push your code to GitHub
2. Import the project in Vercel
3. Add your `OPENAI_API_KEY` in Vercel's environment variables
4. Deploy!

## Privacy & Data Storage

- All notes and text are stored locally in your browser (LocalStorage)
- No data is sent to servers except for AI explanations (when you use Jargon Crusher)
- OCR processing happens entirely in your browser

## Cost Considerations

- **Hosting**: Free on Vercel Hobby plan
- **AI API**: **$0.00/month** - Uses only free tier providers
  - Combined capacity: ~1,200 requests/minute
  - Smart routing distributes load efficiently
- **Storage**: Browser LocalStorage (free, no server costs)

### Free Tier Limits (Combined)

- **Groq**: 30 RPM, 6,000 TPM
- **SiliconFlow**: 1,000 RPM, 500,000 TPM
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

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.
