#!/usr/bin/env node
/**
 * CLI entry point for deploying Docker images to Coolify.
 *
 * Can be used standalone or as a GitHub Action.
 */

import { program } from "commander";
import { existsSync, readFileSync } from "node:fs";
import {
  buildDockerImage,
  findAppUUID,
  pollDeploymentStatus,
  startDeployment,
} from "./lib/deploy.js";

const consoleLogger = {
  info(message: string) {
    console.log(message);
  },
  error(message: string) {
    console.error(message);
  },
};

async function run(): Promise<void> {
  program
    .option("--coolify-url <url>", "Coolify instance URL (or COOLIFY_URL env)")
    .option("--app-name <name>", "Application name in Coolify (or APP_NAME env)")
    .option("--image <image>", "Docker image to deploy (or IMAGE env)")
    .option("--coolify-token <token>", "Coolify API token (or COOLIFY_TOKEN env)")
    .option("--coolify-token-file <file>", "File containing Coolify API token")
    .option("--env-file <file>", "File containing environment variables for build")
    .parse(process.argv);

  const options = program.opts();

  const coolifyURL = options.coolifyUrl ?? process.env.COOLIFY_URL;
  const appName = options.appName ?? process.env.APP_NAME;
  const image = options.image ?? process.env.IMAGE;

  let token = options.coolifyToken ?? process.env.COOLIFY_TOKEN;

  if (!token && options.coolifyTokenFile) {
    if (!existsSync(options.coolifyTokenFile)) {
      consoleLogger.error(`Token file not found: ${options.coolifyTokenFile}`);
      process.exit(1);
    }
    token = readFileSync(options.coolifyTokenFile, "utf-8").trim();
  }

  if (!coolifyURL || !appName || !image || !token) {
    consoleLogger.error("Missing required options:");
    if (!coolifyURL) consoleLogger.error("  --coolify-url or COOLIFY_URL");
    if (!appName) consoleLogger.error("  --app-name or APP_NAME");
    if (!image) consoleLogger.error("  --image or IMAGE");
    if (!token) consoleLogger.error("  --coolify-token, COOLIFY_TOKEN, or --coolify-token-file");
    process.exit(1);
  }

  let envVars: string | undefined;
  if (options.envFile) {
    if (!existsSync(options.envFile)) {
      consoleLogger.error(`Env file not found: ${options.envFile}`);
      process.exit(1);
    }
    envVars = readFileSync(options.envFile, "utf-8");
  }

  try {
    consoleLogger.info(`Deploying ${image} to ${appName} at ${coolifyURL}`);

    const appUUID = await findAppUUID({
      coolifyURL,
      appName,
      coolifyToken: token,
      logger: consoleLogger,
    });

    await buildDockerImage({
      image,
      envVars,
      logger: consoleLogger,
    });

    const deploymentUUID = await startDeployment({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      logger: consoleLogger,
    });

    await pollDeploymentStatus({
      deploymentUUID,
      coolifyToken: token,
      coolifyURL,
      timeout: 600,
      logger: consoleLogger,
    });

    consoleLogger.info(`Deployment UUID: ${deploymentUUID}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    consoleLogger.error(message);
    process.exit(1);
  }
}

run();
