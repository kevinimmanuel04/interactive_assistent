interface SidebarSessionActionsProps {
  isPinned: boolean;
  canDelete: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onStartRename: (e: React.MouseEvent) => void;
  onDeleteSession: (e: React.MouseEvent) => void;
}

export default function SidebarSessionActions({
  isPinned,
  canDelete,
  onTogglePin,
  onStartRename,
  onDeleteSession,
}: SidebarSessionActionsProps) {
  return (
    <div className="cp-session-actions-card">
      {/* Pin / Unpin Button */}
      <button
        type="button"
        className={`cp-sa-btn cp-sa-pin ${isPinned ? "cp-sa-pin--active" : ""}`}
        onClick={onTogglePin}
        title={isPinned ? "Unpin chat" : "Pin chat to top"}
      >
        <svg viewBox="0 0 24 24" className="cp-sa-svg">
          <path
            fill="currentColor"
            d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6l1 1 1-1v-6h5v-2l-2-2z"
          />
        </svg>
        <span className="cp-sa-text">{isPinned ? "Unpin" : "Pin"}</span>
      </button>

      {/* Rename Button */}
      <button
        type="button"
        className="cp-sa-btn cp-sa-rename"
        onClick={onStartRename}
        title="Rename chat"
      >
        <svg viewBox="0 0 24 24" className="cp-sa-svg">
          <path
            fill="currentColor"
            d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
          />
        </svg>
        <span className="cp-sa-text">Rename</span>
      </button>

      {/* Delete Button (if more than 1 session) */}
      {canDelete && (
        <button
          type="button"
          className="cp-sa-btn cp-sa-delete"
          onClick={onDeleteSession}
          title="Delete chat"
        >
          <svg viewBox="0 0 24 24" className="cp-sa-svg">
            <path
              fill="currentColor"
              d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
            />
          </svg>
          <span className="cp-sa-text">Delete</span>
        </button>
      )}
    </div>
  );
}
