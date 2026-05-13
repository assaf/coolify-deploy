#!/usr/bin/env node
/**
 * CLI entry point for deploying Docker images to Coolify.
 *
 * Can be used standalone or as a GitHub Action.
 */

import { existsSync, readFileSync } from "node:fs";
import { program } from "commander";
import { deployApplication } from "./lib/deploy.js";

const logger = {
  info(message: string) {
    console.info(message);
  },
  error(message: string) {
    console.error(message);
  },
};

program
  .option("--coolify-url <url>", "Coolify instance URL (or COOLIFY_URL env)")
  .option("--app-name <name>", "Application name in Coolify (or APP_NAME env)")
  .option("--image <image>", "Docker image to deploy (or IMAGE env)")
  .option("--coolify-token <token>", "Coolify API token (or COOLIFY_TOKEN env)")
  .option("--coolify-token-file <file>", "File containing Coolify API token")
  .option(
    "--env-file <file>",
    "File containing environment variables for build",
  )
  .option(
    "--healthcheck-path <path>",
    "Healthcheck path (or HEALTHCHECK_PATH env, default: /)",
  )
  .option(
    "--healthcheck-timeout <seconds>",
    "Healthcheck timeout in seconds (or HEALTHCHECK_TIMEOUT env, default: 60)",
  )
  .option("--context <path>", "Docker build context path (default: .)")
  .parse(process.argv);

const options = program.opts<{
  coolifyUrl: string | undefined;
  appName: string | undefined;
  image: string | undefined;
  healthcheckPath: string | undefined;
  healthcheckTimeout: string | undefined;
  coolifyToken: string | undefined;
  coolifyTokenFile: string | undefined;
  envFile: string | undefined;
  context: string | undefined;
}>();

const coolifyURL = options.coolifyUrl ?? process.env.COOLIFY_URL;
const appName = options.appName ?? process.env.APP_NAME;
const image = options.image ?? process.env.IMAGE;
const healthcheckPath =
  options.healthcheckPath ?? process.env.HEALTHCHECK_PATH ?? "/";
const healthcheckTimeout = parseInt(
  options.healthcheckTimeout ?? process.env.HEALTHCHECK_TIMEOUT ?? "60",
  10,
);

let token = options.coolifyToken ?? process.env.COOLIFY_TOKEN;

if (!token && options.coolifyTokenFile) {
  if (!existsSync(options.coolifyTokenFile)) {
    logger.error(`Token file not found: ${options.coolifyTokenFile}`);
    process.exit(1);
  }
  token = readFileSync(options.coolifyTokenFile, "utf-8").trim();
}

if (!coolifyURL || !appName || !image || !token) {
  logger.error("Missing required options:");
  if (!coolifyURL) logger.error("  --coolify-url or COOLIFY_URL");
  if (!appName) logger.error("  --app-name or APP_NAME");
  if (!image) logger.error("  --image or IMAGE");
  if (!token)
    logger.error("  --coolify-token, COOLIFY_TOKEN, or --coolify-token-file");
  process.exit(1);
}

const context = options.context ?? ".";

let envVars: string | undefined;
if (options.envFile) {
  if (!existsSync(options.envFile)) {
    logger.error(`Env file not found: ${options.envFile}`);
    process.exit(1);
  }
  envVars = readFileSync(options.envFile, "utf-8");
}

try {
  const { deploymentUUID } = await deployApplication({
    coolifyURL,
    appName,
    image,
    coolifyToken: token,
    envVars,
    healthcheckPath,
    healthcheckTimeout,
    context,
    logger,
  });
  logger.info(`Deployment UUID: ${deploymentUUID}`);
  process.exit(0);
} catch (error) {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred";
  logger.error(message);
  process.exit(1);
}
