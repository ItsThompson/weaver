import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ValidationBanner } from '.';
import type { ValidationResult } from '@weaver/shared/types';

const passed: ValidationResult = {
  name: 'typecheck',
  passed: true,
  output: '',
  duration_ms: 1200,
  timed_out: false,
};

const failed: ValidationResult = {
  name: 'test:unit',
  passed: false,
  output: 'FAIL src/index.test.ts\nExpected 1, got 2',
  duration_ms: 3400,
  timed_out: false,
};

const skipped: ValidationResult = {
  name: 'lint',
  passed: true,
  output: '',
  duration_ms: 0,
  timed_out: false,
  skipped_reason: 'no matching files',
};

describe('ValidationBanner', () => {
  it('renders nothing for empty results', () => {
    const { container } = render(<ValidationBanner results={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders pass count and fail count', () => {
    render(<ValidationBanner results={[passed, failed, skipped]} />);
    expect(screen.getByText('Validation: 1/3 failed')).toBeInTheDocument();
  });

  it('shows green status when all passed', () => {
    render(<ValidationBanner results={[passed]} />);
    expect(screen.getByText('Validation passed (1/1)')).toBeInTheDocument();
  });

  it('shows red status when there are failures', () => {
    render(<ValidationBanner results={[passed, failed]} />);
    expect(screen.getByText('Validation: 1/2 failed')).toBeInTheDocument();
  });

  it('shows skipped results with reason', () => {
    render(<ValidationBanner results={[skipped]} />);
    expect(screen.getByText('lint — skipped: no matching files')).toBeInTheDocument();
  });
});
