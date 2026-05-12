/**
 * Tests for src/index.ts (GitHub Action entry point)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
// Mock @actions/core before importing
vi.mock("@actions/core", () => ({
    getInput: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    setOutput: vi.fn(),
    setFailed: vi.fn(),
}));
// Mock deploy functions
vi.mock("../lib/deploy.js", () => ({
    findAppUUID: vi.fn(),
    buildDockerImage: vi.fn(),
    startDeployment: vi.fn(),
    pollDeploymentStatus: vi.fn(),
    getAppDetails: vi.fn(),
    updateHealthcheck: vi.fn(),
    verifyHealthcheck: vi.fn(),
}));
// Import after mocks
import * as core from "@actions/core";
import { buildDockerImage, findAppUUID, startDeployment, pollDeploymentStatus, getAppDetails, updateHealthcheck, verifyHealthcheck, } from "../lib/deploy.js";
describe("index.ts (GitHub Action)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
        // Default successful setup
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "",
                "healthcheck-path": "/",
                "healthcheck-timeout": "60",
            };
            return inputs[name] ?? "";
        });
        vi.mocked(findAppUUID).mockResolvedValue("app-uuid-123");
        vi.mocked(buildDockerImage).mockResolvedValue();
        vi.mocked(startDeployment).mockResolvedValue("deploy-uuid-456");
        vi.mocked(pollDeploymentStatus).mockResolvedValue();
        vi.mocked(getAppDetails).mockResolvedValue({
            fqdn: "app.example.com",
            health_check_enabled: true,
            health_check_path: "/health",
            health_check_return_code: 200,
            health_check_port: null,
            ports_exposes: "3000",
        });
        vi.mocked(updateHealthcheck).mockResolvedValue();
        vi.mocked(verifyHealthcheck).mockResolvedValue("https://app.example.com/health");
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.resetModules();
    });
    it("should execute full deployment workflow successfully", async () => {
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "",
                "healthcheck-path": "/",
                "healthcheck-timeout": "60",
            };
            return inputs[name] ?? "";
        });
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.getInput).toHaveBeenCalledWith("coolify-url", {
                required: true,
            });
            expect(core.getInput).toHaveBeenCalledWith("app-name", {
                required: true,
            });
            expect(core.getInput).toHaveBeenCalledWith("image", { required: true });
            expect(core.getInput).toHaveBeenCalledWith("coolify-token", {
                required: true,
            });
            expect(core.getInput).toHaveBeenCalledWith("env-vars", {
                required: false,
            });
            expect(core.getInput).toHaveBeenCalledWith("healthcheck-path", {
                required: false,
            });
            expect(core.getInput).toHaveBeenCalledWith("healthcheck-timeout", {
                required: false,
            });
        });
        expect(findAppUUID).toHaveBeenCalledWith(expect.objectContaining({
            coolifyURL: "https://coolify.example.com",
            appName: "my-app",
            coolifyToken: "test-token",
        }));
        expect(buildDockerImage).toHaveBeenCalledWith(expect.objectContaining({
            image: "ghcr.io/user/app:v1",
            envVars: "",
        }));
        expect(startDeployment).toHaveBeenCalledWith(expect.objectContaining({
            appUUID: "app-uuid-123",
            coolifyToken: "test-token",
            coolifyURL: "https://coolify.example.com",
        }));
        expect(pollDeploymentStatus).toHaveBeenCalledWith(expect.objectContaining({
            deploymentUUID: "deploy-uuid-456",
            coolifyToken: "test-token",
            coolifyURL: "https://coolify.example.com",
            timeout: 600,
        }));
        expect(getAppDetails).toHaveBeenCalledWith(expect.objectContaining({
            appUUID: "app-uuid-123",
            coolifyToken: "test-token",
            coolifyURL: "https://coolify.example.com",
        }));
        expect(verifyHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
            fqdn: "app.example.com",
            healthcheckPath: "/health",
            timeout: 60,
        }));
        expect(core.setOutput).toHaveBeenCalledWith("deployment-uuid", "deploy-uuid-456");
        expect(core.setOutput).toHaveBeenCalledWith("healthcheck-url", "https://app.example.com/health");
        expect(core.setFailed).not.toHaveBeenCalled();
    });
    it("should pass env-vars to buildDockerImage when provided", async () => {
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "NODE_ENV=production\nAPI_KEY=secret",
                "healthcheck-path": "/",
                "healthcheck-timeout": "60",
            };
            return inputs[name] ?? "";
        });
        await import("../index.js");
        await vi.waitFor(() => {
            expect(buildDockerImage).toHaveBeenCalledWith(expect.objectContaining({
                envVars: "NODE_ENV=production\nAPI_KEY=secret",
            }));
        });
    });
    it("should use custom healthcheck path", async () => {
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "",
                "healthcheck-path": "/api/health",
                "healthcheck-timeout": "120",
            };
            return inputs[name] ?? "";
        });
        await import("../index.js");
        await vi.waitFor(() => {
            expect(updateHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
                healthcheckPath: "/api/health",
            }));
            expect(verifyHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
                healthcheckPath: "/api/health",
                timeout: 120,
            }));
        });
    });
    it("should update healthcheck when disabled", async () => {
        vi.mocked(getAppDetails).mockResolvedValue({
            fqdn: "app.example.com",
            health_check_enabled: false,
            health_check_path: "",
            health_check_return_code: 200,
            health_check_port: null,
            ports_exposes: "3000",
        });
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "",
                "healthcheck-path": "/health",
                "healthcheck-timeout": "60",
            };
            return inputs[name] ?? "";
        });
        await import("../index.js");
        await vi.waitFor(() => {
            expect(updateHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
                healthcheckPath: "/health",
            }));
        });
    });
    it("should update healthcheck even when already configured correctly", async () => {
        vi.mocked(getAppDetails).mockResolvedValue({
            fqdn: "app.example.com",
            health_check_enabled: true,
            health_check_path: "/health",
            health_check_return_code: 200,
            health_check_port: null,
            ports_exposes: "3000",
        });
        vi.mocked(core.getInput).mockImplementation((name) => {
            const inputs = {
                "coolify-url": "https://coolify.example.com",
                "app-name": "my-app",
                image: "ghcr.io/user/app:v1",
                "coolify-token": "test-token",
                "env-vars": "",
                "healthcheck-path": "/health",
                "healthcheck-timeout": "60",
            };
            return inputs[name] ?? "";
        });
        await import("../index.js");
        await vi.waitFor(() => {
            expect(updateHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
                healthcheckPath: "/health",
            }));
            expect(verifyHealthcheck).toHaveBeenCalledWith(expect.objectContaining({
                healthcheckPath: "/health",
            }));
        });
    });
    it("should log info messages via core.info", async () => {
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.info).toHaveBeenCalledWith(expect.stringContaining("Deploying ghcr.io/user/app:v1 to my-app at https://coolify.example.com"));
        });
    });
    it("should set deployment-uuid output", async () => {
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setOutput).toHaveBeenCalledWith("deployment-uuid", "deploy-uuid-456");
        });
    });
    it("should set healthcheck-url output", async () => {
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setOutput).toHaveBeenCalledWith("healthcheck-url", "https://app.example.com/health");
        });
    });
    it("should handle Error instances and call setFailed", async () => {
        vi.mocked(findAppUUID).mockRejectedValue(new Error("Application not found"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Application not found");
        });
    });
    it("should handle non-Error throws and call setFailed with generic message", async () => {
        vi.mocked(findAppUUID).mockRejectedValue("string error");
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("An unknown error occurred");
        });
    });
    it("should handle buildDockerImage errors", async () => {
        vi.mocked(buildDockerImage).mockRejectedValue(new Error("Docker build failed"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Docker build failed");
        });
    });
    it("should handle startDeployment errors", async () => {
        vi.mocked(startDeployment).mockRejectedValue(new Error("Failed to start deployment"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Failed to start deployment");
        });
    });
    it("should handle pollDeploymentStatus errors", async () => {
        vi.mocked(pollDeploymentStatus).mockRejectedValue(new Error("Deployment failed"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Deployment failed");
        });
    });
    it("should handle getAppDetails errors", async () => {
        vi.mocked(getAppDetails).mockRejectedValue(new Error("Failed to get app details"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Failed to get app details");
        });
    });
    it("should handle updateHealthcheck errors", async () => {
        vi.mocked(getAppDetails).mockResolvedValue({
            fqdn: "app.example.com",
            health_check_enabled: false,
            health_check_path: "",
            health_check_return_code: 200,
            health_check_port: null,
            ports_exposes: "3000",
        });
        vi.mocked(updateHealthcheck).mockRejectedValue(new Error("Failed to update healthcheck"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Failed to update healthcheck");
        });
    });
    it("should handle verifyHealthcheck errors", async () => {
        vi.mocked(verifyHealthcheck).mockRejectedValue(new Error("Healthcheck failed"));
        await import("../index.js");
        await vi.waitFor(() => {
            expect(core.setFailed).toHaveBeenCalledWith("Healthcheck failed");
        });
    });
    it("should require all mandatory inputs", async () => {
        await import("../index.js");
        // Verify all required inputs were requested
        const requiredInputs = [
            "coolify-url",
            "app-name",
            "image",
            "coolify-token",
        ];
        requiredInputs.forEach((input) => {
            expect(core.getInput).toHaveBeenCalledWith(input, { required: true });
        });
        // Verify optional inputs were requested
        expect(core.getInput).toHaveBeenCalledWith("env-vars", { required: false });
        expect(core.getInput).toHaveBeenCalledWith("healthcheck-path", {
            required: false,
        });
        expect(core.getInput).toHaveBeenCalledWith("healthcheck-timeout", {
            required: false,
        });
    });
});
//# sourceMappingURL=index.test.js.map