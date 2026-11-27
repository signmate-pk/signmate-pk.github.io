// The live demo's camera check, kept apart from landing.js so it can be tested without a browser
// (web/tests/landing.test.mjs). Nothing here asks for the camera; it only finds out early when the camera
// cannot work, so the page can offer the guided tour and the video instead of a dead end.

// Why the camera cannot be used here, or null. Checked before anything heavy loads.
export async function cameraProblem(env = window) {
  if (!env.isSecureContext) return "This page is not on a secure (https) address, so the browser blocks the camera.";
  const devices = env.navigator?.mediaDevices;
  if (!devices?.getUserMedia) return "This browser cannot use a camera from a web page. Try a recent Chrome, Edge, Safari or Firefox.";
  try {
    const state = await env.navigator.permissions?.query({ name: "camera" });
    if (state?.state === "denied") return "The camera is blocked for this site in your browser settings.";
  } catch { /* Firefox and older Safari cannot query the camera permission; the prompt will tell. */ }
  try {
    const list = await devices.enumerateDevices();
    if (list.length && !list.some((d) => d.kind === "videoinput")) return "No camera was found on this device.";
  } catch { /* unknown: let the app ask */ }
  return null;
}
