import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

// Load packages/server/.env (gitignored) if present, before reading config.
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the ambient environment.
}

const config = loadConfig();

const app = await buildApp(config);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
