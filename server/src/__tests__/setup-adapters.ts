import { registerAdapter } from "@weaver/shared/adapter-registry";
import { kiroAdapter } from "@weaver/binding-kiro";
import { claudeCodeAdapter } from "@weaver/binding-claude-code";
import { piAdapter } from "@weaver/binding-pi";

registerAdapter(kiroAdapter);
registerAdapter(claudeCodeAdapter);
registerAdapter(piAdapter);
