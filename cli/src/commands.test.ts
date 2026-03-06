import { jest } from '@jest/globals';

jest.unstable_mockModule('./utils', () => ({
  post: jest.fn(),
  get: jest.fn(),
  patch: jest.fn(),
}));

const { post, get, patch } = await import('./utils.js');
const { view } = await import('./commands/view.js');
const { session } = await import('./commands/session.js');
const { rename } = await import('./commands/rename.js');
const { toggle } = await import('./commands/toggle.js');
const { config } = await import('./commands/config.js');

const mockPost = post as jest.MockedFunction<typeof post>;
const mockGet = get as jest.MockedFunction<typeof get>;
const mockPatch = patch as jest.MockedFunction<typeof patch>;
let logSpy: jest.SpiedFunction<typeof console.log>;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => logSpy.mockRestore());

describe('view', () => {
  it.each([
    [200, true, 'Opening session in Weaver dashboard'],
    [404, false, 'No Weaver session found for PID 12345'],
    [0, false, 'Weaver server not running'],
    [500, false, 'Weaver server error (500)'],
  ])('status %i → "%s"', (status, ok, expected) => {
    mockPost.mockReturnValue({ ok, status, data: null });
    view(12345, []);
    expect(mockPost).toHaveBeenCalledWith('/api/view', { pid: 12345 });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });
});

describe('session', () => {
  describe('list (default)', () => {
    it.each([
      [[], 'Opening sessions list in Weaver dashboard'],
      [['list'], 'Opening sessions list in Weaver dashboard'],
    ])('navigates to sessions list with args %j', (args, expected) => {
      mockPost.mockReturnValue({ ok: true, status: 200, data: null });
      session(12345, args);
      expect(mockPost).toHaveBeenCalledWith('/api/navigate', { page: 'sessions' });
      expect(logSpy).toHaveBeenCalledWith(expected);
    });

    it('prints server not running when status is 0', () => {
      mockPost.mockReturnValue({ ok: false, status: 0, data: null });
      session(12345, []);
      expect(logSpy).toHaveBeenCalledWith('Weaver server not running');
    });
  });

  describe('<PID>', () => {
    it.each([
      [200, true, 'Opening session for PID 67890 in Weaver dashboard'],
      [404, false, 'No session found for PID 67890'],
      [0, false, 'Weaver server not running'],
    ])('status %i → "%s"', (status, ok, expected) => {
      mockPost.mockReturnValue({ ok, status, data: null });
      session(12345, ['67890']);
      if (status === 200) {
        expect(mockPost).toHaveBeenCalledWith('/api/view', { pid: 67890 });
      }
      expect(logSpy).toHaveBeenCalledWith(expected);
    });
  });
});

describe('rename', () => {
  it.each([
    [200, true, 'Session renamed to "my feature"'],
    [404, false, 'No Weaver session found for PID 12345'],
    [0, false, 'Weaver server not running'],
    [500, false, 'Weaver server error (500)'],
  ])('status %i → "%s"', (status, ok, expected) => {
    mockPost.mockReturnValue({ ok, status, data: null });
    rename(12345, ['my', 'feature']);
    expect(mockPost).toHaveBeenCalledWith('/api/rename', { pid: 12345, customName: 'my feature' });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });

  it('exits with error when no name provided', () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    rename(12345, []);
    expect(errorSpy).toHaveBeenCalledWith('Usage: weaver rename <name>');
    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });
});

describe('toggle', () => {
  it.each([
    [200, true, 'Toggled Weaver mode'],
    [0, false, 'Weaver server not running'],
    [500, false, 'Weaver server error (500)'],
  ])('status %i → "%s"', (status, ok, expected) => {
    mockPost.mockReturnValue({ ok, status, data: null });
    toggle(12345, []);
    expect(mockPost).toHaveBeenCalledWith('/api/navigate', { page: 'toggle', pid: 12345 });
    expect(logSpy).toHaveBeenCalledWith(expected);
  });
});

describe('config', () => {
  let errorSpy: jest.SpiedFunction<typeof console.error>;
  let exitSpy: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('toggles ghost_mode via GET then PATCH', () => {
    mockGet.mockReturnValue({ ok: true, status: 200, data: { config: { ghost_mode: false } } });
    mockPatch.mockReturnValue({ ok: true, status: 200, data: { config: { ghost_mode: true } } });

    config(123, ['ghost']);

    expect(mockGet).toHaveBeenCalledWith('/api/config');
    expect(mockPatch).toHaveBeenCalledWith('/api/config', { ghost_mode: true });
    expect(logSpy).toHaveBeenCalledWith('ghost: on');
  });

  it('sets ghost_mode on without GET', () => {
    mockPatch.mockReturnValue({ ok: true, status: 200, data: { config: { ghost_mode: true } } });

    config(123, ['ghost', 'on']);

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith('/api/config', { ghost_mode: true });
    expect(logSpy).toHaveBeenCalledWith('ghost: on');
  });

  it('sets ghost_mode off without GET', () => {
    mockPatch.mockReturnValue({ ok: true, status: 200, data: { config: { ghost_mode: false } } });

    config(123, ['ghost', 'off']);

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPatch).toHaveBeenCalledWith('/api/config', { ghost_mode: false });
    expect(logSpy).toHaveBeenCalledWith('ghost: off');
  });

  it('sets ghost opacity', () => {
    mockPatch.mockReturnValue({ ok: true, status: 200, data: null });

    config(123, ['ghost', 'opacity', '0.7']);

    expect(mockPatch).toHaveBeenCalledWith('/api/config', { ghost_opacity: 0.7 });
    expect(logSpy).toHaveBeenCalledWith('ghost opacity: 0.7');
  });

  it('exits with error when ghost opacity value missing', () => {
    config(123, ['ghost', 'opacity']);

    expect(errorSpy).toHaveBeenCalledWith('Usage: weaver config ghost opacity <0-1>');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error when ghost opacity out of range', () => {
    config(123, ['ghost', 'opacity', '1.5']);

    expect(errorSpy).toHaveBeenCalledWith('ghost_opacity must be a number between 0 and 1');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('toggles dark_mode', () => {
    mockGet.mockReturnValue({ ok: true, status: 200, data: { config: { dark_mode: true } } });
    mockPatch.mockReturnValue({ ok: true, status: 200, data: { config: { dark_mode: false } } });

    config(123, ['dark']);

    expect(mockPatch).toHaveBeenCalledWith('/api/config', { dark_mode: false });
    expect(logSpy).toHaveBeenCalledWith('dark: off');
  });

  it('sets sounds on explicitly', () => {
    mockPatch.mockReturnValue({ ok: true, status: 200, data: { config: { enable_notification_sounds: true } } });

    config(123, ['sounds', 'on']);

    expect(mockPatch).toHaveBeenCalledWith('/api/config', { enable_notification_sounds: true });
    expect(logSpy).toHaveBeenCalledWith('enable notification sounds: on');
  });

  it('prints server not running when GET returns status 0', () => {
    mockGet.mockReturnValue({ ok: false, status: 0, data: null });

    config(123, ['ghost']);

    expect(logSpy).toHaveBeenCalledWith('Weaver server not running');
  });

  it('prints server not running when PATCH returns status 0', () => {
    mockPatch.mockReturnValue({ ok: false, status: 0, data: null });

    config(123, ['ghost', 'on']);

    expect(logSpy).toHaveBeenCalledWith('Weaver server not running');
  });

  it('prints validation error on 422', () => {
    mockPatch.mockReturnValue({ ok: false, status: 422, data: { error: 'ghost_mode must be a boolean' } });

    config(123, ['ghost', 'on']);

    expect(logSpy).toHaveBeenCalledWith('Invalid value: ghost_mode must be a boolean');
  });

  it('exits with usage error when no subcommand given', () => {
    config(123, []);

    expect(errorSpy).toHaveBeenCalledWith('Usage: weaver config <ghost|dark|sounds> [on|off]');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error for unknown subcommand', () => {
    config(123, ['foo']);

    expect(errorSpy).toHaveBeenCalledWith('Unknown config: foo\nUsage: weaver config <ghost|dark|sounds> [on|off]');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('exits with error for unknown modifier', () => {
    config(123, ['ghost', 'maybe']);

    expect(errorSpy).toHaveBeenCalledWith('Unknown modifier: maybe. Use "on" or "off".');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
