import React from "react";

const Button = ({ children, onClick, ...props }: any) => (
  <div onClick={onClick} {...props}>
    {children}
  </div>
);

export default Button;
