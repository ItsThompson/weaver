import { jest } from '@jest/globals';

jest.unstable_mockModule('./utils', () => ({
  post: jest.fn(),
}));

const { post } = await import('./utils.js');
const { view } = await import('./commands/view.js');
const { session } = await import('./commands/session.js');

const mockPost = post as jest.MockedFunction<typeof post>;
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
