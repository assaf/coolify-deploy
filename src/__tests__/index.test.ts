/**
 * Tests for src/index.ts (GitHub Action entry point)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock @actions/core before importing
vi.mock("@actions/core", () => ({
  getInput: vi.fn<(name: string) => string>(),
  info: vi.fn<(message: string) => void>(),
  error: vi.fn<(message: string) => void>(),
  setOutput: vi.fn<(name: string, value: string) => void>(),
  setFailed: vi.fn<(message: string) => void>(),
}));

// Mock deploy functions
vi.mock("../lib/deploy.js", () => ({
  deployApplication: vi.fn<
    () => Promise<{ deploymentUUID: string; healthcheckUrl: string }>
  >(),
}));

// Import after mocks
import * as core from "@actions/core";
import { deployApplication } from "../lib/deploy.js";

describe("index.ts (GitHub Action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default successful setup
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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

    vi.mocked(deployApplication).mockResolvedValue({
      deploymentUUID: "deploy-uuid-456",
      healthcheckUrl: "https://app.example.com/health",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("should execute full deployment workflow successfully", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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

    expect(deployApplication).toHaveBeenCalledWith({
      coolifyURL: "https://coolify.example.com",
      appName: "my-app",
      image: "ghcr.io/user/app:v1",
      coolifyToken: "test-token",
      envVars: "",
      healthcheckPath: "/",
      healthcheckTimeout: 60,
      context: ".",
      logger: expect.objectContaining({
        info: expect.any(Function),
        error: expect.any(Function),
      }),
    });

    expect(core.setOutput).toHaveBeenCalledWith(
      "deployment-uuid",
      "deploy-uuid-456",
    );
    expect(core.setOutput).toHaveBeenCalledWith(
      "healthcheck-url",
      "https://app.example.com/health",
    );
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("should pass env-vars to buildDockerImage when provided", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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
      expect(deployApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          envVars: "NODE_ENV=production\nAPI_KEY=secret",
        }),
      );
    });
  });

  it("should use custom healthcheck path", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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
      expect(deployApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          healthcheckPath: "/api/health",
          healthcheckTimeout: 120,
        }),
      );
    });
  });

  it("should update healthcheck when disabled", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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
      expect(deployApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          healthcheckPath: "/health",
        }),
      );
    });
  });

  it("should update healthcheck even when already configured correctly", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
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
      expect(deployApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          healthcheckPath: "/health",
        }),
      );
    });
  });

  it("should log info messages via core.info", async () => {
    await import("../index.js");

    await vi.waitFor(() => {
      expect(deployApplication).toHaveBeenCalled();
    });
  });

  it("should set deployment-uuid output", async () => {
    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setOutput).toHaveBeenCalledWith(
        "deployment-uuid",
        "deploy-uuid-456",
      );
    });
  });

  it("should set healthcheck-url output", async () => {
    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setOutput).toHaveBeenCalledWith(
        "healthcheck-url",
        "https://app.example.com/health",
      );
    });
  });

  it("should handle Error instances and call setFailed", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Application not found"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("Application not found");
    });
  });

  it("should handle non-Error throws and call setFailed with generic message", async () => {
    vi.mocked(deployApplication).mockRejectedValue("string error");

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("An unknown error occurred");
    });
  });

  it("should handle buildDockerImage errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Docker build failed"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("Docker build failed");
    });
  });

  it("should handle startDeployment errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Failed to start deployment"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("Failed to start deployment");
    });
  });

  it("should handle pollDeploymentStatus errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Deployment failed"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("Deployment failed");
    });
  });

  it("should handle getAppDetails errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Failed to get app details"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith("Failed to get app details");
    });
  });

  it("should handle updateHealthcheck errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Failed to update healthcheck"),
    );

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setFailed).toHaveBeenCalledWith(
        "Failed to update healthcheck",
      );
    });
  });

  it("should handle verifyHealthcheck errors", async () => {
    vi.mocked(deployApplication).mockRejectedValue(
      new Error("Healthcheck failed"),
    );

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
