import type { SlashCommand, CommandContext } from './types.js';

export class CommandRegistry {
  private commands = new Map<string, SlashCommand>();

  register(command: SlashCommand): void {
    this.commands.set(command.name, command);
  }

  get(name: string): SlashCommand | undefined {
    return this.commands.get(name);
  }

  getAll(): SlashCommand[] {
    return [...this.commands.values()];
  }

  findByShortcut(key: string, ctrl: boolean, shift: boolean): SlashCommand | undefined {
    for (const cmd of this.commands.values()) {
      if (!cmd.shortcut) continue;
      if (
        cmd.shortcut.key === key &&
        (cmd.shortcut.ctrl ?? false) === ctrl &&
        (cmd.shortcut.shift ?? false) === shift
      ) {
        return cmd;
      }
    }
    return undefined;
  }

  async handleInput(input: string, context: CommandContext): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) return false;

    const spaceIndex = trimmed.indexOf(' ');
    const name = spaceIndex === -1 ? trimmed.slice(1) : trimmed.slice(1, spaceIndex);
    const args = spaceIndex === -1 ? '' : trimmed.slice(spaceIndex + 1).trim();

    const command = this.commands.get(name);
    if (!command) return false;

    await command.handler(args, context);
    return true;
  }
}
