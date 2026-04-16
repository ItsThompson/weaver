import { join } from "node:path";
import { homedir } from "node:os";

export const globalKiroDir = () => join(homedir(), ".kiro");
export const globalSkillsPath = () => join(globalKiroDir(), "skills");
