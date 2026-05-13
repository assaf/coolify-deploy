/**
 * Shared deploy logic for GitHub Action and CLI.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
const SPINNER_CHARS = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";
/**
 * Finds the application UUID for the given Coolify application name.
 */
export async function findAppUUID({ coolifyURL, appName, coolifyToken, logger, }) {
    logger.info(`Finding application UUID for "${appName}"...`);
    const response = await fetch(new URL("/api/v1/applications", coolifyURL), {
        headers: { Authorization: `Bearer ${coolifyToken}` },
    });
    if (!response.ok)
        throw new Error(`Failed to find application: ${response.statusText}`);
    const data = (await response.json());
    const appUUID = data.find(({ name }) => name === appName)?.uuid;
    if (!appUUID) {
        const availableApps = data.map(({ name }) => name).join(", ");
        throw new Error(`No application found with name "${appName}"\nAvailable applications: ${availableApps}`);
    }
    logger.info(`Found application UUID: ${appUUID}`);
    return appUUID;
}
/**
 * Builds and pushes the Docker image to the registry.
 */
export async function buildDockerImage({ image, envVars, logger, context, }) {
    logger.info("Building Docker image...");
    const hasEnvVars = envVars && envVars.trim().length > 0;
    let secretFile;
    const args = [
        "buildx",
        "build",
        "--platform",
        "linux/amd64",
        "--push",
        "-t",
        image,
        context,
    ];
    if (hasEnvVars) {
        secretFile = path.join(tmpdir(), `coolify-env-${Date.now()}`);
        fs.writeFileSync(secretFile, envVars);
        args.push("--secret", `id=env,src=${secretFile}`);
    }
    try {
        await new Promise((resolve, reject) => {
            const child = spawn("docker", args, {
                stdio: ["inherit", "inherit", "inherit"],
            });
            child.on("close", (code) => {
                if (code === 0)
                    resolve();
                else {
                    const cmd = `docker ${args.join(" ")}`;
                    reject(new Error(`Command failed with code ${code}: ${cmd}`));
                }
            });
            child.on("error", reject);
        });
        logger.info("Docker image built and pushed successfully");
    }
    finally {
        if (secretFile)
            fs.unlinkSync(secretFile);
    }
}
/**
 * Starts a deployment on Coolify.
 */
export async function startDeployment({ appUUID, coolifyToken, coolifyURL, logger, }) {
    logger.info("Starting deployment...");
    const url = new URL("/api/v1/deploy", coolifyURL);
    url.searchParams.set("type", "application");
    url.searchParams.set("uuid", appUUID);
    url.searchParams.set("force", "true");
    const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${coolifyToken}` },
    });
    if (!response.ok)
        throw new Error(`Failed to trigger deployment: ${response.statusText}`);
    const { deployments } = (await response.json());
    const deploymentUUID = deployments?.[0]?.deployment_uuid;
    if (!deploymentUUID)
        throw new Error("No deployment UUID in response");
    logger.info(`Deployment started with UUID: ${deploymentUUID}`);
    return deploymentUUID;
}
/**
 * Polls the deployment status until it completes, fails, or times out.
 */
export async function pollDeploymentStatus({ deploymentUUID, coolifyToken, coolifyURL, timeout, logger, }) {
    logger.info("Monitoring deployment status...");
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    while (true) {
        const response = await fetch(new URL(`/api/v1/deployments/${deploymentUUID}`, coolifyURL), {
            headers: { Authorization: `Bearer ${coolifyToken}` },
        });
        if (!response.ok)
            throw new Error(`Failed to get deployment status: ${response.statusText}`);
        const data = (await response.json());
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
            throw new Error(`Deployment timed out after ${timeout} seconds with status: ${status}\n${details}`);
        }
        const spinnerIndex = Math.floor((elapsed / 100) % SPINNER_CHARS.length);
        logger.info(`${SPINNER_CHARS[spinnerIndex]} Waiting for deployment... Status: ${status}`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
}
/**
 * Fetches application details from Coolify API.
 */
export async function getAppDetails({ appUUID, coolifyToken, coolifyURL, logger, }) {
    logger.info("Fetching application details...");
    const response = await fetch(new URL(`/api/v1/applications/${appUUID}`, coolifyURL), {
        headers: { Authorization: `Bearer ${coolifyToken}` },
    });
    if (!response.ok)
        throw new Error(`Failed to fetch application details: ${response.statusText}`);
    const data = (await response.json());
    logger.info(`Application FQDN: ${data.fqdn}`);
    logger.info(`Healthcheck: ${data.health_check_enabled ? "enabled" : "disabled"} at ${data.health_check_path || "/"}`);
    return data;
}
/**
 * Updates application healthcheck settings on Coolify.
 */
export async function updateHealthcheck({ appUUID, coolifyToken, coolifyURL, healthcheckPath, healthcheckPort = "3000", portsExposes = "3000", logger, }) {
    logger.info(`Setting healthcheck to ${healthcheckPath} on port ${healthcheckPort}...`);
    const response = await fetch(new URL(`/api/v1/applications/${appUUID}`, coolifyURL), {
        method: "PATCH",
        headers: {
            Authorization: `Bearer ${coolifyToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            health_check_enabled: true,
            health_check_path: healthcheckPath,
            health_check_port: healthcheckPort,
            ports_exposes: portsExposes,
        }),
    });
    if (!response.ok)
        throw new Error(`Failed to update healthcheck: ${response.statusText}`);
    logger.info("Healthcheck configuration updated successfully");
}
/**
 * Polls the healthcheck endpoint until it returns success or times out.
 */
export async function verifyHealthcheck({ fqdn, healthcheckPath, timeout, logger, }) {
    const healthcheckUrl = new URL(healthcheckPath, /^https?:/.test(fqdn) ? fqdn : `https://${fqdn}`).toString();
    logger.info(`Verifying healthcheck at ${healthcheckUrl}`);
    const startTime = Date.now();
    const timeoutMs = timeout * 1000;
    while (true) {
        const elapsed = Date.now() - startTime;
        const spinnerIndex = Math.floor((elapsed / 100) % SPINNER_CHARS.length);
        try {
            const response = await fetch(healthcheckUrl);
            if (response.ok) {
                logger.info(`✓ Healthcheck passed: ${response.status} ${response.statusText}`);
                return healthcheckUrl;
            }
            logger.info(`${SPINNER_CHARS[spinnerIndex]} Waiting for healthcheck... Status: ${response.status}`);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logger.info(`${SPINNER_CHARS[spinnerIndex]} Waiting for healthcheck... ${message}`);
        }
        if (elapsed >= timeoutMs)
            throw new Error(`Healthcheck timed out after ${timeout} seconds`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
    }
}
/**
 * Runs the complete deployment pipeline: find app, build image, deploy, healthcheck.
 */
export async function deployApplication(params) {
    const { coolifyURL, appName, image, coolifyToken, envVars, healthcheckPath = "/", healthcheckTimeout = 60, context = ".", logger, } = params;
    logger.info(`Deploying ${image} to ${appName} at ${coolifyURL}`);
    const appUUID = await findAppUUID({
        coolifyURL,
        appName,
        coolifyToken,
        logger,
    });
    await buildDockerImage({ image, envVars, logger, context });
    const deploymentUUID = await startDeployment({
        appUUID,
        coolifyToken,
        coolifyURL,
        logger,
    });
    await pollDeploymentStatus({
        deploymentUUID,
        coolifyToken,
        coolifyURL,
        timeout: 600,
        logger,
    });
    const appDetails = await getAppDetails({
        appUUID,
        coolifyToken,
        coolifyURL,
        logger,
    });
    await updateHealthcheck({
        appUUID,
        coolifyToken,
        coolifyURL,
        healthcheckPath,
        logger,
    });
    const healthcheckUrl = await verifyHealthcheck({
        fqdn: appDetails.fqdn,
        healthcheckPath: appDetails.health_check_path || "/",
        timeout: healthcheckTimeout,
        logger,
    });
    return { deploymentUUID, healthcheckUrl };
}
//# sourceMappingURL=deploy.js.map