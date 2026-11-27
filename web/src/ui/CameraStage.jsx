// The camera stage: the hero of the Words and Sentences screens. It owns the <video>, the hand overlay
// and one recognition engine, and passes the engine's events up. Overlays (result chip, hints) are given
// as children and sit on the stage, so feedback appears where the person is already looking.
import React, { useEffect, useRef, useState } from "react";
import { createEngine } from "../recognition/engine.js";
import { t } from "./i18n.js";
import Icon from "./Icon.jsx";
import QrCode from "./QrCode.jsx";
import { LIVE_URL } from "./site.js";

const ERRORS = {
  permission: { en: "SignMate can't see the camera. Allow it in your browser settings, then tap Try again." },
  insecure: { en: "Phone browsers only allow the camera on a secure (https) address. Open SignMate from its https link." },
  unsupported: { en: "This browser has no camera access. Try a recent Chrome, Edge or Safari." },
  camera: { en: "The camera could not start. Another app may be using it." },
  capture: { en: "Hand tracking could not start on this device." },
  model: { en: "The ASL model could not start on this device." },
};

export default function CameraStage({ bundle, wanted, onWant, lang, onEvent, onEngine, practising, children, variant = "tall", emitHandsEvery = 0 }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const [phase, setPhase] = useState("off");
  const [error, setError] = useState(null);
  const [hands, setHands] = useState("none");
  const [signing, setSigning] = useState(false);
  const [advice, setAdvice] = useState(null);
  const [light, setLight] = useState(false);
  const [facing, setFacing] = useState("user");
  const ready = Boolean(bundle?.aslSpec && bundle?.labels);

  useEffect(() => {
    if (!ready) return undefined;
    const engine = createEngine({
      aslSpec: bundle.aslSpec, labels: bundle.labels, emitHandsEvery,
      onEvent: (event) => {
        if (event.type === "status") setPhase(event.phase);
        else if (event.type === "error") { setError(event); if (["permission", "insecure", "unsupported", "camera"].includes(event.code)) onWant(false); }
        else if (event.type === "hands") setHands(event.seen);
        else if (event.type === "signing") setSigning(event.active);
        else if (event.type === "advice") { const issues = event.advice.filter((a) => !a.ok); setAdvice(issues.length ? issues : null); if (issues.length) setTimeout(() => setAdvice(null), 7000); }
        else if (event.type === "level") { setLight(event.level > 0); if (event.level > 0) setTimeout(() => setLight(false), 6000); }
        onEventRef.current?.(event);
      },
    });
    engineRef.current = engine;
    onEngine?.(engine);
    return () => { engine.stop(); engineRef.current = null; onEngine?.(null); };
    // The bundle is loaded once per page; the engine lives as long as this stage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (wanted) {
      setError(null);
      setPhase("starting");
      engine.start({ videoElement: videoRef.current, canvasElement: canvasRef.current, facing });
    } else {
      engine.stop();
      setPhase("off");
      setHands("none");
      setSigning(false);
    }
  }, [wanted, facing, ready]);

  const live = wanted && !error && phase !== "off";
  const status = !live ? null
    : phase === "starting" || phase === "camera" ? t("loadingTracker", lang)
    : phase === "loading-model" ? t("loadingModel", lang)
    : signing ? t("watching", lang) : t("stageReady", lang);
  const handsText = { none: t("handsNone", lang), one: t("handsOne", lang), both: t("handsBoth", lang) }[hands];

  return <section className={`stage stage-${variant} ${signing ? "is-signing" : ""} ${live ? "is-live" : ""}`} aria-label="Camera">
    <video ref={videoRef} className="stage-video" muted playsInline aria-hidden="true" />
    <canvas ref={canvasRef} className="stage-canvas" aria-hidden="true" />
    {live && <div className="stage-guide" aria-hidden="true"><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path d="M36 48c0-9 6-16 14-16s14 7 14 16-6 15-14 15-14-6-14-15zM14 100c2-17 15-28 36-28s34 11 36 28" /></svg></div>}

    <div className="stage-top">
      <span className="pill pill-glass" title={t("privacyPromise", lang)}><Icon name="lock" size={14} />{t("privacyPill", lang)}</span>
      {!live && <span className="pill pill-glass" title={t("validation", lang)}>{t("notValidated", lang)}</span>}
      {live && <span className={`pill pill-glass hands-${hands}`} role="status"><i className="dot" />{handsText}</span>}
    </div>

    {live && (advice || light) && <div className="stage-advice" role="status">
      {(advice || []).slice(0, 2).map((item) => <span key={item.id}>{item.text}</span>)}
      {light && !advice && <span className="subtle">{t("lightMode", lang)}</span>}
    </div>}

    {!wanted && !error && <div className="stage-cover">
      <div className="stage-cover-inner">
        <p className="stage-cover-title">{practising ? `${t("practising", lang)}: ${practising}` : t("tagline", lang)}</p>
        <p className="stage-cover-sub">{t("framing", lang)}</p>
        <button className="btn btn-primary btn-lg" onClick={() => onWant(true)} disabled={!ready}><Icon name="camera" />{t("turnOnCamera", lang)}</button>
        {!ready && <p className="stage-cover-sub">{bundle?.status === "missing" ? "The ASL model is not available on this device." : "Loading…"}</p>}
      </div>
    </div>}

    {error && <div className="stage-cover stage-error" role="alert">
      <div className="stage-cover-inner">
        <p className="stage-cover-title">{(ERRORS[error.code] || ERRORS.camera).en}</p>
        <div className="row-wrap center">
          <button className="btn btn-primary" onClick={() => { setError(null); onWant(true); }}><Icon name="camera" />{t("tryAgain", lang)}</button>
          <a className="btn btn-glass" href="#/tour"><Icon name="play" />{t("tryTour", lang)}</a>
        </div>
        <div className="qr-row"><QrCode text={LIVE_URL} size={92} /><small>{t("openOnPhone", lang)}<br /><span dir="ltr">{LIVE_URL.replace("https://", "")}</span></small></div>
        <details className="tech"><summary>Details</summary><code>{error.message}</code></details>
      </div>
    </div>}

    {live && <div className="stage-controls">
      <button className="btn btn-glass btn-sm" onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))} aria-label="Switch front or rear camera"><Icon name="flip" size={16} />{t("switchCamera", lang)}</button>
      <button className="btn btn-glass btn-sm" onClick={() => onWant(false)} aria-label="Stop camera"><Icon name="stop" size={16} />{t("stopCamera", lang)}</button>
    </div>}

    <div className="stage-bottom">
      {children}
      {live && status && !children && <p className="stage-status" aria-live="polite">{status}</p>}
    </div>
  </section>;
}
