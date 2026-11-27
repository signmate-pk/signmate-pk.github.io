// First visit: one line ("Show a sign → confirm → speak."), the privacy promise, and the MediaPipe
// statistics notice before the camera ever turns on (it replaces the old checkbox dialog; the same
// consent key is stored, so returning visitors are not asked again).
import React, { useEffect, useRef } from "react";
import Icon, { BrandMark } from "./Icon.jsx";
import { t } from "./i18n.js";

export default function Onboarding({ lang, onCamera, onTour, onBrowse, signs }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return <div className="sheet-scrim onboarding-scrim">
    <section className="onboarding glass-strong" role="dialog" aria-modal="true" aria-labelledby="onboard-title" tabIndex={-1} ref={ref}>
      <BrandMark size={52} />
      <h1 id="onboard-title">{t("onboardTitle", lang)}</h1>
      <ol className="steps" aria-label="How it works">
        <li><Icon name="hand" /><span>Sign</span></li>
        <li><Icon name="check" /><span>Confirm</span></li>
        <li><Icon name="speak" /><span>Speak</span></li>
      </ol>
      <p>{t("onboardBody", lang)}{signs ? ` ${signs} signs today.` : ""}</p>
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
