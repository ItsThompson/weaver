import React from "react";
const Header = ({ children, actions, counter, description }: any) =>
  React.createElement(
    "div",
    {},
    children,
    counter && React.createElement("span", {}, counter),
    description && React.createElement("div", {}, description),
    actions,
  );
export default Header;
