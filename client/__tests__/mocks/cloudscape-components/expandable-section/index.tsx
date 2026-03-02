import React from 'react';
const ExpandableSection = ({ headerText, children }: any) => (
  <div data-testid="expandable-section">
    <div>{headerText}</div>
    <div>{children}</div>
  </div>
);
export default ExpandableSection;
