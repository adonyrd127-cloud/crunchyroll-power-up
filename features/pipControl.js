// Control Picture-in-Picture inyectado en los controles de vídeo nativos de Crunchyroll.
// Este módulo se copia prácticamente igual (con pequeños ajustes) del proyecto
// open source `picture-in-picture-extension-for-crunchyroll`. Añade un botón
// al control del reproductor que alterna el modo Picture‑in‑Picture (PiP) de Chrome.
// La función sólo se activa cuando la opción Mini Player está habilitada en el popup.

(() => {
    // Indica si actualmente estamos observando el DOM en busca de cambios en los controles.
    let pipIsMonitoring = false;
    let pipMonitor = null;

    // Elimina el atributo `disablepictureinpicture` para que PiP funcione en Firefox.
    function pipRemovePipAttribute(video) {
        video?.removeAttribute('disablepictureinpicture');
    }

    // Construye el elemento del botón PiP. La extensión original inyecta un
    // icono SVG; aquí mantenemos la estructura para ser fiel al origen.
    function pipCreatePipControl() {
        // SVG en línea para el icono Picture‑in‑Picture copiado del proyecto original.
        // Sin este gráfico el control aparecería vacío.
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

    // Inserta el botón PiP antes del control de configuración (engranaje) y
    // enlaza el comportamiento de click para alternar PiP en el elemento video.
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

    // Empieza a observar la página en busca de los controles del vídeo; cuando
    // tanto el vídeo como el control de configuración existen, insertamos el botón PiP.
    // Esta lógica es idéntica al proyecto original y reutiliza los mismos IDs.
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

    // Inicializa el control PiP. En Firefox simplemente eliminamos el atributo
    // que lo bloquea y no inyectamos controles (comportamiento del upstream).
    // En otros navegadores empezamos a monitorizar la inserción de controles.
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

    // Destruye el control PiP: elimina el elemento inyectado y desconecta
    // los observers para evitar nuevas inserciones.
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

    // Comprueba el estado actual de miniPlayerEnabled en el storage e inicializa
    // en consecuencia. Como la lectura de storage es asíncrona, inicializamos
    // cuando la operación termina.
    chrome.storage.sync.get({ miniPlayerEnabled: true }, (result) => {
        try {
            if (result.miniPlayerEnabled) {
                pipInit();
            }
        } catch (err) {
            // Capturamos y registramos errores de forma controlada — fallar en
            // silencio dificultaría la depuración pero no debe romper la página.
            console.error('Inicialización del control PiP fallida:', err);
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