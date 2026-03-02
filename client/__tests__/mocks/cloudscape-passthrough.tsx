// Passthrough mock for simple Cloudscape components (Box, Badge, Button, etc.)
import React from 'react';
const Component = ({ children }: any) => React.createElement('div', {}, children);
export default Component;
