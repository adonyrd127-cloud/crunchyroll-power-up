<div align="center">
  <img src="icons/icono chrome.png" alt="Crunchyroll Power Up" width="128" height="128">
  
  # Crunchyroll Power Up
  
  Una extensión de navegador que mejora la experiencia de Crunchyroll con funciones avanzadas.

  ![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
  ![Version](https://img.shields.io/badge/version-1.6.32-orange)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

## ✨ Características

### 🎬 Reproducción
- **Mini Player**: Reproduce videos en una ventana flotante sobre la página con bordes personalizados y controles propios
- **Botones de salto**: Navegación rápida para saltar intros, recaps y endings automáticamente
- **Control PiP**: Picture-in-Picture mejorado con barra de progreso personalizada
- **Botones de tamaño de pantalla**: Control de resolución del reproductor

### 📅 Organización
- **Filtros de calendario**: Organiza y filtra el contenido del calendario de emisión
- **Fechas de emisión**: Muestra la fecha del próximo episodio directamente en la página

### 🔔 Sistema de Seguimiento de Animes (NUEVO)
- **Botón de seguir**: Botón "Seguir Anime" inyectado en páginas de series en Crunchyroll
- **Detección automática de nuevos episodios**: Verificación cada 30 minutos usando la API de AniList (gratuita, sin autenticación)
- **Notificaciones de escritorio**: Alertas con botones "Ver ahora" / "Ver después" cuando sale un nuevo episodio
- **Panel de gestión en el popup**: Lista de animes seguidos con thumbnails, estado de episodios y acciones rápidas
- **Configuración de notificaciones**: Activar/desactivar, horario de "No molestar" (22:00-08:00), sonido
- **Verificación manual**: Botón 🔄 para comprobar nuevos episodios al instante
- **Sin dependencias externas**: No requiere servidores dedicados ni APIs de pago

## 🛠️ Instalación

1. Descarga o clona este repositorio
2. Abre Chrome/Edge y ve a `chrome://extensions/`
3. Activa el **"Modo de desarrollador"**
4. Haz clic en **"Cargar extensión sin empaquetar"**
5. Selecciona la carpeta de la extensión

## 📁 Estructura del Proyecto

```
crunchyroll-power-up/
├── background.js              # Service Worker: alarmas, notificaciones, AniList API
├── content.js                 # Script principal de contenido
├── content.css                # Estilos del contenido
├── popup.html                 # Interfaz del popup
├── popup.js                   # Lógica del popup + gestión de animes seguidos
├── manifest.json              # Configuración de la extensión (Manifest V3)
├── episodeAirDate.js          # Fechas de próximo episodio
├── content_scripts/
│   ├── SkipperHandler.js      # Manejo de botones de salto
│   ├── calendarFilter.js      # Filtro de calendario
│   └── follow_button.js       # Botón de seguimiento de animes
├── features/
│   ├── miniplayer.js          # Mini reproductor flotante
│   ├── pipControl.js          # Control Picture-in-Picture
│   └── screenSizeButtons.js   # Botones de tamaño de pantalla
├── utils/
│   └── aniskip.js             # Integración con AniSkip API
├── css/                       # Hojas de estilo adicionales
├── icons/                     # Iconos de la extensión
└── _locales/                  # Archivos de internacionalización
    └── es/messages.json
```

## 🔑 Permisos

| Permiso | Uso |
|---------|-----|
| `storage` | Guardar configuración y lista de animes seguidos |
| `tabs` | Abrir pestañas desde notificaciones |
| `activeTab` | Interactuar con la pestaña actual |
| `scripting` | Inyectar scripts en páginas de Crunchyroll |
| `notifications` | Enviar alertas de nuevos episodios |
| `alarms` | Programar verificaciones periódicas cada 30 min |

## 🌐 APIs Utilizadas

- **AniList GraphQL** (`graphql.anilist.co`) — Detectar nuevos episodios de animes en emisión (gratuita, sin auth)
- **AniSkip API** — Obtener timestamps de intros/endings para salto automático
- **Chrome Extensions API** — Storage, Notifications, Alarms, Tabs

## 🔧 Versión

**v1.6.32** — Versión funcional y optimizada con sistema de seguimiento de animes

## 🌍 Soporte

Compatible con:
- Crunchyroll.com
- Beta.crunchyroll.com
- Chrome / Edge (Chromium)
- Manifest V3

## 🗣️ Idiomas

- 🇪🇸 Español (Spanish)
- 🇺🇸 English

## 📌 Estado

✅ **Versión Funcional** — Todas las características están operativas y probadas

## 👨‍💻 Autor

**Ing. Adony R.**
