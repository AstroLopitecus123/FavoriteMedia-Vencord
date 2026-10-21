<div align="center">

<p>
  <b><a href="README.md">ESPAÑOL</a></b> &nbsp;•&nbsp; <b><a href="README.en.md">ENGLISH</a></b>
</p>

<img src="assets/banner.png" alt="FavoriteMedia for Vencord" width="100%" />

<br/>
<br/>

**Guarda, categoriza y envía tus imágenes, videos, audios y archivos favoritos en Discord con un solo clic.**

*Adaptación para Vencord del plugin original **FavoriteMedia** creado por [Dastan21](https://github.com/Dastan21/BDAddons/tree/d9ae47aa4131fc8e9764af9cd042048d9bb516d8/plugins/FavoriteMedia).*

<br/>

[![Vencord UserPlugin](https://img.shields.io/badge/Platform-Vencord-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://vencord.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![Vistas](https://komarev.com/ghpvc/?username=AstroLopitecus123-FavoriteMedia-Vencord&label=VISTAS&style=for-the-badge&color=5865F2)

</div>

---

## Vista Previa

<table>
  <tr>
    <td align="center" width="50%">
      <b>Pestaña de Imágenes</b><br><br>
      <img src="assets/preview-images.png" alt="Pestaña Imágenes" />
    </td>
    <td align="center" width="50%">
      <b>Pestaña de Videos</b><br><br>
      <img src="assets/preview-videos.png" alt="Pestaña Videos" />
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
      <b>Pestaña de Audios</b><br><br>
      <img src="assets/preview-audios.png" alt="Pestaña Audios" />
    </td>
    <td align="center" width="50%">
      <b>Pestaña de Archivos</b><br><br>
      <img src="assets/preview-files.png" alt="Pestaña Archivos" />
    </td>
  </tr>
</table>

---

## Características

| Módulo | Descripción |
| :--- | :--- |
| **Categorías Personalizables** | Organización por carpetas con colores y reordenamiento mediante arrastrar y soltar (*drag & drop*). |
| **Caché Local (Anti-Enlaces Caídos)** | Almacenamiento persistente en **IndexedDB** local para evitar pérdidas si los enlaces de Discord expiran. |
| **Reproductor Integrado** | Previsualización de videos y audios con control de reproducción y slider de volumen. |
| **Buscador en Tiempo Real** | Filtro instantáneo por nombre o formato de archivo. |
| **Envío Directo** | Posibilidad de enviar inmediatamente al chat o insertar el enlace en la caja de texto. |

---

## Instalación

### Paso 1: Copiar a Vencord
Copia la carpeta `FavoriteMedia` dentro del directorio `src/userplugins/` del repositorio de Vencord:
```text
Vencord/
 └── src/
      └── userplugins/
           └── FavoriteMedia/
```

### Paso 2: Compilar e Inyectar
Ejecuta los siguientes comandos en la terminal desde la raíz de Vencord:
```bash
pnpm build
pnpm inject
```

### Paso 3: Habilitar el Plugin
1. Abre Discord.
2. Ve a **Ajustes de Usuario** > sección **Vencord** > **Plugins**.
3. Activa el interruptor de **`FavoriteMedia`**.
4. El acceso a tus favoritos estará disponible directamente en el selector de expresiones de la barra de chat.

---

## Configuración

Desde el menú de ajustes de Vencord puedes modificar:
* **Orden de la lista:** Ver los medios más nuevos primero (por defecto) o los más antiguos primero.
* **Modo de envío:** Enviar instantáneamente con un clic o solo copiar/insertar el enlace.
* **Caché local:** Habilitar o deshabilitar el guardado de blobs en disco.
* **Volumen inicial:** Ajustar el nivel de ganancia predeterminado para medios de audio y video.

---

## Almacenamiento Local (IndexedDB)

Por defecto, los medios se cargan directamente de la nube de Discord (ocupando 0 MB en disco). Si activas la opción **"Guardar copia local en mi PC"**, Discord almacenará los archivos binarios en su base de datos local interna (`IndexedDB`).

### ¿Cómo abrir la carpeta en Windows?
1. Presiona en tu teclado las teclas **`Win + R`**.
2. Escribe o pega:
   ```text
   %APPDATA%\discord\IndexedDB
   ```
3. Presiona **Enter**.

---

## Créditos

* **Concepto original:** [Dastan21](https://github.com/Dastan21/BDAddons/tree/d9ae47aa4131fc8e9764af9cd042048d9bb516d8/plugins/FavoriteMedia) (BetterDiscord).
* **Adaptación a Vencord:** [AstroLopitecus123](https://github.com/AstroLopitecus123).
