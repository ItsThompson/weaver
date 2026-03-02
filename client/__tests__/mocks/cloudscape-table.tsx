import React from 'react';
const Table = ({ items, columnDefinitions, empty, filter }: any) => React.createElement('div', {},
  filter,
  items?.length === 0 ? empty : null,
  items?.map((item: any, i: number) => React.createElement('div', { key: item.id ?? i },
    columnDefinitions?.map((col: any) => React.createElement('span', { key: col.id }, col.cell(item))))));
export default Table;
