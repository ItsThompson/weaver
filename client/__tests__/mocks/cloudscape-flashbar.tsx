import React from "react";

const Flashbar = ({
  items,
}: {
  items?: Array<{
    id?: string;
    content?: React.ReactNode;
    type?: string;
    dismissible?: boolean;
    onDismiss?: () => void;
  }>;
}) =>
  React.createElement(
    "div",
    {},
    ...(items ?? []).map((item) =>
      React.createElement(
        "div",
        { key: item.id, "data-type": item.type },
        item.content,
      ),
    ),
  );

export default Flashbar;
