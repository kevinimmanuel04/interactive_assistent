import { useState, useEffect } from "react";
import { setUserName } from "../../../api/relationship";
import { type PublicSettings } from "../../../api";
import { cardTitleStyle, subCardStyle } from "../styles";
import { toast } from "../../Toast";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function UserNameSection({ settings, refresh }: Props) {
  const initialName = settings?.user_name || localStorage.getItem("april_user_name") || "";
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings?.user_name !== undefined) {
      setName(settings.user_name || "");
    }
  }, [settings?.user_name]);

  const handleSave = async () => {
    setBusy(true);
    try {
      const clean = name.trim();
      localStorage.setItem("april_user_name", clean);
      await setUserName(clean);
      await refresh();
      toast.success(clean ? `April will now call you "${clean}"!` : "Nickname cleared!");
    } catch (err) {
      toast.error(`Failed to save nickname: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div style={cardTitleStyle}>
        <span>👤 User Nickname / Display Name</span>
      </div>

      <div style={{ ...subCardStyle, display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              What should April call you?
            </label>
            <span style={{ fontSize: 11, color: name.trim() ? "#a5d6a7" : "#ffb74d" }}>
              {name.trim() ? `Addressing as "${name.trim()}"` : "Default (Friend)"}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="textInputWrapper" style={{ flex: 1 }}>
              <input
                type="text"
                className="textInput"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex, Kevin, Boss, Friend..."
              />
            </div>
            <button
              onClick={handleSave}
              disabled={busy}
              className="send-button"
              style={{ padding: "5px 12px", fontSize: 12 }}
            >
              <div className="svg-wrapper-1">
                <div className="svg-wrapper">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={14} height={14}>
                    <path fill="none" d="M0 0h24v24H0z" />
                    <path fill="currentColor" d="M1.946 9.315c-.522-.174-.527-.455.01-.634l19.087-6.362c.529-.176.832.12.684.638l-5.454 19.086c-.15.529-.455.547-.679.045L12 14l6-8-8 6-8.054-2.685z" />
                  </svg>
                </div>
              </div>
              <span>{busy ? "Saving..." : "Save Name"}</span>
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
            April will use this nickname naturally when talking to you in chat.
          </div>
        </div>
      </div>
    </div>
  );
}
