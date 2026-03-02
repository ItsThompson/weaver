import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Table, { type TableProps } from '@cloudscape-design/components/table';
import TextFilter from '@cloudscape-design/components/text-filter';
import Box from '@cloudscape-design/components/box';
import type { SessionWithStatus } from '@weaver/shared/types';

interface SessionTableProps {
  sessions: SessionWithStatus[];
  columnDefinitions: TableProps.ColumnDefinition<SessionWithStatus>[];
}

export function SessionTable({ sessions, columnDefinitions }: SessionTableProps) {
  const navigate = useNavigate();
  const [filterText, setFilterText] = useState('');

  const filtered = sessions.filter((s) => {
    if (!filterText) return true;
    const lower = filterText.toLowerCase();
    return (
      (s.customName?.toLowerCase().includes(lower)) ||
      s.cwd.toLowerCase().includes(lower) ||
      s.id.toLowerCase().includes(lower)
    );
  });

  return (
    <Table
      items={filtered}
      columnDefinitions={columnDefinitions}
      variant="borderless"
      empty={<Box textAlign="center" color="inherit">No sessions</Box>}
      filter={<TextFilter filteringText={filterText} onChange={({ detail }) => setFilterText(detail.filteringText)} />}
      onRowClick={({ detail }) => navigate(`/sessions/${detail.item.id}`)}
      trackBy="id"
    />
  );
}
