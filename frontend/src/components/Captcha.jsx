import { useEffect, useRef } from 'react';

const SITE_KEY = import.meta.env.VITE_HCAPTCHA_SITE_KEY;

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

  }, []);

  if (!isCaptchaEnabled) return null;
  return <div ref={containerRef} className="flex justify-center" />;
}

export default Captcha;
