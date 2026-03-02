import React from 'react';
const Table = ({ items, columnDefinitions, empty, filter, ...props }: any) => (
  <div data-testid="table">
    {filter}
    {items?.length === 0 && empty}
    {items?.map((item: any, i: number) => (
      <div key={item.id ?? i} data-testid={`table-row-${item.id ?? i}`}>
        {columnDefinitions?.map((col: any) => (
          <span key={col.id}>{col.cell(item)}</span>
        ))}
      </div>
    ))}
  </div>
);
export default Table;
