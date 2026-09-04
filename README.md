# Equipo Michi 🐾

App web para registrar los gatos rescatados con el método CES (Captura, Esterilización, Suelta).

No requiere instalación ni compilación: son 3 archivos estáticos (`index.html`, `style.css`, `app.js`) que ya incluyen todo lo necesario vía CDN (Supabase, Leaflet para mapas, Chart.js para gráficas).

## ⚠️ Antes de usarla: revisa los permisos (RLS) en Supabase

La app se conecta con la clave `anon`, sin login. Para que funcione, entra en el **SQL Editor** de tu proyecto de Supabase y ejecuta esto:

```sql
-- Permitir leer, insertar, editar y borrar en la tabla Michis con la clave anon
alter table "Michis" enable row level security;

create policy "acceso total anon" on "Michis"
for all
to anon
using (true)
with check (true);
```

```sql
-- Permitir subir y borrar fotos en el bucket Fotos_michis con la clave anon
-- (la lectura ya funciona sola porque el bucket es público)
create policy "anon puede subir fotos" on storage.objects
for insert to anon
with check (bucket_id = 'Fotos_michis');

create policy "anon puede borrar fotos" on storage.objects
for delete to anon
using (bucket_id = 'Fotos_michis');
```

> Si al probar la app te da error 401/403 al guardar un michi o subir una foto, es casi seguro que falta una de estas políticas.

## 📦 Subir a GitHub y publicar (GitHub Pages)

1. Crea un repositorio nuevo en GitHub (puede ser privado, es recomendable ya que la `anon key` queda visible en el código — está protegida por RLS, pero mejor no exponerla a cualquiera).
2. Sube estos 3 archivos a la raíz del repo.
3. Ve a **Settings → Pages** del repositorio.
4. En "Source" elige la rama `main` y la carpeta `/ (root)`.
5. Guarda. En un par de minutos tendrás una URL tipo `https://tu-usuario.github.io/tu-repo/` — esa es la que compartís entre vosotros.

Nota: si el repo es privado, GitHub Pages requiere plan GitHub Pro (o superior) para publicarlo. Si no quieres pagar, puedes dejar el repo público (asumiendo el riesgo de la anon key expuesta, mitigado por RLS) o usar un servicio como Netlify/Vercel en su plan gratuito, arrastrando la misma carpeta.

## 🗺️ Estructura de datos esperada

Tabla `Michis`:

| Columna | Tipo |
|---|---|
| id | int8 (PK) |
| Nombre | text |
| Foto | text (guarda el **nombre del archivo** en el bucket, no la URL completa) |
| Sexo | text (`Macho` / `Hembra` / `Desconocido`) |
| Color | text |
| Fecha_rescate | date |
| Latitud | float8 |
| Longitud | float8 |
| Direccion_referencia | text |
| Comentarios | text |

Bucket de Storage: `Fotos_michis` (público).

## ✨ Funcionalidades incluidas

- Inicio: contador de michis totales, michis del año en curso, mini mapa con los rescates del año y carrusel con los últimos michis.
- Añadir michi: formulario completo, foto con compresión automática antes de subir, ubicación por GPS o marcando el punto en un mapa.
- Michis: listado con búsqueda, filtro por sexo, edición y borrado (con confirmación), exportación a CSV.
- Estadísticas: gráfica de rescates por año, por sexo, por color, y mapa con todas las localizaciones.

## 🔧 Posibles mejoras futuras

- Autenticación real si algún día queréis dar acceso a más gente.
- Migrar a PostGIS si necesitáis búsquedas por proximidad ("michis cerca de aquí").
- Compresión con soporte explícito para fotos HEIC de iPhone (actualmente depende del soporte del navegador para `createImageBitmap`).
