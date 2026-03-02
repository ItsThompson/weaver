import React from 'react';
const Tabs = ({ tabs }: any) => React.createElement('div', {},
  tabs?.map((t: any) => React.createElement('div', { key: t.id },
    React.createElement('span', {}, t.label), t.content)));
export default Tabs;
