/**
 * Shared deploy logic for GitHub Action and CLI.
 */
export interface Logger {
    info(message: string): void;
    error(message: string): void;
}
export interface DeployApplicationParams {
    coolifyURL: string;
    appName: string;
    image: string;
    coolifyToken: string;
    envVars?: string;
    healthcheckPath?: string;
    healthcheckTimeout?: number;
    context?: string;
    logger: Logger;
}
export interface DeployApplicationResult {
    deploymentUUID: string;
    healthcheckUrl: string;
}
/**
 * Finds the application UUID for the given Coolify application name.
 */
export declare function findAppUUID({ coolifyURL, appName, coolifyToken, logger, }: {
    coolifyURL: string;
    appName: string;
    coolifyToken: string;
    logger: Logger;
}): Promise<string>;
/**
 * Builds and pushes the Docker image to the registry.
 */
export declare function buildDockerImage({ image, envVars, logger, context, }: {
    image: string;
    envVars?: string;
    logger: Logger;
    context: string;
}): Promise<void>;
/**
 * Starts a deployment on Coolify.
 */
export declare function startDeployment({ appUUID, coolifyToken, coolifyURL, logger, }: {
    appUUID: string;
    coolifyToken: string;
    coolifyURL: string;
    logger: Logger;
}): Promise<string>;
/**
 * Polls the deployment status until it completes, fails, or times out.
 */
export declare function pollDeploymentStatus({ deploymentUUID, coolifyToken, coolifyURL, timeout, logger, }: {
    deploymentUUID: string;
    coolifyToken: string;
    coolifyURL: string;
    timeout: number;
    logger: Logger;
}): Promise<void>;
interface AppDetails {
    fqdn: string;
    health_check_enabled: boolean;
    health_check_path: string;
    health_check_return_code: number;
    health_check_port: string | null;
    ports_exposes: string;
}
/**
 * Fetches application details from Coolify API.
 */
export declare function getAppDetails({ appUUID, coolifyToken, coolifyURL, logger, }: {
    appUUID: string;
    coolifyToken: string;
    coolifyURL: string;
    logger: Logger;
}): Promise<AppDetails>;
/**
 * Updates application healthcheck settings on Coolify.
 */
export declare function updateHealthcheck({ appUUID, coolifyToken, coolifyURL, healthcheckPath, healthcheckPort, portsExposes, logger, }: {
    appUUID: string;
    coolifyToken: string;
    coolifyURL: string;
    healthcheckPath: string;
    healthcheckPort?: string;
    portsExposes?: string;
    logger: Logger;
}): Promise<void>;
/**
 * Polls the healthcheck endpoint until it returns success or times out.
 */
export declare function verifyHealthcheck({ fqdn, healthcheckPath, timeout, logger, }: {
    fqdn: string;
    healthcheckPath: string;
    timeout: number;
    logger: Logger;
}): Promise<string>;
/**
 * Runs the complete deployment pipeline: find app, build image, deploy, healthcheck.
 */
export declare function deployApplication(params: DeployApplicationParams): Promise<DeployApplicationResult>;
export {};
//# sourceMappingURL=deploy.d.ts.map