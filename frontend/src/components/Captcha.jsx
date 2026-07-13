import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY;

// Mirrors the backend's CAPTCHA_ENABLED default (config/env.js): both sides
// are off unless real keys are provisioned, so a fresh checkout with no
// hCaptcha account still has a working login/register form.
export const isCaptchaEnabled = Boolean(SITE_KEY);

let scriptPromise = null;
function loadHCaptchaScript() {
  if (window.hcaptcha) return Promise.resolve(window.hcaptcha);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://js.hcaptcha.com/1/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.hcaptcha);
      script.onerror = () => reject(new Error('Failed to load hCaptcha'));
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Renders nothing when isCaptchaEnabled is false — see the module-level
// comment above.
function Captcha({ onVerify, onExpire }) {
  const containerRef = useRef(null);
  const widgetIdRef = useRef(null);

  useEffect(() => {
    if (!isCaptchaEnabled) return undefined;
    let cancelled = false;

    loadHCaptchaScript().then((hcaptcha) => {
      if (cancelled || !containerRef.current || widgetIdRef.current !== null) return;
      widgetIdRef.current = hcaptcha.render(containerRef.current, {
        sitekey: SITE_KEY,
        callback: onVerify,
        'expired-callback': onExpire,
        'error-callback': onExpire,
      });
    });

    return () => {
      cancelled = true;
      if (widgetIdRef.current !== null && window.hcaptcha) {
        window.hcaptcha.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
    // Mount once — the widget manages its own token lifecycle after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isCaptchaEnabled) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}

export default Captcha;
