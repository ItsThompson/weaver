import { get, patch } from "../utils.js";
import type { WeaverConfig } from "@weaver/shared/types";

const TOGGLES: Record<string, keyof WeaverConfig> = {
  ghost: "ghost_mode",
  dark: "dark_mode",
  sounds: "enable_notification_sounds",
};

export function config(_pid: number, args: string[]): void {
  const sub = args[0];

  if (!sub) {
    console.error("Usage: weaver config <ghost|dark|sounds> [on|off]");
    process.exit(1);
  }

  if (sub === "ghost" && args[1] === "opacity") {
    return setOpacity(args[2]);
  }

  const field = TOGGLES[sub];
  if (!field) {
    console.error(
      `Unknown config: ${sub}\nUsage: weaver config <ghost|dark|sounds> [on|off]`,
    );
    process.exit(1);
  }

  const modifier = args[1];

  if (modifier === "on" || modifier === "off") {
    return applyPatch({ [field]: modifier === "on" }, field as string);
  }

  if (modifier) {
    console.error(`Unknown modifier: ${modifier}. Use "on" or "off".`);
    process.exit(1);
  }

  // Toggle: read current, flip, patch
  const { ok, status, data } = get("/api/config");
  if (status === 0) {
    return void console.log("Weaver server not running");
  }
  if (!ok) {
    return void console.log(`Weaver server error (${status})`);
  }

  const current = (data as { config: WeaverConfig }).config[field];
  applyPatch({ [field]: !current }, field as string);
}

function applyPatch(body: Record<string, unknown>, field: string): void {
  const { ok, status, data } = patch("/api/config", body);
  if (status === 0) {
    return void console.log("Weaver server not running");
  }
  if (status === 422) {
    return void console.log(
      `Invalid value: ${(data as { error: string }).error}`,
    );
  }
  if (!ok) {
    return void console.log(`Weaver server error (${status})`);
  }

  const config = (data as { config: WeaverConfig }).config;
  const label = field
    .replace(/_/g, " ")
    .replace(/\bmode\b/, "")
    .trim();
  console.log(
    `${label}: ${config[field as keyof WeaverConfig] ? "on" : "off"}`,
  );
}

function setOpacity(raw: string | undefined): void {
  if (!raw) {
    console.error("Usage: weaver config ghost opacity <0-1>");
    process.exit(1);
  }
  const val = parseFloat(raw);
  if (isNaN(val) || val < 0 || val > 1) {
    console.error("ghost_opacity must be a number between 0 and 1");
    process.exit(1);
  }
  const { ok, status } = patch("/api/config", { ghost_opacity: val });
  if (status === 0) {
    return void console.log("Weaver server not running");
  }
  if (!ok) {
    return void console.log(`Weaver server error (${status})`);
  }
  console.log(`ghost opacity: ${val}`);
}
