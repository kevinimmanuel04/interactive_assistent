import { openUrl } from "@tauri-apps/plugin-opener";

interface Props {
  href: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Opens the URL in the user's default browser via the Tauri opener plugin.
 * `<a target="_blank">` does not work in Tauri's webview by default.
 */
export default function ExternalLink({ href, children, style }: Props) {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        openUrl(href).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn("[opener] failed to open url:", err);
        });
      }}
      style={{
        color: "#b39ddb",
        textDecoration: "underline",
        cursor: "pointer",
        ...style,
      }}
    >
      {children}
    </a>
  );
}
