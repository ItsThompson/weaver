import React from 'react';
const ExpandableSection = ({ headerText, children }: any) =>
  React.createElement('div', {}, React.createElement('div', {}, headerText), children);
export default ExpandableSection;
