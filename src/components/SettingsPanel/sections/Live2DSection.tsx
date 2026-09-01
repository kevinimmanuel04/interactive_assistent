import { useEffect, useState } from "react";
import { setLive2dModel, type PublicSettings } from "../../../api";
import { toast } from "../../Toast";
import { CHARACTERS, STORAGE_MODEL_KEY } from "../../../utils/characters";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export function getSavedModelUrl(): string {
  return localStorage.getItem(STORAGE_MODEL_KEY) || "/april.vrm";
}

export default function Live2DSection({ settings, refresh }: Props) {
  const [activeUrl, setActiveUrl] = useState<string>(() => getSavedModelUrl());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = localStorage.getItem(STORAGE_MODEL_KEY) || settings?.live2d_model_url;
    if (current) setActiveUrl(current);
  }, [settings?.live2d_model_url]);

  const selectCharacter = async (path: string, charName: string) => {
    if (busy) return;
    setBusy(true);
    try {
      localStorage.setItem(STORAGE_MODEL_KEY, path);
      await setLive2dModel(path);
      setActiveUrl(path);
      await refresh();
      // Notify all listening components (input bars, headers, wake listeners)
      window.dispatchEvent(new CustomEvent("april-character-changed", { detail: { path, name: charName } }));
      toast.success(`Active character switched to ${charName}!`);
    } catch (err) {
      toast.error(`Failed to switch character: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="avatar-selector">
      <div className="header">
        <h2 className="header-title">3D Avatar Character Selector</h2>
        <p className="header-subtitle">
          Choose your active 3D AI companion model. Select any of the 3 built-in character models below:
        </p>
      </div>

      <div className="card-grid">
        {CHARACTERS.map((char) => {
          const isSelected = activeUrl === char.vrmPath || activeUrl.includes(char.id);

          return (
            <label key={char.id} className="card-label">
              <input
                type="radio"
                name="avatar-character"
                className="avatar-radio"
                checked={isSelected}
                onChange={() => selectCharacter(char.vrmPath, char.name)}
              />
              <div className="card">
                <div className="border" />
                <div className="card-front">
                  <img
                    src={char.imagePath}
                    alt={char.name}
                    className="card-img"
                    onError={(e) => {
                      (e.currentTarget as HTMLElement).style.display = "none";
                    }}
                  />
                  <div className="card-placeholder">
                    <span style={{ fontSize: 36, marginBottom: 6 }}>{char.fallbackIcon}</span>
                    <span className="front-text">{char.cardTitle}</span>
                  </div>
                </div>

                <div className="card-content">
                  <p className="card-title">{char.cardTitle}</p>
                  <p className="card-description">{char.cardDescription}</p>
                  <div className="select-btn">
                    <span className="btn-text-default">Select</span>
                    <span className="btn-text-active">Active ✓</span>
                  </div>
                </div>

                <span className="toast-text">Avatar Updated</span>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}
