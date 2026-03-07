import { describe, it, expect, beforeEach } from '@jest/globals';
import { PassThrough } from 'node:stream';
import { createOutputController, type OutputController } from './output/index.js';

describe('OutputController', () => {
  let output: PassThrough;
  let ctrl: OutputController;
  let chunks: string[];

  beforeEach(() => {
    output = new PassThrough();
    chunks = [];
    output.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    ctrl = createOutputController(output);
  });

  function collected(): string {
    return chunks.join('');
  }

  describe('writeChunk', () => {
    it('writes text to output', () => {
      ctrl.writeChunk('hello');
      expect(collected()).toBe('hello');
    });

    it('accumulates multiple chunks', () => {
      ctrl.writeChunk('foo');
      ctrl.writeChunk('bar');
      expect(collected()).toBe('foobar');
    });
  });

  describe('endMessage', () => {
    it('writes a newline', () => {
      ctrl.writeChunk('text');
      ctrl.endMessage();
      expect(collected()).toBe('text\n');
    });
  });

  describe('showToolCall', () => {
    it('displays tool call with status and title', () => {
      ctrl.showToolCall({ toolCallId: 'tc1', title: 'Reading file', kind: 'read', status: 'in_progress' });
      expect(collected()).toContain('[in_progress]');
      expect(collected()).toContain('Reading file');
      expect(collected()).toContain('🔧');
    });
  });

  describe('updateToolCall', () => {
    it.each([
      { status: 'completed', icon: '✅' },
      { status: 'failed', icon: '❌' },
      { status: 'pending', icon: '⏳' },
      { status: 'weird', icon: '❓' },
    ])('displays $icon for status "$status"', ({ status, icon }) => {
      ctrl.updateToolCall('tc1', status);
      expect(collected()).toContain(icon);
      expect(collected()).toContain(`[${status}]`);
    });

    it('includes content suffix when provided', () => {
      ctrl.updateToolCall('tc1', 'completed', 'done');
      expect(collected()).toContain('done');
    });

    it('omits content suffix when not provided', () => {
      ctrl.updateToolCall('tc1', 'completed');
      expect(collected()).not.toContain('—');
    });
  });

  describe('showPlan', () => {
    it('displays numbered plan entries with status icons', () => {
      ctrl.showPlan([
        { content: 'First task', status: 'completed', priority: 'high' },
        { content: 'Second task', status: 'in_progress', priority: 'medium' },
        { content: 'Third task', status: 'pending', priority: 'low' },
      ]);
      const text = collected();
      expect(text).toContain('📋 Plan:');
      expect(text).toContain('1. ✅ First task');
      expect(text).toContain('2. ⚙️ Second task');
      expect(text).toContain('3. ⏳ Third task');
    });

    it('handles empty plan', () => {
      ctrl.showPlan([]);
      expect(collected()).toContain('📋 Plan:');
    });
  });

  describe('showSystem', () => {
    it('displays message with dim ANSI codes', () => {
      ctrl.showSystem('Mode changed to code');
      const text = collected();
      expect(text).toContain('Mode changed to code');
      expect(text).toContain('\x1b[2m');
      expect(text).toContain('\x1b[0m');
    });
  });

  describe('showError', () => {
    it('displays message with red ANSI codes', () => {
      ctrl.showError('Something went wrong');
      const text = collected();
      expect(text).toContain('Something went wrong');
      expect(text).toContain('\x1b[31m');
      expect(text).toContain('\x1b[0m');
    });
  });

  describe('clear', () => {
    it('writes clear screen ANSI sequence', () => {
      ctrl.clear();
      const text = collected();
      expect(text).toContain('\x1b[2J');
      expect(text).toContain('\x1b[H');
    });
  });
});
