/* ==========================================================
   EQUIPO MICHI — configuración
   ========================================================== */
const SUPABASE_URL = 'https://lqgiganawthdavjsocoi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxxZ2lnYW5hd3RoZGF2anNvY29pIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1Nzg0NzQsImV4cCI6MjA3MTE1NDQ3NH0.3NGLmaA8-rbbCh4_FXHuzx4OQTc1-gNtPWbfCJxXrxk';
const TABLE = 'Michis';
const BUCKET = 'Fotos_michis';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==========================================================
   Utilidades generales
   ========================================================== */
const $content = document.getElementById('content');
const $modalRoot = document.getElementById('modal-root');
const $toastRoot = document.getElementById('toast-root');

function toast(msg, tipo = ''){
  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ' ' + tipo : '');
  el.textContent = msg;
  $toastRoot.innerHTML = '';
  $toastRoot.appendChild(el);
  setTimeout(() => { el.remove(); }, 2600);
}

function closeModal(){ $modalRoot.innerHTML = ''; }

function openModal(innerHtml){
  $modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal-sheet">${innerHtml}</div></div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

function fotoUrl(path){
  if (!path) return null;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function anioActual(){ return new Date().getFullYear(); }

function anioDe(fechaStr){
  if (!fechaStr) return null;
  return Number(String(fechaStr).slice(0, 4));
}

function formatFecha(fechaStr){
  if (!fechaStr) return 'Sin fecha';
  const [y, m, d] = fechaStr.split('-');
  return `${d}/${m}/${y}`;
}

function escapeHtml(str){
  return String(str ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

/* ==========================================================
   Compresión de imagen (en el navegador, antes de subir)
   ========================================================== */
async function comprimirImagen(archivo, maxAncho = 1280, calidad = 0.75){
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, maxAncho / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', calidad));
}

/* ==========================================================
   Capa de datos (Supabase)
   ========================================================== */
let michisCache = null;

async function cargarMichis(forzar = false){
  if (michisCache && !forzar) return michisCache;
  const { data, error } = await sb.from(TABLE).select('*').order('Fecha_rescate', { ascending: false });
  if (error){ toast('Error cargando datos: ' + error.message, 'error'); return []; }
  michisCache = data || [];
  return michisCache;
}

async function crearMichi(payload){
  const { data, error } = await sb.from(TABLE).insert(payload).select();
  if (error) throw error;
  return data[0];
}

async function actualizarMichi(id, payload){
  const { error } = await sb.from(TABLE).update(payload).eq('id', id);
  if (error) throw error;
}

async function borrarMichi(id, fotoPath){
  const { error } = await sb.from(TABLE).delete().eq('id', id);
  if (error) throw error;
  if (fotoPath){
    await sb.storage.from(BUCKET).remove([fotoPath]);
  }
}

async function subirFoto(blob){
  const nombre = `michi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.jpg`;
  const { error } = await sb.storage.from(BUCKET).upload(nombre, blob, { contentType: 'image/jpeg' });
  if (error) throw error;
  return nombre;
}

/* ==========================================================
   Enrutado
   ========================================================== */
const rutas = {
  inicio: vistaInicio,
  anadir: vistaAnadir,
  michis: vistaMichis,
  estadisticas: vistaEstadisticas,
};

function route(){
  const hash = (location.hash || '#inicio').replace('#', '');
  const nombre = rutas[hash] ? hash : 'inicio';
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.route === nombre);
  });
  rutas[nombre]();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.getElementById('btn-refrescar').addEventListener('click', async () => {
  await cargarMichis(true);
  toast('Datos actualizados', 'success');
  route();
});

/* ==========================================================
   VISTA: Inicio
   ========================================================== */
async function vistaInicio(){
  $content.innerHTML = `<p class="empty-hint">Cargando…</p>`;
  const michis = await cargarMichis();
  const anio = anioActual();
  const delAnio = michis.filter(m => anioDe(m.Fecha_rescate) === anio);
  const conUbicacion = delAnio.filter(m => m.Latitud != null && m.Longitud != null);
  const recientes = [...michis]
    .sort((a, b) => (b.Fecha_rescate || '').localeCompare(a.Fecha_rescate || ''))
    .slice(0, 12);

  $content.innerHTML = `
    <div class="stat-grid">
      <div class="stat-card accent-a">
        <div class="stat-label">Michis totales</div>
        <div class="stat-value">${michis.length}</div>
      </div>
      <div class="stat-card accent-b">
        <div class="stat-label">Michis ${anio}</div>
        <div class="stat-value">${delAnio.length}</div>
      </div>
    </div>

    <div class="section-title">Rescates de ${anio} en el mapa</div>
    <div class="card">
      <div id="mini-mapa"></div>
      ${conUbicacion.length === 0 ? `<p class="empty-hint">Aún no hay michis de ${anio} con ubicación guardada.</p>` : ''}
    </div>

    <div class="section-title">Últimos rescatados</div>
    <div class="card">
      ${recientes.length === 0
        ? `<p class="empty-hint">Todavía no habéis registrado ningún michi. ¡Pulsa "Añadir" para empezar!</p>`
        : `<div class="mosaico">${recientes.map(m => mosaicoItem(m)).join('')}</div>`}
    </div>
  `;

  if (conUbicacion.length > 0){
    const map = L.map('mini-mapa', { zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const bounds = [];
    conUbicacion.forEach(m => {
      const marker = L.circleMarker([m.Latitud, m.Longitud], {
        radius: 7, color: '#f5a524', fillColor: '#f5a524', fillOpacity: .9, weight: 2
      }).addTo(map).bindPopup(`<b>${escapeHtml(m.Nombre || 'Michi')}</b>`);
      bounds.push([m.Latitud, m.Longitud]);
    });
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
  }
}

function mosaicoItem(m){
  const url = fotoUrl(m.Foto);
  return `
    <div class="mosaico-item">
      ${url ? `<img src="${url}" alt="${escapeHtml(m.Nombre)}">` : `<div class="ph-empty">🐾</div>`}
      <div class="m-nombre">${escapeHtml(m.Nombre || 'Sin nombre')}</div>
      <div class="m-fecha">${formatFecha(m.Fecha_rescate)}</div>
    </div>
  `;
}

/* ==========================================================
   VISTA: Añadir michi
   ========================================================== */
let fotoSeleccionada = null; // blob comprimido
let marcadorForm = null;
let mapaForm = null;

function vistaAnadir(){
  fotoSeleccionada = null;
  const hoy = new Date().toISOString().slice(0, 10);

  $content.innerHTML = `
    <h1 style="font-size:22px; margin-bottom:16px;">Añadir michi</h1>
    <form id="form-michi">

      <div class="form-group">
        <label>Foto</label>
        <div class="foto-picker">
          <img id="foto-preview" class="foto-preview" src="" style="display:none;">
          <div id="foto-preview-vacia" class="foto-preview" style="display:flex;align-items:center;justify-content:center;font-size:22px;">🐾</div>
          <div>
            <input type="file" id="input-foto" accept="image/*" style="display:none;">
            <button type="button" class="btn btn-secondary" id="btn-elegir-foto">Elegir foto</button>
            <div class="form-hint">Se comprime automáticamente antes de subir.</div>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label>Nombre</label>
        <input type="text" id="f-nombre" placeholder="Ej. Fifi" required>
      </div>

      <div class="form-group">
        <label>Sexo</label>
        <div class="sexo-toggle" id="f-sexo-toggle">
          <button type="button" data-val="Macho">Macho</button>
          <button type="button" data-val="Hembra">Hembra</button>
          <button type="button" data-val="Desconocido" class="active">Desconocido</button>
        </div>
      </div>

      <div class="form-group">
        <label>Color</label>
        <input type="text" id="f-color" placeholder="Ej. Atigrado, negro, blanco y naranja…">
      </div>

      <div class="form-group">
        <label>Fecha de rescate</label>
        <input type="date" id="f-fecha" value="${hoy}" required>
      </div>

      <div class="form-group">
        <label>Ubicación</label>
        <div class="btn-row" style="margin-bottom:10px;">
          <button type="button" class="btn btn-secondary btn-block" id="btn-gps">📍 Usar mi ubicación</button>
        </div>
        <div id="mapa-form"></div>
        <div class="form-hint">O toca el mapa para marcar el punto manualmente.</div>
        <div class="form-hint" id="coords-info"></div>
      </div>

      <div class="form-group">
        <label>Dirección de referencia</label>
        <input type="text" id="f-direccion" placeholder="Ej. Detrás del polideportivo, calle Mayor">
      </div>

      <div class="form-group">
        <label>Comentarios</label>
        <textarea id="f-comentarios" placeholder="Observaciones, estado de salud, colonia a la que pertenece…"></textarea>
      </div>

      <button type="submit" class="btn btn-primary btn-block" id="btn-guardar">Guardar michi</button>
    </form>
  `;

  // --- foto ---
  document.getElementById('btn-elegir-foto').addEventListener('click', () => {
    document.getElementById('input-foto').click();
  });
  document.getElementById('input-foto').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try{
      fotoSeleccionada = await comprimirImagen(archivo);
      const url = URL.createObjectURL(fotoSeleccionada);
      const img = document.getElementById('foto-preview');
      img.src = url; img.style.display = 'block';
      document.getElementById('foto-preview-vacia').style.display = 'none';
    }catch(err){
      toast('No se pudo procesar la imagen', 'error');
    }
  });

  // --- sexo ---
  document.getElementById('f-sexo-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    document.querySelectorAll('#f-sexo-toggle button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });

  // --- mapa ---
  mapaForm = L.map('mapa-form').setView([39.99, -1.86], 6); // vista general de España por defecto
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaForm);
  marcadorForm = null;

  function colocarMarcador(lat, lng){
    if (marcadorForm) mapaForm.removeLayer(marcadorForm);
    marcadorForm = L.marker([lat, lng], { draggable: true }).addTo(mapaForm);
    marcadorForm.on('dragend', () => {
      const p = marcadorForm.getLatLng();
      mostrarCoords(p.lat, p.lng);
    });
    mapaForm.setView([lat, lng], 15);
    mostrarCoords(lat, lng);
  }
  function mostrarCoords(lat, lng){
    document.getElementById('coords-info').textContent = `Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
  mapaForm.on('click', (e) => colocarMarcador(e.latlng.lat, e.latlng.lng));

  document.getElementById('btn-gps').addEventListener('click', () => {
    if (!navigator.geolocation){
      toast('Este navegador no soporta geolocalización', 'error');
      return;
    }
    toast('Obteniendo ubicación…');
    navigator.geolocation.getCurrentPosition(
      (pos) => colocarMarcador(pos.coords.latitude, pos.coords.longitude),
      () => toast('No se pudo obtener tu ubicación. Márcala en el mapa.', 'error'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // --- submit ---
  document.getElementById('form-michi').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try{
      let fotoPath = null;
      if (fotoSeleccionada) fotoPath = await subirFoto(fotoSeleccionada);

      const sexo = document.querySelector('#f-sexo-toggle button.active').dataset.val;
      const punto = marcadorForm ? marcadorForm.getLatLng() : null;

      await crearMichi({
        Nombre: document.getElementById('f-nombre').value.trim(),
        Sexo: sexo,
        Color: document.getElementById('f-color').value.trim(),
        Fecha_rescate: document.getElementById('f-fecha').value,
        Latitud: punto ? punto.lat : null,
        Longitud: punto ? punto.lng : null,
        Direccion_referencia: document.getElementById('f-direccion').value.trim(),
        Comentarios: document.getElementById('f-comentarios').value.trim(),
        Foto: fotoPath,
      });

      await cargarMichis(true);
      toast('¡Michi guardado! 🐾', 'success');
      location.hash = '#michis';
    }catch(err){
      toast('Error al guardar: ' + err.message, 'error');
      btn.disabled = false; btn.textContent = 'Guardar michi';
    }
  });
}

/* ==========================================================
   VISTA: Listado de michis
   ========================================================== */
let filtroSexo = 'todos';
let textoBusqueda = '';

async function vistaMichis(){
  $content.innerHTML = `<p class="empty-hint">Cargando…</p>`;
  const michis = await cargarMichis();
  renderListado(michis);
}

function renderListado(michis){
  let filtrados = michis;
  if (filtroSexo !== 'todos') filtrados = filtrados.filter(m => (m.Sexo || 'Desconocido') === filtroSexo);
  if (textoBusqueda.trim()){
    const q = textoBusqueda.trim().toLowerCase();
    filtrados = filtrados.filter(m =>
      (m.Nombre || '').toLowerCase().includes(q) ||
      (m.Color || '').toLowerCase().includes(q) ||
      (m.Direccion_referencia || '').toLowerCase().includes(q)
    );
  }

  $content.innerHTML = `
    <div class="btn-row" style="margin-bottom:14px;">
      <button class="btn btn-secondary btn-block" id="btn-exportar">⬇️ Exportar CSV</button>
    </div>
    <div class="search-bar">
      <input type="text" id="input-buscar" placeholder="Buscar por nombre, color o dirección…" value="${escapeHtml(textoBusqueda)}">
    </div>
    <div class="filtros">
      ${['todos','Macho','Hembra','Desconocido'].map(v => `
        <div class="chip ${filtroSexo === v ? 'active' : ''}" data-sexo="${v}">${v === 'todos' ? 'Todos' : v}</div>
      `).join('')}
    </div>
    <div id="lista-michis">
      ${filtrados.length === 0
        ? `<p class="empty-hint">No hay michis que coincidan con la búsqueda.</p>`
        : filtrados.map(m => filaMichi(m)).join('')}
    </div>
  `;

  document.getElementById('btn-exportar').addEventListener('click', () => exportarCSV(michis));
  document.getElementById('input-buscar').addEventListener('input', (e) => {
    textoBusqueda = e.target.value;
    renderListado(michisCache);
  });
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      filtroSexo = chip.dataset.sexo;
      renderListado(michisCache);
    });
  });
  document.querySelectorAll('[data-editar]').forEach(b => {
    b.addEventListener('click', () => abrirEdicion(Number(b.dataset.editar)));
  });
  document.querySelectorAll('[data-borrar]').forEach(b => {
    b.addEventListener('click', () => confirmarBorrado(Number(b.dataset.borrar)));
  });
}

function filaMichi(m){
  const url = fotoUrl(m.Foto);
  return `
    <div class="michi-row">
      ${url ? `<img src="${url}" alt="">` : `<div class="ph-empty" style="display:flex;align-items:center;justify-content:center;">🐾</div>`}
      <div class="info">
        <div class="n">${escapeHtml(m.Nombre || 'Sin nombre')}</div>
        <div class="m">${m.Sexo || 'Desconocido'} · ${escapeHtml(m.Color || 'sin color')} · ${formatFecha(m.Fecha_rescate)}</div>
      </div>
      <div class="acciones">
        <div class="icon-btn-sm" data-editar="${m.id}" title="Editar">✏️</div>
        <div class="icon-btn-sm" data-borrar="${m.id}" title="Eliminar">🗑️</div>
      </div>
    </div>
  `;
}

function confirmarBorrado(id){
  const m = michisCache.find(x => x.id === id);
  if (!m) return;
  openModal(`
    <div class="modal-title">¿Eliminar a ${escapeHtml(m.Nombre || 'este michi')}?</div>
    <p style="color:var(--text-muted); font-size:14px;">Esta acción no se puede deshacer. Se borrará también su foto.</p>
    <div class="btn-row">
      <button class="btn btn-secondary btn-block" id="cancelar-borrado">Cancelar</button>
      <button class="btn btn-danger btn-block" id="confirmar-borrado">Eliminar</button>
    </div>
  `);
  document.getElementById('cancelar-borrado').addEventListener('click', closeModal);
  document.getElementById('confirmar-borrado').addEventListener('click', async () => {
    try{
      await borrarMichi(id, m.Foto);
      await cargarMichis(true);
      closeModal();
      toast('Michi eliminado', 'success');
      renderListado(michisCache);
    }catch(err){
      toast('Error al eliminar: ' + err.message, 'error');
    }
  });
}

function abrirEdicion(id){
  const m = michisCache.find(x => x.id === id);
  if (!m) return;
  let fotoEditSeleccionada = null;
  const urlActual = fotoUrl(m.Foto);
  openModal(`
    <div class="modal-title">Editar michi <span class="icon-btn-sm" id="cerrar-modal">✕</span></div>
    <form id="form-editar">
      <div class="form-group">
        <label>Foto</label>
        <div class="foto-picker">
          <img id="e-foto-preview" class="foto-preview" src="${urlActual || ''}" style="${urlActual ? '' : 'display:none;'}">
          <div id="e-foto-preview-vacia" class="foto-preview" style="${urlActual ? 'display:none;' : 'display:flex;align-items:center;justify-content:center;font-size:22px;'}">🐾</div>
          <div>
            <input type="file" id="e-input-foto" accept="image/*" style="display:none;">
            <button type="button" class="btn btn-secondary" id="e-btn-elegir-foto">Cambiar foto</button>
            <div class="form-hint">Se comprime automáticamente antes de subir.</div>
          </div>
        </div>
      </div>
      <div class="form-group"><label>Nombre</label><input type="text" id="e-nombre" value="${escapeHtml(m.Nombre || '')}"></div>
      <div class="form-group">
        <label>Sexo</label>
        <select id="e-sexo">
          ${['Macho','Hembra','Desconocido'].map(v => `<option value="${v}" ${m.Sexo===v?'selected':''}>${v}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Color</label><input type="text" id="e-color" value="${escapeHtml(m.Color || '')}"></div>
      <div class="form-group"><label>Fecha de rescate</label><input type="date" id="e-fecha" value="${m.Fecha_rescate || ''}"></div>
      <div class="form-group"><label>Dirección de referencia</label><input type="text" id="e-direccion" value="${escapeHtml(m.Direccion_referencia || '')}"></div>
      <div class="form-group"><label>Comentarios</label><textarea id="e-comentarios">${escapeHtml(m.Comentarios || '')}</textarea></div>
      <button type="submit" class="btn btn-primary btn-block">Guardar cambios</button>
    </form>
  `);
  document.getElementById('cerrar-modal').addEventListener('click', closeModal);

  document.getElementById('e-btn-elegir-foto').addEventListener('click', () => {
    document.getElementById('e-input-foto').click();
  });
  document.getElementById('e-input-foto').addEventListener('change', async (e) => {
    const archivo = e.target.files[0];
    if (!archivo) return;
    try{
      fotoEditSeleccionada = await comprimirImagen(archivo);
      const previewUrl = URL.createObjectURL(fotoEditSeleccionada);
      const img = document.getElementById('e-foto-preview');
      img.src = previewUrl; img.style.display = 'block';
      document.getElementById('e-foto-preview-vacia').style.display = 'none';
    }catch(err){
      toast('No se pudo procesar la imagen', 'error');
    }
  });

  document.getElementById('form-editar').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnGuardar = e.target.querySelector('button[type=submit]');
    btnGuardar.disabled = true; btnGuardar.textContent = 'Guardando…';
    try{
      const payload = {
        Nombre: document.getElementById('e-nombre').value.trim(),
        Sexo: document.getElementById('e-sexo').value,
        Color: document.getElementById('e-color').value.trim(),
        Fecha_rescate: document.getElementById('e-fecha').value,
        Direccion_referencia: document.getElementById('e-direccion').value.trim(),
        Comentarios: document.getElementById('e-comentarios').value.trim(),
      };

      let rutaAntigua = null;
      if (fotoEditSeleccionada){
        payload.Foto = await subirFoto(fotoEditSeleccionada);
        rutaAntigua = m.Foto || null;
      }

      await actualizarMichi(id, payload);

      // borramos la foto anterior del storage solo después de que la nueva se guardó bien
      if (rutaAntigua) await sb.storage.from(BUCKET).remove([rutaAntigua]);

      await cargarMichis(true);
      closeModal();
      toast('Cambios guardados', 'success');
      renderListado(michisCache);
    }catch(err){
      toast('Error al guardar: ' + err.message, 'error');
      btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar cambios';
    }
  });
}

function exportarCSV(michis){
  const cols = ['id','Nombre','Sexo','Color','Fecha_rescate','Latitud','Longitud','Direccion_referencia','Comentarios'];
  const filas = [cols.join(',')];
  michis.forEach(m => {
    filas.push(cols.map(c => `"${String(m[c] ?? '').replace(/"/g,'""')}"`).join(','));
  });
  const blob = new Blob([filas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `equipo-michi-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

/* ==========================================================
   VISTA: Estadísticas
   ========================================================== */
async function vistaEstadisticas(){
  $content.innerHTML = `<p class="empty-hint">Cargando…</p>`;
  const michis = await cargarMichis();

  if (michis.length === 0){
    $content.innerHTML = `<p class="empty-hint">Aún no hay datos suficientes para mostrar estadísticas.</p>`;
    return;
  }

  // por año
  const porAnio = {};
  michis.forEach(m => { const a = anioDe(m.Fecha_rescate) || 'Sin fecha'; porAnio[a] = (porAnio[a] || 0) + 1; });
  const aniosOrdenados = Object.keys(porAnio).sort();

  // por sexo
  const porSexo = { Macho: 0, Hembra: 0, Desconocido: 0 };
  michis.forEach(m => { const s = m.Sexo && porSexo.hasOwnProperty(m.Sexo) ? m.Sexo : 'Desconocido'; porSexo[s]++; });

  // por color
  const porColor = {};
  michis.forEach(m => { const c = (m.Color || 'Sin especificar').trim() || 'Sin especificar'; porColor[c] = (porColor[c] || 0) + 1; });
  const coloresOrdenados = Object.entries(porColor).sort((a,b) => b[1]-a[1]).slice(0, 8);

  const conUbicacion = michis.filter(m => m.Latitud != null && m.Longitud != null);

  $content.innerHTML = `
    <div class="section-title">Rescates por año</div>
    <div class="card"><div class="chart-wrap"><canvas id="chart-anio"></canvas></div></div>

    <div class="section-title">Machos y hembras</div>
    <div class="card"><div class="chart-wrap"><canvas id="chart-sexo"></canvas></div></div>

    <div class="section-title">Colores más comunes</div>
    <div class="card"><div class="chart-wrap"><canvas id="chart-color"></canvas></div></div>

    <div class="section-title">Todas las localizaciones</div>
    <div class="card">
      <div id="mapa-general"></div>
      ${conUbicacion.length === 0 ? `<p class="empty-hint">No hay michis con ubicación guardada todavía.</p>` : ''}
    </div>
  `;

  const paletaTexto = '#98a3b3';
  Chart.defaults.color = paletaTexto;
  Chart.defaults.borderColor = '#303a48';

  new Chart(document.getElementById('chart-anio'), {
    type: 'bar',
    data: { labels: aniosOrdenados, datasets: [{ label: 'Michis rescatados', data: aniosOrdenados.map(a => porAnio[a]), backgroundColor: '#f5a524', borderRadius: 6 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  new Chart(document.getElementById('chart-sexo'), {
    type: 'doughnut',
    data: {
      labels: Object.keys(porSexo),
      datasets: [{ data: Object.values(porSexo), backgroundColor: ['#6fb3a0', '#ef7b6a', '#8b95a5'] }]
    },
    options: { plugins: { legend: { position: 'bottom' } } }
  });

  new Chart(document.getElementById('chart-color'), {
    type: 'bar',
    data: {
      labels: coloresOrdenados.map(c => c[0]),
      datasets: [{ label: 'Michis', data: coloresOrdenados.map(c => c[1]), backgroundColor: '#ef7b6a', borderRadius: 6 }]
    },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  if (conUbicacion.length > 0){
    const map = L.map('mapa-general');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    const bounds = [];
    conUbicacion.forEach(m => {
      L.circleMarker([m.Latitud, m.Longitud], { radius: 6, color: '#f5a524', fillColor: '#f5a524', fillOpacity: .85, weight: 2 })
        .addTo(map).bindPopup(`<b>${escapeHtml(m.Nombre || 'Michi')}</b><br>${formatFecha(m.Fecha_rescate)}`);
      bounds.push([m.Latitud, m.Longitud]);
    });
    map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
  }
}

/* ==========================================================
   Ocultar el menú inferior cuando el teclado móvil está abierto
   (evita que el botón "Guardar" quede atrapado entre el teclado
   y el menú fijo)
   ========================================================== */
if (window.visualViewport){
  const alturaBase = window.visualViewport.height;
  window.visualViewport.addEventListener('resize', () => {
    const encogido = alturaBase - window.visualViewport.height > 140;
    document.body.classList.toggle('teclado-abierto', encogido);
  });
}

/* ==========================================================
   Arranque
   ========================================================== */
route();
