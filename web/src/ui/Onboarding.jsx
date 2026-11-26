// First visit: one line ("Show a sign → confirm → speak."), the privacy promise, and the MediaPipe
// statistics notice before the camera ever turns on (it replaces the old checkbox dialog; the same
// consent key is stored, so returning visitors are not asked again).
import React, { useEffect, useRef } from "react";
import Icon, { BrandMark } from "./Icon.jsx";
import { t } from "./i18n.js";

export default function Onboarding({ lang, setLang, onCamera, onTour, onBrowse, signs }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <div className="sheet-scrim onboarding-scrim">
    <section className="onboarding glass-strong" role="dialog" aria-modal="true" aria-labelledby="onboard-title" tabIndex={-1} ref={ref}>
      <div className="lang-pick" role="group" aria-label="Language">
        {[["en", "English"], ["ur", "اردو"], ["roman", "Roman Urdu"]].map(([id, name]) => <button key={id} className={lang === id ? "on" : ""} aria-pressed={lang === id} onClick={() => setLang(id)}>{name}</button>)}
      </div>
      <BrandMark size={52} />
      <h1 id="onboard-title" className={lang === "ur" ? "urdu" : ""}>{t("onboardTitle", lang)}</h1>
      <ol className="steps" aria-label="How it works">
        <li><Icon name="hand" /><span>{lang === "ur" ? "اشارہ" : "Sign"}</span></li>
        <li><Icon name="check" /><span>{lang === "ur" ? "تصدیق" : "Confirm"}</span></li>
        <li><Icon name="speak" /><span>{lang === "ur" ? "بولیں" : "Speak"}</span></li>
      </ol>
      <p className={lang === "ur" ? "urdu" : ""}>{t("onboardBody", lang)}{signs ? (lang === "ur" ? ` ابھی ${signs} اشارے۔` : ` ${signs} signs today, more as Deaf partners help it grow.`) : ""}</p>
      <p className="privacy-line"><Icon name="lock" size={16} />{t("privacyPromise", lang)}</p>
      <details className="tech"><summary>{t("inDetail", lang)}</summary><p>{t("privacyDetail", lang)}</p><p>{t("onboardCompanion", lang)}</p></details>
      <div className="stack">
        <button className="btn btn-primary btn-lg" onClick={onCamera}><Icon name="camera" />{t("turnOnCamera", lang)}</button>
        <button className="btn btn-glass" onClick={onTour}><Icon name="play" />{t("takeTour", lang)}</button>
        <button className="btn btn-quiet" onClick={onBrowse}>{t("justBrowse", lang)}</button>
      </div>
    </section>
  </div>;
}
