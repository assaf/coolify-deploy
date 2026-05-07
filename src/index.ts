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
  pollDeploymentStatus,
  startDeployment,
} from "./lib/deploy.js";

const actionLogger = {
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

    actionLogger.info(`Deploying ${image} to ${appName} at ${coolifyURL}`);

    const appUUID = await findAppUUID({
      coolifyURL,
      appName,
      coolifyToken: token,
      logger: actionLogger,
    });

    await buildDockerImage({
      image,
      envVars,
      logger: actionLogger,
    });

    const deploymentUUID = await startDeployment({
      appUUID,
      coolifyToken: token,
      coolifyURL,
      logger: actionLogger,
    });

    core.setOutput("deployment-uuid", deploymentUUID);

    await pollDeploymentStatus({
      deploymentUUID,
      coolifyToken: token,
      coolifyURL,
      timeout: 600,
      logger: actionLogger,
    });
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message);
    else core.setFailed("An unknown error occurred");
  }
}

run();
