/**
 * Tests for src/__tests__/deploy.test.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import {
  findAppUUID,
  buildDockerImage,
  startDeployment,
  pollDeploymentStatus,
} from "../lib/deploy.js";

// Mock child_process spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Create a mock logger
function createMockLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
  };
}

describe("deploy.ts", () => {
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockLogger = createMockLogger();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("findAppUUID", () => {
    it("should find application UUID successfully", async () => {
      const mockResponse = [
        { uuid: "app-uuid-1", name: "app-one" },
        { uuid: "app-uuid-2", name: "app-two" },
      ];

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      const result = await findAppUUID({
        coolifyURL: "https://coolify.example.com",
        appName: "app-two",
        coolifyToken: "test-token",
        logger: mockLogger,
      });

      expect(result).toBe("app-uuid-2");
      expect(fetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/applications",
        { headers: { Authorization: "Bearer test-token" } }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Finding application UUID for "app-two"...');
      expect(mockLogger.info).toHaveBeenCalledWith("Found application UUID: app-uuid-2");
    });

    it("should throw error when API request fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Unauthorized",
      }));

      await expect(findAppUUID({
        coolifyURL: "https://coolify.example.com",
        appName: "app-one",
        coolifyToken: "invalid-token",
        logger: mockLogger,
      })).rejects.toThrow("Failed to find application: Unauthorized");
    });

    it("should throw error when application name not found", async () => {
      const mockResponse = [
        { uuid: "app-uuid-1", name: "existing-app" },
      ];

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      await expect(findAppUUID({
        coolifyURL: "https://coolify.example.com",
        appName: "nonexistent-app",
        coolifyToken: "test-token",
        logger: mockLogger,
      })).rejects.toThrow(
        'No application found with name "nonexistent-app"\nAvailable applications: existing-app'
      );
    });

    it("should handle empty application list", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }));

      await expect(findAppUUID({
        coolifyURL: "https://coolify.example.com",
        appName: "any-app",
        coolifyToken: "test-token",
        logger: mockLogger,
      })).rejects.toThrow('No application found with name "any-app"');
    });
  });

  describe("buildDockerImage", () => {
    it("should build and push Docker image successfully without env vars", async () => {
      const mockChild = {
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === "close") callback(0);
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await buildDockerImage({
        image: "ghcr.io/user/app:v1",
        logger: mockLogger,
      });

      expect(spawn).toHaveBeenCalledWith("docker", [
        "buildx", "build", "--platform", "linux/amd64", "--push", "-t",
        "ghcr.io/user/app:v1", ".",
      ], { stdio: ["inherit", "inherit", "inherit"] });
      expect(mockChild.stdin?.write).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("Building Docker image...");
      expect(mockLogger.info).toHaveBeenCalledWith("Docker image built and pushed successfully");
    });

    it("should build and push Docker image with env vars", async () => {
      const mockChild = {
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === "close") callback(0);
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      const envVars = "NODE_ENV=production\nAPI_KEY=secret";

      await buildDockerImage({
        image: "ghcr.io/user/app:v1",
        envVars,
        logger: mockLogger,
      });

      expect(spawn).toHaveBeenCalledWith("docker", [
        "buildx", "build", "--platform", "linux/amd64", "--push", "-t",
        "ghcr.io/user/app:v1", ".",
        "--secret", "id=dotenv,src=/dev/stdin",
      ], { stdio: ["pipe", "inherit", "inherit"] });
      expect(mockChild.stdin?.write).toHaveBeenCalledWith(envVars);
      expect(mockChild.stdin?.end).toHaveBeenCalled();
    });

    it("should throw error when docker command fails", async () => {
      const mockChild = {
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event: string, callback: (code?: number) => void) => {
          if (event === "close") callback(1);
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(buildDockerImage({
        image: "ghcr.io/user/app:v1",
        logger: mockLogger,
      })).rejects.toThrow("Command failed with code 1");
    });

    it("should throw error when spawn encounters an error", async () => {
      const mockChild = {
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn((event: string, callback: (err?: Error) => void) => {
          if (event === "error") callback(new Error("spawn error"));
        }),
      };

      vi.mocked(spawn).mockReturnValue(mockChild as unknown as ReturnType<typeof spawn>);

      await expect(buildDockerImage({
        image: "ghcr.io/user/app:v1",
        logger: mockLogger,
      })).rejects.toThrow("spawn error");
    });
  });

  describe("startDeployment", () => {
    it("should start deployment successfully", async () => {
      const mockResponse = {
        deployments: [{ deployment_uuid: "deploy-123" }],
      };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      const result = await startDeployment({
        appUUID: "app-uuid-1",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        logger: mockLogger,
      });

      expect(result).toBe("deploy-123");
      expect(fetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deploy?type=application&uuid=app-uuid-1",
        {
          method: "POST",
          headers: { Authorization: "Bearer test-token" },
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith("Starting deployment...");
      expect(mockLogger.info).toHaveBeenCalledWith("Deployment started with UUID: deploy-123");
    });

    it("should throw error when API request fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Forbidden",
      }));

      await expect(startDeployment({
        appUUID: "app-uuid-1",
        coolifyToken: "invalid-token",
        coolifyURL: "https://coolify.example.com",
        logger: mockLogger,
      })).rejects.toThrow("Failed to trigger deployment: Forbidden");
    });

    it("should throw error when response has no deployment UUID", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ deployments: [] }),
      }));

      await expect(startDeployment({
        appUUID: "app-uuid-1",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        logger: mockLogger,
      })).rejects.toThrow("No deployment UUID in response");
    });

    it("should throw error when deployments is undefined", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }));

      await expect(startDeployment({
        appUUID: "app-uuid-1",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        logger: mockLogger,
      })).rejects.toThrow("No deployment UUID in response");
    });
  });

  describe("pollDeploymentStatus", () => {
    it("should return successfully when deployment finishes", async () => {
      const mockResponse = { status: "finished" };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      await pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://coolify.example.com/api/v1/deployments/deploy-123",
        { headers: { Authorization: "Bearer test-token" } }
      );
      expect(mockLogger.info).toHaveBeenCalledWith("Monitoring deployment status...");
      expect(mockLogger.info).toHaveBeenCalledWith("✓ Deployment completed successfully");
    });

    it("should return successfully when deployment status is success", async () => {
      const mockResponse = { status: "success" };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      await pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      });

      expect(mockLogger.info).toHaveBeenCalledWith("✓ Deployment completed successfully");
    });

    it("should throw error when deployment fails", async () => {
      const mockResponse = { status: "failed", error: "Build error" };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      await expect(pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      })).rejects.toThrow('Deployment failed with status: failed');
    });

    it("should throw error when deployment status is error", async () => {
      const mockResponse = { status: "error", message: "Unknown error" };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      await expect(pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      })).rejects.toThrow('Deployment failed with status: error');
    });

    it("should continue polling while in progress", async () => {
      const responses = [
        { status: "in_progress" },
        { status: "in_progress" },
        { status: "finished" },
      ];

      let callCount = 0;
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
        const response = responses[callCount++];
        return {
          ok: true,
          json: async () => response,
        };
      }));

      const pollPromise = pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      });

      // Let the timers run
      await vi.runAllTimersAsync();
      await pollPromise;

      expect(fetch).toHaveBeenCalledTimes(3);
      expect(mockLogger.info).toHaveBeenCalledWith("✓ Deployment completed successfully");
    });

    it("should throw error on timeout when status never finishes", async () => {
      const mockResponse = { status: "in_progress" };

      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      }));

      // Start polling
      let error: unknown;
      const pollPromise = pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 1, // 1 second timeout
        logger: mockLogger,
      }).catch((e: unknown) => {
        error = e;
      });

      // Run all timers, allowing the timeout to occur
      await vi.runAllTimersAsync();
      await pollPromise;

      // Check that the timeout error was thrown
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("Deployment timed out after 1 seconds");
    });

    it("should throw error when status API fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Not Found",
      }));

      await expect(pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      })).rejects.toThrow("Failed to get deployment status: Not Found");
    });

    it("should show spinner while polling", async () => {
      const responses = [
        { status: "in_progress" },
        { status: "finished" },
      ];

      let callCount = 0;
      vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
        const response = responses[callCount++];
        return {
          ok: true,
          json: async () => response,
        };
      }));

      const pollPromise = pollDeploymentStatus({
        deploymentUUID: "deploy-123",
        coolifyToken: "test-token",
        coolifyURL: "https://coolify.example.com",
        timeout: 600,
        logger: mockLogger,
      });

      await vi.runAllTimersAsync();
      await pollPromise;

      // Check that spinner logs were called
      const infoCalls = mockLogger.info.mock.calls;
      const spinnerCall = infoCalls.find((call) => 
        call[0].includes("Waiting for deployment")
      );
      expect(spinnerCall).toBeDefined();
    });
  });
});