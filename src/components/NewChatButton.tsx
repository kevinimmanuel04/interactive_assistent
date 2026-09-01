interface NewChatButtonProps {
  onClick: () => void;
  collapsed?: boolean;
}

export default function NewChatButton({ onClick, collapsed }: NewChatButtonProps) {
  return (
    <button
      type="button"
      className={`cp-new-chat-btn ${collapsed ? "cp-new-chat-btn--collapsed" : ""}`}
      onClick={onClick}
      title="Create New Conversation (Ctrl+N)"
    >
      <span className="cp-nc-border-span" />
      {!collapsed && (
        <p className="cp-nc-text-p" data-title="+ New Chat" data-text="Start!" />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        className="cp-nc-svg-icon"
      >
        <path
          d="M12 22C17.5 22 22 17.5 22 12C22 6.5 17.5 2 12 2C6.5 2 2 6.5 2 12C2 17.5 6.5 22 12 22Z"
          strokeWidth="1.5"
        />
        <path d="M8 12H16" strokeWidth="1.5" />
        <path d="M12 16V8" strokeWidth="1.5" />
      </svg>
    </button>
  );
}
