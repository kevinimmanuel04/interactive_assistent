import { setLanguage, type PublicSettings } from "../../../../api";
import { t, useLocale } from "../../../../i18n";
import { h3Style, hintStyle, inputStyle, sectionStyle } from "../../styles";

interface Props {
  settings: PublicSettings | null;
  refresh: () => Promise<void>;
}

export default function LanguageSection({ settings, refresh }: Props) {
  useLocale();
  const language = (settings?.language ?? "auto") as
    | "auto"
    | "en"
    | "ru"
    | "uk";

  return (
    <section style={sectionStyle}>
      <h3 style={h3Style}>🌐 {t("settings.language.title")}</h3>
      <p style={hintStyle}>{t("settings.language.hint")}</p>
      <select
        value={language}
        onChange={async (e) => {
          await setLanguage(e.target.value as "auto" | "en" | "ru" | "uk");
          await refresh();
        }}
        style={inputStyle}
      >
        <option value="auto">{t("settings.language.auto")}</option>
        <option value="en">{t("settings.language.en")}</option>
        <option value="ru">{t("settings.language.ru")}</option>
        <option value="uk">{t("settings.language.uk")}</option>
      </select>
    </section>
  );
}
