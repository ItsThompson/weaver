import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Fuse from 'fuse.js';
import Modal from '@cloudscape-design/components/modal';
import Autosuggest, { type AutosuggestProps } from '@cloudscape-design/components/autosuggest';
import { useWindows } from '../../context/WindowContext';
import { useConfigQuery } from '../../hooks/queries';
import { COMMAND_PALETTE_KEY } from '../../constants';
import type { WindowEntry, AutosuggestOption } from './types';

function toOption(entry: WindowEntry): AutosuggestOption {
  return { value: entry.href, label: entry.label, description: entry.description };
}

export function CommandPalette() {
  const windows = useWindows();
  const navigate = useNavigate();
  const { data: configData } = useConfigQuery();
  const [visible, setVisible] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const autosuggestRef = useRef<AutosuggestProps.Ref>(null);

  const ghostMode = configData?.config.ghost_mode ?? false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === COMMAND_PALETTE_KEY && e.metaKey && !ghostMode) {
        e.preventDefault();
        setVisible((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [ghostMode]);

  useEffect(() => {
    if (visible) {
      setFilterValue('');
      setTimeout(() => autosuggestRef.current?.focus(), 0);
    }
  }, [visible]);

  const fuse = useMemo(() => new Fuse(windows, { keys: ['searchableText'], threshold: 0.4 }), [windows]);

  const options = filterValue
    ? fuse.search(filterValue).map((r) => toOption(r.item))
    : windows.map(toOption);

  const handleSelect = ({ detail }: { detail: { value: string } }) => {
    const match = options.find((o) => o.value === detail.value);
    const href = match ? match.value : options[0]?.value;
    if (!href) return;
    setVisible(false);
    navigate(href);
  };

  return (
    <Modal visible={visible} onDismiss={() => setVisible(false)} header="Switch to...">
      <Autosuggest
        ref={autosuggestRef}
        value={filterValue}
        onChange={({ detail }) => setFilterValue(detail.value)}
        onSelect={handleSelect}
        options={options}
        filteringType="manual"
        hideEnteredTextOption
        enteredTextLabel={(v) => v}
        placeholder="Search pages and sessions..."
        empty="No matches found"
      />
    </Modal>
  );
}
