/**
 * GitHub Action for deploying Docker images to Coolify.
 *
 * This action builds and pushes a Docker image using buildx, then triggers
 * a deployment on a Coolify instance and monitors the deployment status.
 */

import * as core from "@actions/core";
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
    core.info(message);
  },
  error(message: string) {
    core.error(message);
  },
};

/**
 * Main action entry point.
 */
async function run(): Promise<void> {
  try {
    const coolifyURL = core.getInput("coolify-url", { required: true });
    const appName = core.getInput("app-name", { required: true });
    const image = core.getInput("image", { required: true });
    const token = core.getInput("coolify-token", { required: true });
    const envVars = core.getInput("env-vars", { required: false });
    const healthcheckPath = core.getInput("healthcheck-path", { required: false }) || "/";
    const healthcheckTimeout = parseInt(
      core.getInput("healthcheck-timeout", { required: false }) || "60",
      10,
    );
    const context = core.getInput("context", { required: false }) || ".";

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
      context,
    });

    const deploymentUUID = await startDeployment({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      logger,
    });

    core.setOutput("deployment-uuid", deploymentUUID);

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
    if (appDetails.health_check_enabled && healthcheckPath === "/") {
      activeHealthcheckPath = appDetails.health_check_path || "/";
    }

    // Verify healthcheck
    const healthcheckUrl = await verifyHealthcheck({
      fqdn: appDetails.fqdn,
      healthcheckPath: activeHealthcheckPath,
      timeout: healthcheckTimeout,
      logger,
    });

    core.setOutput("healthcheck-url", healthcheckUrl);
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
    else core.setFailed("An unknown error occurred");
  }
}

run();
