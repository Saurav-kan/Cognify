
// Mock process.env
const envs = [
  {},
  { VERCEL_URL: "my-project.vercel.app" },
  { VERCEL_PROJECT_PRODUCTION_URL: "my-project.com" },
  { NEXT_PUBLIC_APP_URL: "https://app.example.com" },
  { APP_URL: "https://custom-domain.com", VERCEL_URL: "ignore-me.vercel.app" }
];

envs.forEach((env, i) => {
  console.log(`\n--- Scenario ${i + 1} ---`);
  console.log("Env:", JSON.stringify(env));
  
  let baseUrl =
    env.APP_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null) ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : null) ||
    "http://localhost:3000";

  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  console.log("Resolved Base URL:", baseUrl);
  console.log("Worker URL:", `${baseUrl}/api/cron/worker`);
});
