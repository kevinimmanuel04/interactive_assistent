interface ClearChatButtonProps {
  onClick: () => void;
  isShredding?: boolean;
}

export default function ClearChatButton({ onClick, isShredding }: ClearChatButtonProps) {
  return (
    <div className={`cp-shredder-wrapper ${isShredding ? "cp-shredder-wrapper--active" : ""}`}>
      <button
        type="button"
        className="cp-shredder-btn"
        onClick={onClick}
        title="Clear all messages in active chat session"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="cp-shredder-svg"
        >
          <path
            fillRule="evenodd"
            d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.256 1.478l-.209-.035-1.005 13.07a3 3 0 0 1-2.991 2.77H8.084a3 3 0 0 1-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 0 1-.256-1.478A48.567 48.567 0 0 1 7.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 0 1 3.369 0c1.603.051 2.815 1.387 2.815 2.951Zm-6.136-1.452a51.196 51.196 0 0 1 3.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 0 0-6 0v-.113c0-.794.609-1.428 1.364-1.452Zm-.355 5.945a.75.75 0 1 0-1.5.058l.347 9a.75.75 0 1 0 1.499-.058l-.346-9Zm5.48.058a.75.75 0 1 0-1.498-.058l-.347 9a.75.75 0 0 0 1.5.058l.345-9Z"
            clipRule="evenodd"
          />
        </svg>
        <span>Clear Chat</span>
      </button>
      <div className="cp-shredder-doc" />
      <svg className="cp-shredder-lines" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 154.57 151.52">
        <path className="shred" d="M22.74,0v59.49c0,3.37-.21,7.86-.53,12.79-1.34,20.7-4.18,32.27-8.35,52.58l-6.96,24.13" />
        <path className="shred" d="M33.65,0v59.49c0,3.37-.17,7.86-.42,12.79-1.07,20.7-3.34,32.27-6.68,52.58l-5.57,24.13" />
        <path className="shred" d="M44.56,0v59.49c0,3.37-.13,7.86-.32,12.79-.8,20.7-2.51,32.27-5.01,52.58l-4.18,24.13" />
        <path className="shred" d="M55.47,0v59.49c0,3.37-.08,7.86-.21,12.79-.54,20.7-1.67,32.27-3.34,52.58l-2.78,24.13" />
        <path className="shred" d="M66.37,0v59.49c0,3.37-.04,7.86-.11,12.79-.27,20.7-.84,32.27-1.67,52.58l-1.39,24.13" />
        <path className="shred" d="M77.28,0v59.49c0,3.37,0,7.86,0,12.79,0,20.7,0,32.27,0,52.58v24.13" />
        <path className="shred" d="M88.19,0v59.49c0,3.37.04,7.86.11,12.79.27,20.7.84,32.27,1.67,52.58l1.39,24.13" />
        <path className="shred" d="M99.1,0v59.49c0,3.37.08,7.86.21,12.79.54,20.7,1.67,32.27,3.34,52.58l2.78,24.13" />
        <path className="shred" d="M110.01,0v59.49c0,3.37.13,7.86.32,12.79.8,20.7,2.51,32.27,5.01,52.58l4.18,24.13" />
        <path className="shred" d="M120.92,0v59.49c0,3.37.17,7.86.42,12.79,1.07,20.7,3.34,32.27,6.68,52.58l5.57,24.13" />
        <path className="shred" d="M131.83,0v59.49c0,3.37.21,7.86.53,12.79,1.34,20.7,4.18,32.27,8.35,52.58l6.96,24.13" />
      </svg>
    </div>
  );
}
