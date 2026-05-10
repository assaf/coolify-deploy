/**
 * Tests for src/__tests__/deploy.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import { findAppUUID, buildDockerImage, startDeployment, pollDeploymentStatus, getAppDetails, updateHealthcheck, verifyHealthcheck, } from "../lib/deploy.js";
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
    let mockLogger;
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
            expect(fetch).toHaveBeenCalledWith(expect.any(URL), {
                headers: { Authorization: "Bearer test-token" },
            });
            expect(fetch.mock.calls[0][0].toString()).toBe("https://coolify.example.com/api/v1/applications");
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
            const mockResponse = [{ uuid: "app-uuid-1", name: "existing-app" }];
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            }));
            await expect(findAppUUID({
                coolifyURL: "https://coolify.example.com",
                appName: "nonexistent-app",
                coolifyToken: "test-token",
                logger: mockLogger,
            })).rejects.toThrow('No application found with name "nonexistent-app"\nAvailable applications: existing-app');
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
                on: vi.fn((event, callback) => {
                    if (event === "close")
                        callback(0);
                }),
            };
            vi.mocked(spawn).mockReturnValue(mockChild);
            await buildDockerImage({
                image: "ghcr.io/user/app:v1",
                logger: mockLogger,
                context: ".",
            });
            expect(spawn).toHaveBeenCalledWith("docker", [
                "buildx",
                "build",
                "--platform",
                "linux/amd64",
                "--push",
                "-t",
                "ghcr.io/user/app:v1",
                ".",
            ], { stdio: ["inherit", "inherit", "inherit"] });
            expect(mockChild.stdin?.write).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith("Building Docker image...");
            expect(mockLogger.info).toHaveBeenCalledWith("Docker image built and pushed successfully");
        });
        it("should build and push Docker image with env vars", async () => {
            const mockChild = {
                stdin: { write: vi.fn(), end: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === "close")
                        callback(0);
                }),
            };
            vi.mocked(spawn).mockReturnValue(mockChild);
            const envVars = "NODE_ENV=production\nAPI_KEY=secret";
            await buildDockerImage({
                image: "ghcr.io/user/app:v1",
                envVars,
                logger: mockLogger,
                context: ".",
            });
            expect(spawn).toHaveBeenCalledWith("docker", [
                "buildx",
                "build",
                "--platform",
                "linux/amd64",
                "--push",
                "-t",
                "ghcr.io/user/app:v1",
                ".",
                "--secret",
                "id=env,src=/dev/stdin",
            ], { stdio: ["pipe", "inherit", "inherit"] });
            expect(mockChild.stdin?.write).toHaveBeenCalledWith(envVars);
            expect(mockChild.stdin?.end).toHaveBeenCalled();
        });
        it("should throw error when docker command fails", async () => {
            const mockChild = {
                stdin: { write: vi.fn(), end: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === "close")
                        callback(1);
                }),
            };
            vi.mocked(spawn).mockReturnValue(mockChild);
            await expect(buildDockerImage({
                image: "ghcr.io/user/app:v1",
                logger: mockLogger,
                context: ".",
            })).rejects.toThrow("Command failed with code 1");
        });
        it("should throw error when spawn encounters an error", async () => {
            const mockChild = {
                stdin: { write: vi.fn(), end: vi.fn() },
                on: vi.fn((event, callback) => {
                    if (event === "error")
                        callback(new Error("spawn error"));
                }),
            };
            vi.mocked(spawn).mockReturnValue(mockChild);
            await expect(buildDockerImage({
                image: "ghcr.io/user/app:v1",
                logger: mockLogger,
                context: ".",
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
            expect(fetch).toHaveBeenCalledWith(expect.any(URL), {
                method: "POST",
                headers: { Authorization: "Bearer test-token" },
            });
            expect(fetch.mock.calls[0][0].toString()).toBe("https://coolify.example.com/api/v1/deploy?type=application&uuid=app-uuid-1");
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
            expect(fetch).toHaveBeenCalledWith(expect.any(URL), {
                headers: { Authorization: "Bearer test-token" },
            });
            expect(fetch.mock.calls[0][0].toString()).toBe("https://coolify.example.com/api/v1/deployments/deploy-123");
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
            })).rejects.toThrow("Deployment failed with status: failed");
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
            })).rejects.toThrow("Deployment failed with status: error");
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
            let error;
            const pollPromise = pollDeploymentStatus({
                deploymentUUID: "deploy-123",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                timeout: 1, // 1 second timeout
                logger: mockLogger,
            }).catch((e) => {
                error = e;
            });
            // Run all timers, allowing the timeout to occur
            await vi.runAllTimersAsync();
            await pollPromise;
            // Check that the timeout error was thrown
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Deployment timed out after 1 seconds");
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
            const responses = [{ status: "in_progress" }, { status: "finished" }];
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
            const spinnerCall = infoCalls.find((call) => call[0].includes("Waiting for deployment"));
            expect(spinnerCall).toBeDefined();
        });
    });
    describe("getAppDetails", () => {
        it("should fetch application details successfully", async () => {
            const mockResponse = {
                fqdn: "app.example.com",
                health_check_enabled: true,
                health_check_path: "/health",
                health_check_return_code: 200,
            };
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            }));
            const result = await getAppDetails({
                appUUID: "app-uuid-1",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                logger: mockLogger,
            });
            expect(result).toEqual(mockResponse);
            expect(fetch).toHaveBeenCalledWith(expect.any(URL), {
                headers: { Authorization: "Bearer test-token" },
            });
            expect(fetch.mock.calls[0][0].toString()).toBe("https://coolify.example.com/api/v1/applications/app-uuid-1");
            expect(mockLogger.info).toHaveBeenCalledWith("Fetching application details...");
            expect(mockLogger.info).toHaveBeenCalledWith("Application FQDN: app.example.com");
            expect(mockLogger.info).toHaveBeenCalledWith("Healthcheck: enabled at /health");
        });
        it("should handle disabled healthcheck", async () => {
            const mockResponse = {
                fqdn: "app.example.com",
                health_check_enabled: false,
                health_check_path: "",
                health_check_return_code: 200,
            };
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockResponse,
            }));
            const result = await getAppDetails({
                appUUID: "app-uuid-1",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                logger: mockLogger,
            });
            expect(result.health_check_enabled).toBe(false);
            expect(mockLogger.info).toHaveBeenCalledWith("Healthcheck: disabled at /");
        });
        it("should throw error when API request fails", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                statusText: "Not Found",
            }));
            await expect(getAppDetails({
                appUUID: "app-uuid-1",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                logger: mockLogger,
            })).rejects.toThrow("Failed to fetch application details: Not Found");
        });
    });
    describe("updateHealthcheck", () => {
        it("should update healthcheck configuration successfully", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
            }));
            await updateHealthcheck({
                appUUID: "app-uuid-1",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                healthcheckPath: "/health",
                logger: mockLogger,
            });
            expect(fetch).toHaveBeenCalledWith(expect.any(URL), {
                method: "PATCH",
                headers: {
                    Authorization: "Bearer test-token",
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    health_check_enabled: true,
                    health_check_path: "/health",
                    health_check_port: "3000",
                    ports_exposes: "3000",
                }),
            });
            expect(fetch.mock.calls[0][0].toString()).toBe("https://coolify.example.com/api/v1/applications/app-uuid-1");
            expect(mockLogger.info).toHaveBeenCalledWith("Setting healthcheck to /health on port 3000...");
            expect(mockLogger.info).toHaveBeenCalledWith("Healthcheck configuration updated successfully");
        });
        it("should throw error when API request fails", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                statusText: "Bad Request",
            }));
            await expect(updateHealthcheck({
                appUUID: "app-uuid-1",
                coolifyToken: "test-token",
                coolifyURL: "https://coolify.example.com",
                healthcheckPath: "/health",
                logger: mockLogger,
            })).rejects.toThrow("Failed to update healthcheck: Bad Request");
        });
    });
    describe("verifyHealthcheck", () => {
        it("should verify healthcheck successfully on first try", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
            }));
            const result = await verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/health",
                timeout: 60,
                logger: mockLogger,
            });
            expect(result).toBe("https://app.example.com/health");
            expect(mockLogger.info).toHaveBeenCalledWith("Verifying healthcheck at https://app.example.com/health");
            expect(mockLogger.info).toHaveBeenCalledWith("✓ Healthcheck passed: 200 OK");
        });
        it("should retry and succeed on second attempt", async () => {
            const responses = [
                { ok: false, status: 503, statusText: "Service Unavailable" },
                { ok: true, status: 200, statusText: "OK" },
            ];
            let callCount = 0;
            vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
                return responses[callCount++];
            }));
            const verifyPromise = verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/health",
                timeout: 60,
                logger: mockLogger,
            });
            await vi.runAllTimersAsync();
            const result = await verifyPromise;
            expect(result).toBe("https://app.example.com/health");
            expect(fetch).toHaveBeenCalledTimes(2);
        });
        it("should throw error on timeout with non-ok status", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: false,
                status: 503,
                statusText: "Service Unavailable",
            }));
            let error;
            const verifyPromise = verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/health",
                timeout: 1,
                logger: mockLogger,
            }).catch((e) => {
                error = e;
            });
            await vi.runAllTimersAsync();
            await verifyPromise;
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Healthcheck timed out after 1 seconds");
            expect(error.message).toContain("503 Service Unavailable");
        });
        it("should throw error on timeout with connection failure", async () => {
            vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));
            let error;
            const verifyPromise = verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/health",
                timeout: 1,
                logger: mockLogger,
            }).catch((e) => {
                error = e;
            });
            await vi.runAllTimersAsync();
            await verifyPromise;
            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain("Healthcheck timed out after 1 seconds");
            expect(error.message).toContain("Connection refused");
        });
        it("should show spinner while waiting", async () => {
            const responses = [
                { ok: false, status: 503, statusText: "Service Unavailable" },
                { ok: true, status: 200, statusText: "OK" },
            ];
            let callCount = 0;
            vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
                return responses[callCount++];
            }));
            const verifyPromise = verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/health",
                timeout: 60,
                logger: mockLogger,
            });
            await vi.runAllTimersAsync();
            await verifyPromise;
            const infoCalls = mockLogger.info.mock.calls;
            const spinnerCall = infoCalls.find((call) => call[0].includes("Waiting for healthcheck"));
            expect(spinnerCall).toBeDefined();
        });
        it("should use root path as default", async () => {
            vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: "OK",
            }));
            const result = await verifyHealthcheck({
                fqdn: "app.example.com",
                healthcheckPath: "/",
                timeout: 60,
                logger: mockLogger,
            });
            expect(result).toBe("https://app.example.com/");
        });
    });
});
//# sourceMappingURL=deploy.test.js.map