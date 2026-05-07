/**
 * Shared deploy logic for GitHub Action and CLI.
 */

import { spawn } from "node:child_process";

const SPINNER_CHARS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

interface Logger {
  info(message: string): void;
  error(message: string): void;
}

/**
 * Finds the application UUID for the given Coolify application name.
 */
export async function findAppUUID({
  coolifyURL,
  appName,
  coolifyToken,
  logger,
}: {
  coolifyURL: string;
  appName: string;
  coolifyToken: string;
  logger: Logger;
}): Promise<string> {
  logger.info(`Finding application UUID for "${appName}"...`);

  const url = new URL("/api/v1/applications", coolifyURL);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${coolifyToken}` },
  });

  if (!response.ok) throw new Error(`Failed to find application: ${response.statusText}`);

  const data = (await response.json()) as { uuid: string; name: string }[];

  const appUUID = data.find(({ name }) => name === appName)?.uuid;
  if (!appUUID) {
    const availableApps = data.map(({ name }) => name).join(", ");
    throw new Error(
      `No application found with name "${appName}"\nAvailable applications: ${availableApps}`,
    );
  }

  logger.info(`Found application UUID: ${appUUID}`);
  return appUUID;
}

/**
 * Builds and pushes the Docker image to the registry.
 */
export async function buildDockerImage({
  image,
  envVars,
  logger,
}: {
  image: string;
  envVars?: string;
  logger: Logger;
}): Promise<void> {
  logger.info("Building Docker image...");

  const hasEnvVars = envVars && envVars.trim().length > 0;

  const args = ["buildx", "build", "--platform", "linux/amd64", "--push", "-t", image, "."];

  if (hasEnvVars) args.push("--secret", "id=dotenv,src=/dev/stdin");

  await new Promise<void>((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: hasEnvVars ? ["pipe", "inherit", "inherit"] : ["inherit", "inherit", "inherit"],
    });

    if (hasEnvVars) {
      child.stdin?.write(envVars);
      child.stdin?.end();
    }

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        const cmd = `docker buildx build --platform linux/amd64${hasEnvVars ? " --secret id=dotenv,src=/dev/stdin" : ""} --push -t ${image} .`;
        reject(new Error(`Command failed with code ${code}: ${cmd}`));
      }
    });

    child.on("error", reject);
  });

  logger.info("Docker image built and pushed successfully");
}

/**
 * Starts a deployment on Coolify.
 */
export async function startDeployment({
  appUUID,
  coolifyToken,
  coolifyURL,
  logger,
}: {
  appUUID: string;
  coolifyToken: string;
  coolifyURL: string;
  logger: Logger;
}): Promise<string> {
  logger.info("Starting deployment...");

  const url = new URL("/api/v1/deploy", coolifyURL);
  url.searchParams.set("type", "application");
  url.searchParams.set("uuid", appUUID);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${coolifyToken}` },
  });

  if (!response.ok) throw new Error(`Failed to trigger deployment: ${response.statusText}`);

  const { deployments } = (await response.json()) as {
    deployments: { deployment_uuid: string }[] | undefined;
  };

  const deploymentUUID = deployments?.[0]?.deployment_uuid;
  if (!deploymentUUID) throw new Error("No deployment UUID in response");

  logger.info(`Deployment started with UUID: ${deploymentUUID}`);
  return deploymentUUID;
}

/**
 * Polls the deployment status until it completes, fails, or times out.
 */
export async function pollDeploymentStatus({
  deploymentUUID,
  coolifyToken,
  coolifyURL,
  timeout,
  logger,
}: {
  deploymentUUID: string;
  coolifyToken: string;
  coolifyURL: string;
  timeout: number;
  logger: Logger;
}): Promise<void> {
  logger.info("Monitoring deployment status...");

  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  while (true) {
    const url = new URL(`/api/v1/deployments/${deploymentUUID}`, coolifyURL);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${coolifyToken}` },
    });

    if (!response.ok) throw new Error(`Failed to get deployment status: ${response.statusText}`);

    const data = (await response.json()) as { status?: string };
    const status = data.status ?? "unknown";

    if (status === "finished" || status === "success") {
      logger.info("✓ Deployment completed successfully");
      return;
    }

    if (status === "failed" || status === "error") {
      const details = JSON.stringify(data, null, 2);
      throw new Error(`Deployment failed with status: ${status}\n${details}`);
    }

    const elapsed = Date.now() - startTime;
    if (elapsed >= timeoutMs) {
      const details = JSON.stringify(data, null, 2);
      throw new Error(
        `Deployment timed out after ${timeout} seconds with status: ${status}\n${details}`,
      );
    }

    const spinnerIndex = Math.floor((elapsed / 100) % SPINNER_CHARS.length);
    logger.info(`${SPINNER_CHARS[spinnerIndex]} Waiting for deployment... Status: ${status}`);

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
