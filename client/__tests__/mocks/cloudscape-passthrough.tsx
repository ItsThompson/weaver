// Passthrough mock for simple Cloudscape components (Box, Badge, FormField, Container, etc.)
import React from "react";
const Component = ({
  children,
  label,
  description,
  header,
  actions,
  footer,
  content,
  ...rest
}: any) =>
  React.createElement(
    "div",
    {},
    label && React.createElement("div", {}, label),
    description && React.createElement("div", {}, description),
    header,
    actions,
    children,
    content,
    footer,
  );
export default Component;
