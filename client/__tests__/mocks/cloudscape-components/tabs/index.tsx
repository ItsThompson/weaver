import React from 'react';
const Tabs = ({ tabs }: any) => (
  <div data-testid="tabs">
    {tabs?.map((tab: any) => (
      <div key={tab.id}>
        <span>{tab.label}</span>
        <div>{tab.content}</div>
      </div>
    ))}
  </div>
);
export default Tabs;
