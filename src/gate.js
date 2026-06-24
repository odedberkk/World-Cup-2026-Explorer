import {
  GATE_PBKDF2_ITERATIONS,
  GATE_PASSWORD_HASH_B64,
  GATE_PASSWORD_SALT_B64,
} from './gate.config.js';

const SESSION_STORAGE_KEY = 'wc2026_gate_session';
const EXTERNAL_SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/globe.gl/dist/globe.gl.min.js',
  'https://sdk.mvp.fan/web-sdk/0.35.4/index.js',
];

let externalScriptsLoaded = false;

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function getCryptoSubtle() {
  return globalThis.crypto?.subtle ?? null;
}

function assertSecureVerificationContext() {
  if (!window.isSecureContext) {
    throw new Error('INSECURE_CONTEXT');
  }

  if (!getCryptoSubtle()) {
    throw new Error('CRYPTO_UNAVAILABLE');
  }
}

async function derivePasswordHash(password) {
  assertSecureVerificationContext();

  const salt = decodeBase64(GATE_PASSWORD_SALT_B64);
  const encoder = new TextEncoder();
  const keyMaterial = await getCryptoSubtle().importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const derivedBits = await getCryptoSubtle().deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: GATE_PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );

  return new Uint8Array(derivedBits);
}

function isConfiguredGate() {
  return (
    GATE_PASSWORD_SALT_B64 &&
    GATE_PASSWORD_HASH_B64 &&
    GATE_PASSWORD_SALT_B64 !== 'replace-me' &&
    GATE_PASSWORD_HASH_B64 !== 'replace-me'
  );
}

function hasValidSession() {
  try {
    const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!stored) return false;
    const storedBytes = decodeBase64(stored);
    const expectedBytes = decodeBase64(GATE_PASSWORD_HASH_B64);
    return timingSafeEqual(storedBytes, expectedBytes);
  } catch {
    return false;
  }
}

function establishSession() {
  sessionStorage.setItem(SESSION_STORAGE_KEY, GATE_PASSWORD_HASH_B64);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export async function loadExternalScripts() {
  if (externalScriptsLoaded) return;

  for (const src of EXTERNAL_SCRIPTS) {
    await loadScript(src);
  }

  externalScriptsLoaded = true;
}

function getGateElements() {
  return {
    gate: document.getElementById('access-gate'),
    form: document.getElementById('access-gate-form'),
    input: document.getElementById('access-gate-password'),
    error: document.getElementById('access-gate-error'),
    submit: document.getElementById('access-gate-submit'),
    configError: document.getElementById('access-gate-config-error'),
  };
}

function showGateError(message) {
  const { error, submit } = getGateElements();
  if (!error) return;
  error.textContent = message;
  error.classList.remove('hidden');
  submit?.removeAttribute('aria-busy');
}

function setGateSubmitting(isSubmitting) {
  const { submit } = getGateElements();
  if (!submit) return;
  submit.toggleAttribute('disabled', isSubmitting);
  submit.setAttribute('aria-busy', String(isSubmitting));
  submit.textContent = isSubmitting ? 'Checking…' : 'Enter';
}

function hideGateError() {
  const { error } = getGateElements();
  error?.classList.add('hidden');
}

function showConfigError() {
  const { configError, form } = getGateElements();
  configError?.classList.remove('hidden');
  form?.classList.add('hidden');
}

async function unlock(onUnlock) {
  const { gate } = getGateElements();
  const appShell = document.getElementById('app-shell');

  document.body.classList.remove('gate-locked');
  gate?.classList.add('hidden');
  gate?.setAttribute('aria-hidden', 'true');
  appShell?.removeAttribute('aria-hidden');

  await loadExternalScripts();
  await onUnlock();
}

function bindGateForm(onUnlock) {
  const { form, input } = getGateElements();
  if (!form || !input) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideGateError();

    const password = input.value.trim();
    if (!password) return;

    setGateSubmitting(true);

    try {
      assertSecureVerificationContext();

      const derived = await derivePasswordHash(password);
      const expected = decodeBase64(GATE_PASSWORD_HASH_B64);
      const valid = timingSafeEqual(derived, expected);

      if (!valid) {
        showGateError('Incorrect password. Try again.');
        input.select();
        return;
      }

      input.value = '';
      await unlock(onUnlock);
      establishSession();
    } catch (error) {
      console.error('Access gate failed', error);

      if (error?.message === 'INSECURE_CONTEXT') {
        showGateError('Open this site via https:// or http://localhost (not an IP address).');
      } else if (error?.message === 'CRYPTO_UNAVAILABLE') {
        showGateError('This browser cannot verify passwords here. Try Chrome, Edge, or Safari.');
      } else if (error?.message?.startsWith('Failed to load')) {
        showGateError('Password accepted, but required scripts failed to load. Check your connection.');
      } else {
        showGateError('Could not unlock the app. Refresh and try again.');
      }
    } finally {
      setGateSubmitting(false);
    }
  });
}

export function initAccessGate(onUnlock) {
  if (!isConfiguredGate()) {
    showConfigError();
    return;
  }

  try {
    assertSecureVerificationContext();
  } catch (error) {
    if (error?.message === 'INSECURE_CONTEXT') {
      showGateError('Open this site via https:// or http://localhost (not an IP address).');
    } else {
      showGateError('This browser cannot verify passwords here. Try Chrome, Edge, or Safari.');
    }
    return;
  }

  if (hasValidSession()) {
    setGateSubmitting(true);
    unlock(onUnlock)
      .then(() => establishSession())
      .catch((error) => {
        console.error('Access gate session unlock failed', error);
        sessionStorage.removeItem(SESSION_STORAGE_KEY);
        bindGateForm(onUnlock);
        showGateError('Session expired. Enter the password again.');
      })
      .finally(() => setGateSubmitting(false));
    return;
  }

  bindGateForm(onUnlock);
  getGateElements().input?.focus();
}
