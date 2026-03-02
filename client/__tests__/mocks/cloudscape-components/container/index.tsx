import React from "react";
const Component = ({ children, ...props }: any) => React.createElement("div", props, children);
export default Component;

