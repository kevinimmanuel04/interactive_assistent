import React from "react";

interface ResetButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label?: string;
}

export const ResetButton: React.FC<ResetButtonProps> = ({
  label = "Reset to fit",
  className = "",
  ...props
}) => {
  return (
    <button className={`app-reset-btn ${className}`} {...props}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={13}
        height={13}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="svg-icon"
      >
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
        <path d="M3 3v5h5" />
      </svg>
      <span className="btn-label">{label}</span>
    </button>
  );
};

export default ResetButton;
