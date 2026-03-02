import React from 'react';

// Lightweight mocks for Cloudscape components used in tests.
// We test our component logic, not Cloudscape rendering.

const passthrough = (name: string) =>
  ({ children, ...props }: any) => React.createElement('div', { 'data-testid': name, ...props }, children);

const selfClosing = (name: string) =>
  (props: any) => React.createElement('span', { 'data-testid': name, ...props });

export default passthrough;
export { passthrough, selfClosing };
