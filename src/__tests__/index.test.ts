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
}));

// Import after mocks
import * as core from "@actions/core";
import {
  buildDockerImage,
  findAppUUID,
  startDeployment,
  pollDeploymentStatus,
} from "../lib/deploy.js";

describe("index.ts (GitHub Action)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();

    // Default successful setup
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "coolify-url": "https://coolify.example.com",
        "app-name": "my-app",
        "image": "ghcr.io/user/app:v1",
        "coolify-token": "test-token",
        "env-vars": "",
      };
      return inputs[name] ?? "";
    });

    vi.mocked(findAppUUID).mockResolvedValue("app-uuid-123");
    vi.mocked(buildDockerImage).mockResolvedValue();
    vi.mocked(startDeployment).mockResolvedValue("deploy-uuid-456");
    vi.mocked(pollDeploymentStatus).mockResolvedValue();
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
        "image": "ghcr.io/user/app:v1",
        "coolify-token": "test-token",
        "env-vars": "",
      };
      return inputs[name] ?? "";
    });

    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.getInput).toHaveBeenCalledWith("coolify-url", { required: true });
      expect(core.getInput).toHaveBeenCalledWith("app-name", { required: true });
      expect(core.getInput).toHaveBeenCalledWith("image", { required: true });
      expect(core.getInput).toHaveBeenCalledWith("coolify-token", { required: true });
      expect(core.getInput).toHaveBeenCalledWith("env-vars", { required: false });
    });

    expect(findAppUUID).toHaveBeenCalledWith(expect.objectContaining({
      coolifyURL: "https://coolify.example.com",
      appName: "my-app",
      coolifyToken: "test-token",
      logger: expect.objectContaining({
        info: expect.any(Function),
        error: expect.any(Function),
      }),
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

    expect(core.setOutput).toHaveBeenCalledWith("deployment-uuid", "deploy-uuid-456");
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it("should pass env-vars to buildDockerImage when provided", async () => {
    vi.mocked(core.getInput).mockImplementation((name: string) => {
      const inputs: Record<string, string> = {
        "coolify-url": "https://coolify.example.com",
        "app-name": "my-app",
        "image": "ghcr.io/user/app:v1",
        "coolify-token": "test-token",
        "env-vars": "NODE_ENV=production\nAPI_KEY=secret",
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

  it("should log info messages via core.info", async () => {
    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.info).toHaveBeenCalledWith(
        expect.stringContaining("Deploying ghcr.io/user/app:v1 to my-app at https://coolify.example.com")
      );
    });
  });

  it("should set deployment-uuid output", async () => {
    await import("../index.js");

    await vi.waitFor(() => {
      expect(core.setOutput).toHaveBeenCalledWith("deployment-uuid", "deploy-uuid-456");
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

  it("should require all mandatory inputs", async () => {
    await import("../index.js");

    // Verify all required inputs were requested
    const requiredInputs = ["coolify-url", "app-name", "image", "coolify-token"];
    
    requiredInputs.forEach(input => {
      expect(core.getInput).toHaveBeenCalledWith(input, { required: true });
    });

    // Verify optional input was requested
    expect(core.getInput).toHaveBeenCalledWith("env-vars", { required: false });
  });
});