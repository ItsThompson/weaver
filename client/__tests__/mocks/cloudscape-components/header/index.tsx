import React from 'react';
const Header = ({ children, actions, ...props }: any) => (
  <div data-testid="header" {...props}>
    {children}
    {actions && <div>{actions}</div>}
  </div>
);
export default Header;
