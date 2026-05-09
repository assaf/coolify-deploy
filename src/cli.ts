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
  getAppDetails,
  pollDeploymentStatus,
  startDeployment,
  updateHealthcheck,
  verifyHealthcheck,
} from "./lib/deploy.js";

const logger = {
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
    .option("--healthcheck-path <path>", "Healthcheck path (or HEALTHCHECK_PATH env, default: /)")
    .option(
      "--healthcheck-timeout <seconds>",
      "Healthcheck timeout in seconds (or HEALTHCHECK_TIMEOUT env, default: 60)",
    )
    .parse(process.argv);

  const options = program.opts();

  const coolifyURL = options.coolifyUrl ?? process.env.COOLIFY_URL;
  const appName = options.appName ?? process.env.APP_NAME;
  const image = options.image ?? process.env.IMAGE;
  const healthcheckPath = options.healthcheckPath ?? process.env.HEALTHCHECK_PATH ?? "/";
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
    if (!token) logger.error("  --coolify-token, COOLIFY_TOKEN, or --coolify-token-file");
    process.exit(1);
  }

  let envVars: string | undefined;
  if (options.envFile) {
    if (!existsSync(options.envFile)) {
      logger.error(`Env file not found: ${options.envFile}`);
      process.exit(1);
    }
    envVars = readFileSync(options.envFile, "utf-8");
  }

  try {
    logger.info(`Deploying ${image} to ${appName} at ${coolifyURL}`);

    const appUUID = await findAppUUID({
      coolifyURL,
      appName,
      coolifyToken: token,
      logger,
    });

    await buildDockerImage({
      image,
      envVars,
      logger,
    });

    const deploymentUUID = await startDeployment({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      logger,
    });

    await pollDeploymentStatus({
      deploymentUUID,
      coolifyToken: token,
      coolifyURL,
      timeout: 600,
      logger,
    });

    // Fetch app details and configure/update healthcheck
    const appDetails = await getAppDetails({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      logger,
    });

    let activeHealthcheckPath = healthcheckPath;

    // Update healthcheck configuration (idempotent PATCH)
    await updateHealthcheck({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      healthcheckPath,
      logger,
    });

    // Use existing healthcheck path if no custom path provided
    if (appDetails.health_check_enabled && healthcheckPath === "/")
      activeHealthcheckPath = appDetails.health_check_path || "/";

    // Verify healthcheck
    await verifyHealthcheck({
      fqdn: appDetails.fqdn,
      healthcheckPath: activeHealthcheckPath,
      timeout: healthcheckTimeout,
      logger,
    });

    logger.info(`Deployment UUID: ${deploymentUUID}`);
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : "An unknown error occurred";
    logger.error(message);
    process.exit(1);
  }
}

run();
