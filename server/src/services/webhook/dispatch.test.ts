import { dispatchWebhook } from "./dispatch";

vi.mock("../../utils/logger", () => ({ log: vi.fn() }));

const mockFetch = vi.fn<() => Promise<Response>>();
globalThis.fetch = mockFetch as any;

describe("dispatchWebhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok with status on success", async () => {
    mockFetch.mockResolvedValue(new Response("ok", { status: 200 }));
    const result = await dispatchWebhook("https://example.com", { text: "hi" });
    expect(result).toEqual({ ok: true, status: 200 });
  });

  it("returns not ok with status on HTTP error", async () => {
    mockFetch.mockResolvedValue(new Response("fail", { status: 500 }));
    const result = await dispatchWebhook("https://example.com", { text: "hi" });
    expect(result).toEqual({ ok: false, status: 500 });
  });

  it("returns not ok with error string on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("network down"));
    const result = await dispatchWebhook("https://example.com", { text: "hi" });
    expect(result).toEqual({ ok: false, error: "Error: network down" });
  });
});
