import { test, expect } from "../fixtures/app";
import { seedSession } from "../fixtures/seed";

async function waitForAppReady(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.waitForSelector("#root > *", { timeout: 10_000 });
  await new Promise((r) => setTimeout(r, 500));
}

async function pollUrl(
  page: import("@playwright/test").Page,
  predicate: (url: string) => boolean,
  retries = 10,
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    if (predicate(page.url())) {
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`URL never matched. Current: ${page.url()}`);
}

async function navigate(serverUrl: string, page: string): Promise<Response> {
  return fetch(`${serverUrl}/api/navigate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page }),
  });
}

async function view(serverUrl: string, pid: number): Promise<Response> {
  return fetch(`${serverUrl}/api/view`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pid }),
  });
}

test.describe("SSE navigation", () => {
  test("navigate to sessions", async ({ page, serverUrl }) => {
    await waitForAppReady(page);
    // First go to mini so we can verify navigating back to sessions
    await navigate(serverUrl, "mini");
    await pollUrl(page, (u) => u.includes("/mini"));

    await navigate(serverUrl, "sessions");
    await pollUrl(page, (u) => u.endsWith("/") || u.endsWith(":8143"));
    expect(page.url()).not.toContain("/mini");
  });

  test("navigate to mini", async ({ page, serverUrl }) => {
    await waitForAppReady(page);
    await navigate(serverUrl, "mini");
    await pollUrl(page, (u) => u.includes("/mini"));
    expect(page.url()).toContain("/mini");
  });

  test("view by PID", async ({ page, serverUrl, tmpDir }) => {
    await waitForAppReady(page);
    const session = await seedSession(tmpDir, { pid: 54321 });

    const res = await view(serverUrl, 54321);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sessionId).toBe(session.id);

    await pollUrl(page, (u) => u.includes(`/sessions/${session.id}`));
    expect(page.url()).toContain(`/sessions/${session.id}`);
  });

  test("view unknown PID returns 404", async ({ page, serverUrl }) => {
    await waitForAppReady(page);
    const urlBefore = page.url();

    const res = await view(serverUrl, 99999);
    expect(res.status).toBe(404);

    // URL should not change
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toBe(urlBefore);
  });

  test("navigate invalid page — no crash, URL unchanged", async ({
    page,
    serverUrl,
  }) => {
    await waitForAppReady(page);
    const urlBefore = page.url();

    const res = await navigate(serverUrl, "nonexistent");
    expect(res.status).toBe(200);

    // Client ignores unknown pages — URL stays the same
    await new Promise((r) => setTimeout(r, 500));
    expect(page.url()).toBe(urlBefore);
  });
});
