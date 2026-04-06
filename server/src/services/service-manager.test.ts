import {
  createServiceManager,
  type ServiceManagerDeps,
} from "./service-manager";
import { DEFAULT_CONFIG, type WeaverConfig } from "@weaver/shared/types";

vi.mock("../utils/logger", () => ({ log: vi.fn() }));

function makeDeps(
  overrides: Partial<ServiceManagerDeps> = {},
): ServiceManagerDeps {
  return {
    startWhisper: vi.fn(),
    waitForWhisperReady: vi.fn().mockResolvedValue(true),
    isWhisperRunning: vi.fn().mockResolvedValue(true),
    stopWhisper: vi.fn(),
    ensureOllamaRunning: vi.fn().mockResolvedValue(true),
    checkOllamaHealth: vi.fn().mockResolvedValue(true),
    stopOllama: vi.fn(),
    getDefaultModelPath: vi.fn().mockResolvedValue("/models/ggml-base.bin"),
    readConfig: vi.fn().mockResolvedValue({
      config: { ...DEFAULT_CONFIG, enable_dictation: true },
    }),
    ...overrides,
  };
}

function enabledConfig(overrides: Partial<WeaverConfig> = {}): WeaverConfig {
  return { ...DEFAULT_CONFIG, enable_dictation: true, ...overrides };
}

describe("createServiceManager", () => {
  describe("start", () => {
    it("starts whisper and ollama when dictation is enabled with llm_cleanup", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());

      expect(deps.startWhisper).toHaveBeenCalledWith("/models/ggml-base.bin");
      expect(deps.ensureOllamaRunning).toHaveBeenCalledWith(
        "http://localhost:11434",
      );
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("running");
      expect(status.services.ollama.state).toBe("running");
      expect(status.ready).toBe(true);
    });

    it("sets whisper to not_configured when no model exists", async () => {
      const deps = makeDeps({
        getDefaultModelPath: vi.fn().mockResolvedValue(null),
      });
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());

      expect(deps.startWhisper).not.toHaveBeenCalled();
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("not_configured");
      expect(status.ready).toBe(true);
    });

    it("sets ollama to not_configured when llm_cleanup is false", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(
        enabledConfig({
          dictation: { ...DEFAULT_CONFIG.dictation, llm_cleanup: false },
        }),
      );

      expect(deps.ensureOllamaRunning).not.toHaveBeenCalled();
      const status = await manager.getStatus();
      expect(status.services.ollama.state).toBe("not_configured");
    });

    it("sets both to not_configured when enable_dictation is false", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start({ ...DEFAULT_CONFIG });

      expect(deps.startWhisper).not.toHaveBeenCalled();
      expect(deps.ensureOllamaRunning).not.toHaveBeenCalled();
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("not_configured");
      expect(status.services.ollama.state).toBe("not_configured");
      expect(status.ready).toBe(true);
    });

    it("sets whisper to error when waitForWhisperReady returns false", async () => {
      const deps = makeDeps({
        waitForWhisperReady: vi.fn().mockResolvedValue(false),
      });
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());

      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("error");
      expect(status.services.whisper.error).toBe("Whisper failed to start");
      expect(status.ready).toBe(true); // error is terminal
    });

    it("sets ollama to error when ensureOllamaRunning returns false", async () => {
      const deps = makeDeps({
        ensureOllamaRunning: vi.fn().mockResolvedValue(false),
      });
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());

      const status = await manager.getStatus();
      expect(status.services.ollama.state).toBe("error");
      expect(status.services.ollama.error).toBe("Ollama failed to start");
    });
  });

  describe("stop", () => {
    it("stops all services and resets state", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());
      await manager.stop();

      expect(deps.stopWhisper).toHaveBeenCalled();
      expect(deps.stopOllama).toHaveBeenCalled();
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("stopped");
      expect(status.services.ollama.state).toBe("stopped");
    });
  });

  describe("getStatus", () => {
    it("returns ready false when a service is starting", async () => {
      let resolveWhisper!: (value: boolean) => void;
      const deps = makeDeps({
        waitForWhisperReady: vi.fn().mockReturnValue(
          new Promise<boolean>((resolve) => {
            resolveWhisper = resolve;
          }),
        ),
      });
      const manager = createServiceManager(deps);

      const startPromise = manager.start(enabledConfig());

      // While whisper is starting, ready should be false
      // We need to wait a tick for the start to begin
      await new Promise((resolve) => setTimeout(resolve, 0));
      const status = await manager.getStatus();
      expect(status.ready).toBe(false);
      expect(status.services.whisper.state).toBe("starting");

      resolveWhisper(true);
      await startPromise;
    });

    it("detects crashed whisper via liveness check", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());
      (deps.isWhisperRunning as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );

      await manager.checkHealth();
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("error");
      expect(status.services.whisper.error).toBe(
        "Whisper process exited unexpectedly",
      );
    });

    it("detects crashed ollama via health check", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());
      (deps.checkOllamaHealth as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );

      await manager.checkHealth();
      const status = await manager.getStatus();
      expect(status.services.ollama.state).toBe("error");
      expect(status.services.ollama.error).toBe(
        "Ollama is no longer reachable",
      );
    });

    it("does not mutate state without checkHealth", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());
      (deps.isWhisperRunning as ReturnType<typeof vi.fn>).mockResolvedValue(
        false,
      );

      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("running");
    });
  });

  describe("serialization", () => {
    it("serializes concurrent start calls", async () => {
      const callOrder: string[] = [];
      const deps = makeDeps({
        startWhisper: vi.fn(() => {
          callOrder.push("start1");
        }),
        waitForWhisperReady: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          callOrder.push("ready1");
          return true;
        }),
      });
      const manager = createServiceManager(deps);

      const first = manager.start(enabledConfig());
      const second = manager.start(enabledConfig());

      await Promise.all([first, second]);

      // Both should complete without interleaving
      expect(deps.startWhisper).toHaveBeenCalledTimes(2);
    });
  });

  describe("startWhisperIfReady", () => {
    it("starts whisper when conditions are met", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.startWhisperIfReady();

      expect(deps.startWhisper).toHaveBeenCalledWith("/models/ggml-base.bin");
      const status = await manager.getStatus();
      expect(status.services.whisper.state).toBe("running");
    });

    it("does nothing when enable_dictation is false", async () => {
      const deps = makeDeps({
        readConfig: vi
          .fn()
          .mockResolvedValue({ config: { ...DEFAULT_CONFIG } }),
      });
      const manager = createServiceManager(deps);

      await manager.startWhisperIfReady();

      expect(deps.startWhisper).not.toHaveBeenCalled();
    });

    it("does nothing when no model exists", async () => {
      const deps = makeDeps({
        getDefaultModelPath: vi.fn().mockResolvedValue(null),
      });
      const manager = createServiceManager(deps);

      await manager.startWhisperIfReady();

      expect(deps.startWhisper).not.toHaveBeenCalled();
    });

    it("does nothing when whisper is already running", async () => {
      const deps = makeDeps();
      const manager = createServiceManager(deps);

      await manager.start(enabledConfig());
      (deps.startWhisper as ReturnType<typeof vi.fn>).mockClear();

      await manager.startWhisperIfReady();

      expect(deps.startWhisper).not.toHaveBeenCalled();
    });
  });
});
