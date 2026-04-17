import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import { claudeCodeAdapter } from "@weaver/binding-claude-code";

registerAdapter(kiroAdapter);
registerAdapter(claudeCodeAdapter);
