interface CopyMessageButtonProps {
  isCopied: boolean;
  onCopy: () => void;
}

export default function CopyMessageButton({ isCopied, onCopy }: CopyMessageButtonProps) {
  return (
    <button
      type="button"
      className={`cp-copy-msg-btn ${isCopied ? "cp-copy-msg-btn--copied" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onCopy();
      }}
      title="Copy message to clipboard"
    >
      <span className="cp-copy-icon-box">
        {/* Underneath static document */}
        <svg
          width="16"
          height="18"
          viewBox="0 0 19 21"
          xmlns="http://www.w3.org/2000/svg"
          className="cp-copy-svg-back"
        >
          <path
            d="M3.4,4 L11.5,4 L16,8.25 L16,17.6 C16,19.47 14.47,21 12.6,21 L3.4,21 C1.52,21 0,19.47 0,17.6 L0,7.4 C0,5.52 1.52,4 3.4,4 Z"
            fill="currentColor"
            opacity="0.4"
          />
          <path
            d="M6.4,0 L12,0 L19,6.5 L19,14.6 C19,16.47 17.47,18 15.6,18 L6.4,18 C4.52,18 3,16.47 3,14.6 L3,3.4 C3,1.52 4.52,0 6.4,0 Z"
            fill="currentColor"
          />
          <path
            d="M12,0 L12,5.5 C12,6.05 12.44,6.5 13,6.5 L19,6.5 L12,0 Z"
            fill="currentColor"
            opacity="0.75"
          />
        </svg>

        {/* Flying bouncing top document */}
        <svg
          width="16"
          height="18"
          viewBox="0 0 19 21"
          xmlns="http://www.w3.org/2000/svg"
          className="cp-copy-svg-front"
        >
          <path
            d="M3.4,4 L11.5,4 L16,8.25 L16,17.6 C16,19.47 14.47,21 12.6,21 L3.4,21 C1.52,21 0,19.47 0,17.6 L0,7.4 C0,5.52 1.52,4 3.4,4 Z"
            fill="currentColor"
            opacity="0.4"
          />
          <path
            d="M6.4,0 L12,0 L19,6.5 L19,14.6 C19,16.47 17.47,18 15.6,18 L6.4,18 C4.52,18 3,16.47 3,14.6 L3,3.4 C3,1.52 4.52,0 6.4,0 Z"
            fill="currentColor"
          />
          <path
            d="M12,0 L12,5.5 C12,6.05 12.44,6.5 13,6.5 L19,6.5 L12,0 Z"
            fill="currentColor"
            opacity="0.75"
          />
        </svg>
      </span>
      <span className="cp-copy-text">{isCopied ? "✓ Copied" : "Copy"}</span>
    </button>
  );
}
