import { jest } from "@jest/globals";
import type { WeaverProjectConfig } from "@weaver/shared/types";

export async function mockValidateDeps(prefix = "..") {
  // Mock registrations resolve relative to the calling test file
  jest.unstable_mockModule(`${prefix}/config/index`, () => ({
    readProjectConfig: jest.fn<() => WeaverProjectConfig | null>(),
    resolveTestRunners: jest.fn<() => string[]>(),
  }));

  jest.unstable_mockModule(`${prefix}/changed-files/index`, () => ({
    extractChangedFiles: jest.fn<() => string[]>(),
  }));

  jest.unstable_mockModule(`${prefix}/agent-tests/index`, () => ({
    extractAgentTestedDirs: jest.fn<() => string[]>(),
  }));

  jest.unstable_mockModule(`${prefix}/scope/index`, () => ({
    resolveTestDirs: jest.fn<() => string[]>(),
  }));

  // Dynamic imports resolve relative to this helper file
  const config = await import("../config/index");
  const changedFiles = await import("../changed-files/index");
  const agentTests = await import("../agent-tests/index");
  const scope = await import("../scope/index");

  return {
    readProjectConfig: config.readProjectConfig as jest.MockedFunction<
      typeof config.readProjectConfig
    >,
    resolveTestRunners: config.resolveTestRunners as jest.MockedFunction<
      typeof config.resolveTestRunners
    >,
    extractChangedFiles:
      changedFiles.extractChangedFiles as jest.MockedFunction<
        typeof changedFiles.extractChangedFiles
      >,
    extractAgentTestedDirs:
      agentTests.extractAgentTestedDirs as jest.MockedFunction<
        typeof agentTests.extractAgentTestedDirs
      >,
    resolveTestDirs: scope.resolveTestDirs as jest.MockedFunction<
      typeof scope.resolveTestDirs
    >,
  };
}
