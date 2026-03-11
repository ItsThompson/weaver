import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Fuse from "fuse.js";
import Autosuggest, {
  type AutosuggestProps,
} from "@cloudscape-design/components/autosuggest";
import { useWindows } from "../../context/WindowContext";
import { useConfigQuery } from "../../hooks/queries";
import {
  COMMAND_PALETTE_KEY,
  COMMAND_PALETTE_OPEN_EVENT,
} from "../../constants";
import type { WindowEntry, AutosuggestOption } from "./types";

function toOption(entry: WindowEntry): AutosuggestOption {
  return {
    value: entry.href,
    label: entry.label,
    description: entry.description,
  };
}

export function CommandPalette() {
  const windows = useWindows();
  const navigate = useNavigate();
  const { data: configData } = useConfigQuery();
  const [visible, setVisible] = useState(false);
  const [filterValue, setFilterValue] = useState("");
  const autosuggestRef = useRef<AutosuggestProps.Ref>(null);

  const ghostMode = configData?.config.ghost_mode ?? false;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === COMMAND_PALETTE_KEY && e.metaKey && !ghostMode) {
        e.preventDefault();
        setVisible((prev) => !prev);
      }
      if (e.key === "Escape") {
        setVisible(false);
      }
    };
    const openHandler = () => setVisible(true);
    document.addEventListener("keydown", handler);
    document.addEventListener(COMMAND_PALETTE_OPEN_EVENT, openHandler);
    return () => {
      document.removeEventListener("keydown", handler);
      document.removeEventListener(COMMAND_PALETTE_OPEN_EVENT, openHandler);
    };
  }, [ghostMode]);

  useEffect(() => {
    if (visible) {
      setFilterValue("");
      setTimeout(() => autosuggestRef.current?.focus(), 0);
    }
  }, [visible]);

  const fuse = useMemo(
    () => new Fuse(windows, { keys: ["searchableText"], threshold: 0.4 }),
    [windows],
  );

  const options = filterValue
    ? fuse.search(filterValue).map((r) => toOption(r.item))
    : windows.map(toOption);

  const handleSelect = ({ detail }: { detail: { value: string } }) => {
    const match = options.find((o) => o.value === detail.value);
    const href = match ? match.value : options[0]?.value;
    if (!href) {
      return;
    }
    setVisible(false);
    navigate(href);
  };

  if (!visible) {
    return null;
  }

  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 10000,
        }}
        onClick={() => setVisible(false)}
      />
      <div
        style={{
          position: "fixed",
          top: 32,
          left: "50%",
          transform: "translateX(-50%)",
          width: 480,
          zIndex: 10001,
        }}
      >
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
      </div>
    </>
  );
}
