import type { PlanEntry } from '@agentclientprotocol/sdk';

export interface ToolCallDisplay {
  toolCallId: string;
  title: string;
  kind: string;
  status: string;
}

export interface OutputController {
  writeChunk(text: string): void;
  endMessage(): void;
  showToolCall(toolCall: ToolCallDisplay): void;
  updateToolCall(toolCallId: string, status: string, content?: string): void;
  showPlan(entries: PlanEntry[]): void;
  showSystem(message: string): void;
  showError(message: string): void;
  clear(): void;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '⏳',
  in_progress: '⚙️',
  completed: '✅',
  failed: '❌',
};

function statusIcon(status: string): string {
  return STATUS_ICONS[status] ?? '❓';
}

export function createOutputController(output: NodeJS.WritableStream = process.stdout): OutputController {
  return {
    writeChunk(text: string): void {
      output.write(text);
    },

    endMessage(): void {
      output.write('\n');
    },

    showToolCall(toolCall: ToolCallDisplay): void {
      output.write(`\n🔧 [${toolCall.status}] ${toolCall.title}\n`);
    },

    updateToolCall(_toolCallId: string, status: string, content?: string): void {
      const icon = statusIcon(status);
      const suffix = content ? ` — ${content}` : '';
      output.write(`${icon} [${status}]${suffix}\n`);
    },

    showPlan(entries: PlanEntry[]): void {
      output.write('\n📋 Plan:\n');
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const icon = statusIcon(entry.status);
        output.write(`  ${i + 1}. ${icon} ${entry.content}\n`);
      }
      output.write('\n');
    },

    showSystem(message: string): void {
      output.write(`\x1b[2m${message}\x1b[0m\n`);
    },

    showError(message: string): void {
      output.write(`\x1b[31m${message}\x1b[0m\n`);
    },

    clear(): void {
      output.write('\x1b[2J\x1b[H');
    },
  };
}
