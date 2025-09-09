// Picture-in-Picture control injected into Crunchyroll's native video controls.
// This module is copied verbatim (with minor adjustments) from the open source
// project `picture-in-picture-extension-for-crunchyroll`.  It adds a small
// button to the video player's control bar which toggles Chrome's built‑in
// Picture‑in‑Picture (PiP) mode.  The feature is activated only when the
// Mini Player option is enabled in the Crunchyroll Power Up popup.

(() => {
    // Track whether we're currently watching the DOM for control changes.
    let pipIsMonitoring = false;
    let pipMonitor = null;

    // Remove the `disablepictureinpicture` attribute so PiP can work on Firefox.
    function pipRemovePipAttribute(video) {
        video?.removeAttribute('disablepictureinpicture');
    }

    // Build the PiP button element.  The original extension injects an SVG
    // icon; here we preserve the structure to remain faithful to the source.
    function pipCreatePipControl() {
        // Inline SVG for the Picture‑in‑Picture icon copied from the upstream
        // project.  Without this graphic the control would appear blank.
        const pipIconTag = '<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="#e8eaed"><path d="M96-480v-72h165L71-743l50-50 191 190v-165h72v288H96Zm72 288q-29.7 0-50.85-21.15Q96-234.3 96-264v-144h72v144h336v72H168Zm624-264v-240H456v-72h336q29.7 0 50.85 21.15Q864-725.7 864-696v240h-72Zm576-192v-192H576v-72h336q29.7 0 50.85 21.15Q864-725.7 864-696v192h-72Z" /></svg>';
        const parser = new DOMParser();
        const pipIconNode = parser.parseFromString(pipIconTag, 'text/html');
        const pipIcon = pipIconNode.documentElement;
        const pipControl = document.createElement('div');
        pipControl.setAttribute('id', 'pipControl');
        pipControl.classList.add('pip-control');
        pipControl.appendChild(pipIcon);
        return pipControl;
    }

    // Insert the PiP button before the settings (gear) control and wire up
    // click behaviour to toggle PiP on the supplied video element.
    function pipAddPipControl(settingsControl, video) {
        if (!settingsControl || !video) return;
        const videoControlsContainer = settingsControl.parentElement;
        if (!videoControlsContainer) return;
        const pipControl = pipCreatePipControl();
        videoControlsContainer.insertBefore(pipControl, settingsControl);
        pipRemovePipAttribute(video);
        pipControl.addEventListener('click', e => {
            e.stopImmediatePropagation();
            if (!document.pictureInPictureEnabled) return;
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture();
            } else {
                video.requestPictureInPicture();
            }
        });
    }

    // Start observing the page for the video controls; when both the video and
    // the settings control exist we insert the PiP button.  This logic is
    // identical to the upstream project and reuses the same IDs.
    function pipStartVideoControlsMonitor() {
        if (pipIsMonitoring) return;
        pipMonitor = new MutationObserver(() => {
            const video = document.getElementById('player0');
            if (!video) return;
            const settingsControl = document.getElementById('settingsControl');
            if (!settingsControl) return;
            const existingPip = document.getElementById('pipControl');
            if (existingPip) return;
            pipAddPipControl(settingsControl, video);
        });
        pipMonitor.observe(document.body, { childList: true, subtree: true });
        pipIsMonitoring = true;
    }

    // Initialise the PiP control.  On Firefox we simply remove the disabling
    // attribute and do not inject any controls (per upstream behaviour).  On
    // other browsers we start monitoring for control insertion.
    function pipInit() {
        // Avoid double initialisation.
        if (pipIsMonitoring) return;
        // Firefox: remove the blocking attribute and bail out.  Without this
        // call the native PiP button remains disabled in Firefox.
        if (navigator.userAgent.indexOf('Firefox') > 0) {
            const video = document.getElementById('player0');
            pipRemovePipAttribute(video);
            return;
        }
        pipStartVideoControlsMonitor();
    }

    // Destroy the PiP control: remove the injected element and disconnect
    // observers so no further insertions occur.
    function pipDestroy() {
        const pipControl = document.getElementById('pipControl');
        if (pipControl) {
            pipControl.remove();
        }
        if (pipMonitor) {
            pipMonitor.disconnect();
            pipMonitor = null;
        }
        pipIsMonitoring = false;
    }

    // Check the current miniPlayerEnabled state from storage and initialize
    // accordingly.  Because storage retrieval is asynchronous, we perform
    // initialisation on completion.
    chrome.storage.sync.get({ miniPlayerEnabled: true }, (result) => {
        try {
            if (result.miniPlayerEnabled) {
                pipInit();
            }
        } catch (err) {
            // Catch and log errors gracefully – failing silently could make
            // debugging more difficult but should never break the page.
            console.error('PiP control initialisation failed:', err);
        }
    });

    // Listen for toggle messages from the popup.  When the mini player is
    // enabled we initialise the PiP control; when disabled we tear it down.
    chrome.runtime.onMessage.addListener((message) => {
        if (message && message.type === 'MINI_PLAYER_TOGGLE') {
            if (message.enabled) {
                pipInit();
            } else {
                pipDestroy();
            }
        }
    });
})();