// ============================================
// AniList Token Capture — Content Script
// Auto-captures the access token from the OAuth pin page
// Injected on: https://anilist.co/api/v2/oauth/pin*
// ============================================

(function () {
    'use strict';

    // The OAuth implicit grant redirects to:
    // https://anilist.co/api/v2/oauth/pin#access_token=TOKEN&token_type=Bearer&expires_in=...
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) return;

    // Parse the token from the URL fragment
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');

    if (!token) return;

    console.log('[AniList] Token capturado automáticamente');

    // Send token to background for validation and storage
    chrome.runtime.sendMessage({
        type: 'anilist_save_token',
        token: token
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('[AniList] Error enviando token:', chrome.runtime.lastError);
            return;
        }

        if (response && response.success) {
            console.log('[AniList] Token guardado exitosamente');

            // Replace the page content with a success message
            document.body.innerHTML = `
        <div style="
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; min-height: 100vh;
          background: #0b1622; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            background: #151f2e; border-radius: 16px; padding: 40px;
            text-align: center; max-width: 400px; border: 1px solid #1f2937;
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <h2 style="margin: 0 0 8px; font-size: 22px; color: #02a9ff;">¡Conectado!</h2>
            <p style="color: #8ba0b2; font-size: 14px; margin: 0 0 20px; line-height: 1.5;">
              Tu cuenta de AniList <strong style="color:#fff">${response.viewer?.name || ''}</strong>
              ha sido vinculada a Crunchyroll Power Up.
            </p>
            <p style="color: #6b7c8d; font-size: 12px; margin: 0;">
              Puedes cerrar esta pestaña.
            </p>
          </div>
        </div>
      `;

            // Auto-close this tab after 3 seconds
            setTimeout(() => {
                window.close();
            }, 3000);
        } else {
            console.error('[AniList] Error validando token:', response?.error);

            document.body.innerHTML = `
        <div style="
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; min-height: 100vh;
          background: #0b1622; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        ">
          <div style="
            background: #151f2e; border-radius: 16px; padding: 40px;
            text-align: center; max-width: 400px; border: 1px solid #1f2937;
          ">
            <div style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <h2 style="margin: 0 0 8px; font-size: 22px; color: #ef4444;">Error</h2>
            <p style="color: #8ba0b2; font-size: 14px; margin: 0; line-height: 1.5;">
              ${response?.error || 'No se pudo validar el token. Inténtalo de nuevo.'}
            </p>
          </div>
        </div>
      `;
        }
    });
})();
