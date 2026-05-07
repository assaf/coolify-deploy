/**
 * GitHub Action for deploying Docker images to Coolify.
 *
 * This action builds and pushes a Docker image using buildx, then triggers
 * a deployment on a Coolify instance and monitors the deployment status.
 */

import * as core from "@actions/core";
import { spawn } from "node:child_process";

const SPINNER_CHARS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

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

    core.info(`Deploying ${image} to ${appName} at ${coolifyURL}`);

    const appUUID = await findAppUUID({ coolifyURL, appName, token });
    await buildDockerImage({ image, envVars });
    const deploymentUUID = await startDeployment({ appUUID, token, coolifyURL });
    
    core.setOutput("deployment-uuid", deploymentUUID);
    
    await pollDeploymentStatus({
      deploymentUUID,
      token,
      coolifyURL,
      timeout: 600,
    });
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unknown error occurred");
    }
  }
}

/**
 * Finds the application UUID for the given Coolify application name.
 */
async function findAppUUID({
  coolifyURL,
  appName,
  token,
}: {
  coolifyURL: string;
  appName: string;
  token: string;
}): Promise<string> {
  core.info(`Finding application UUID for "${appName}"...`);

  const url = new URL("/api/v1/applications", coolifyURL);
  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to find application: ${response.statusText}`);
  }

  const data = (await response.json()) as { uuid: string; name: string }[];

  const appUUID = data.find(({ name }) => name === appName)?.uuid;
  if (!appUUID) {
    const availableApps = data.map(({ name }) => name).join(", ");
    throw new Error(
      `No application found with name "${appName}"\nAvailable applications: ${availableApps}`,
    );
  }

  core.info(`Found application UUID: ${appUUID}`);
  return appUUID;
}

/**
 * Builds and pushes the Docker image to the registry.
 */
async function buildDockerImage({
  image,
  envVars,
}: {
  image: string;
  envVars: string;
}): Promise<void> {
  core.info("Building Docker image...");

  const hasEnvVars = envVars && envVars.trim().length > 0;

  const args = [
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "--push",
    "-t",
    image,
    ".",
  ];

  if (hasEnvVars) {
    args.push("--secret", "id=dotenv,src=/dev/stdin");
  }

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

  core.info("Docker image built and pushed successfully");
}

/**
 * Starts a deployment on Coolify.
 */
async function startDeployment({
  appUUID,
  token,
  coolifyURL,
}: {
  appUUID: string;
  token: string;
  coolifyURL: string;
}): Promise<string> {
  core.info("Starting deployment...");

  const url = new URL("/api/v1/deploy", coolifyURL);
  url.searchParams.set("type", "application");
  url.searchParams.set("uuid", appUUID);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to trigger deployment: ${response.statusText}`);
  }

  const { deployments } = (await response.json()) as {
    deployments: { deployment_uuid: string }[] | undefined;
  };

  const deploymentUUID = deployments?.[0]?.deployment_uuid;
  if (!deploymentUUID) {
    throw new Error("No deployment UUID in response");
  }

  core.info(`Deployment started with UUID: ${deploymentUUID}`);
  return deploymentUUID;
}

/**
 * Polls the deployment status until it completes, fails, or times out.
 */
async function pollDeploymentStatus({
  deploymentUUID,
  token,
  coolifyURL,
  timeout,
}: {
  deploymentUUID: string;
  token: string;
  coolifyURL: string;
  timeout: number;
}): Promise<void> {
  core.info("Monitoring deployment status...");

  const startTime = Date.now();
  const timeoutMs = timeout * 1000;

  while (true) {
    const url = new URL(`/api/v1/deployments/${deploymentUUID}`, coolifyURL);
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get deployment status: ${response.statusText}`);
    }

    const data = (await response.json()) as { status?: string };
    const status = data.status ?? "unknown";

    if (status === "finished" || status === "success") {
      core.info("✓ Deployment completed successfully");
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
    core.info(`${SPINNER_CHARS[spinnerIndex]} Waiting for deployment... Status: ${status}`);

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

run();