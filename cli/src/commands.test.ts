import { jest } from '@jest/globals';

jest.unstable_mockModule('./utils', () => ({
  post: jest.fn(),
}));

const { post } = await import('./utils.js');
const { view } = await import('./commands/view.js');
const { sessions } = await import('./commands/sessions.js');

const mockPost = post as jest.MockedFunction<typeof post>;
let logSpy: jest.SpiedFunction<typeof console.log>;

beforeEach(() => {
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => logSpy.mockRestore());

describe('view', () => {
  it('prints success when server returns 200', () => {
    mockPost.mockReturnValue({ ok: true, status: 200, data: null });
    view(12345, []);
    expect(mockPost).toHaveBeenCalledWith('/api/view', { pid: 12345 });
    expect(logSpy).toHaveBeenCalledWith('Opening session in Weaver dashboard');
  });

  it('prints not found when server returns 404', () => {
    mockPost.mockReturnValue({ ok: false, status: 404, data: null });
    view(99999, []);
    expect(logSpy).toHaveBeenCalledWith('No Weaver session found for PID 99999');
  });

  it('prints server not running when status is 0', () => {
    mockPost.mockReturnValue({ ok: false, status: 0, data: null });
    view(12345, []);
    expect(logSpy).toHaveBeenCalledWith('Weaver server not running');
  });

  it('prints generic error for other status codes', () => {
    mockPost.mockReturnValue({ ok: false, status: 500, data: null });
    view(12345, []);
    expect(logSpy).toHaveBeenCalledWith('Weaver server error (500)');
  });
});

describe('sessions', () => {
  it('prints success when server returns 200', () => {
    mockPost.mockReturnValue({ ok: true, status: 200, data: null });
    sessions(12345, []);
    expect(mockPost).toHaveBeenCalledWith('/api/navigate', { page: 'sessions' });
    expect(logSpy).toHaveBeenCalledWith('Opening sessions list in Weaver dashboard');
  });

  it('prints server not running when status is 0', () => {
    mockPost.mockReturnValue({ ok: false, status: 0, data: null });
    sessions(12345, []);
    expect(logSpy).toHaveBeenCalledWith('Weaver server not running');
  });

  it('prints generic error for other status codes', () => {
    mockPost.mockReturnValue({ ok: false, status: 500, data: null });
    sessions(12345, []);
    expect(logSpy).toHaveBeenCalledWith('Weaver server error (500)');
  });
});
