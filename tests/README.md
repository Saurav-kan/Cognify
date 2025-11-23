# LLM Provider Tests

This test suite verifies which LLM API providers are working correctly.

## Running Tests

```bash
# Run all tests
npm test

# Run only LLM provider tests
npm run test:llm

# Run tests in watch mode
npm run test:watch
```

## Test Coverage

The tests check:

1. **API Key Availability** - Which providers have API keys configured
2. **Provider Functionality** - Which providers can successfully make API calls
3. **Smart Router** - Model selection logic
4. **End-to-End Flow** - Full request flow from router to response

## Expected Output

```
✅ Groq: Available
✅ SiliconFlow: Available
❌ Gemini: Missing
✅ HuggingFace: Available
❌ GitHub: Missing

✅ Groq Response: Cognition refers to the mental processes...
✅ SiliconFlow Response: Cognition is the mental process...
⚠️  Gemini: Skipping test - API key not configured
✅ HuggingFace Response: Cognition involves thinking...
⚠️  GitHub: Skipping test - API key not configured
```

## Environment Setup

Make sure your `.env.local` file contains the API keys you want to test:

```env
GROQ_API_KEY=your_key_here
SILICONFLOW_API_KEY=your_key_here
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
HUGGINGFACE_API_KEY=your_key_here
GITHUB_TOKEN=your_token_here
```

## Notes

- Tests will skip providers that don't have API keys configured
- Each test has a 30-second timeout
- Tests make real API calls (not mocked) to verify actual functionality

