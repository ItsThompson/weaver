import { createInterface } from 'node:readline';
import type {
  RequestPermissionRequest,
  RequestPermissionResponse,
  PermissionOptionKind,
} from '@agentclientprotocol/sdk';

const KEY_TO_KIND: Record<string, PermissionOptionKind> = {
  y: 'allow_once',
  t: 'allow_always',
  n: 'reject_once',
};

export async function promptApproval(
  request: RequestPermissionRequest,
  input: NodeJS.ReadableStream = process.stdin,
  output: NodeJS.WritableStream = process.stdout,
): Promise<RequestPermissionResponse> {
  const { toolCall, options } = request;

  output.write(`\n🔐 Permission requested: ${toolCall.title ?? toolCall.toolCallId}\n`);
  if (toolCall.kind) output.write(`   Kind: ${toolCall.kind}\n`);
  if (toolCall.rawInput != null) {
    const inputStr = typeof toolCall.rawInput === 'string'
      ? toolCall.rawInput
      : JSON.stringify(toolCall.rawInput, null, 2);
    const lines = inputStr.split('\n');
    const preview = lines.length > 5 ? lines.slice(0, 5).join('\n') + '\n   ...' : inputStr;
    output.write(`   Input: ${preview}\n`);
  }

  const rl = createInterface({ input, output, terminal: false });

  output.write('Allow? [y]es / [n]o / [t]rust always > ');

  const answer = await new Promise<string>((resolve) => {
    rl.once('line', (line) => {
      rl.close();
      resolve(line.trim().toLowerCase());
    });
  });

  const key = answer.charAt(0);
  const targetKind = KEY_TO_KIND[key];

  if (!targetKind) {
    return { outcome: { outcome: 'cancelled' } };
  }

  const option = options.find((o) => o.kind === targetKind);
  if (!option) {
    return { outcome: { outcome: 'cancelled' } };
  }

  return { outcome: { outcome: 'selected', optionId: option.optionId } };
}
