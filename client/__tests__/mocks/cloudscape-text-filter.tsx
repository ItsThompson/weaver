import React from "react";
const TextFilter = ({ filteringText, onChange }: any) =>
  React.createElement("input", {
    type: "text",
    value: filteringText || "",
    onChange: (e: any) =>
      onChange?.({ detail: { filteringText: e.target.value } }),
  });
export default TextFilter;
