const SUPABASE_URL = "https://idswjzbrpneordatkqan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3dqemJycG5lb3JkYXRrcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTM2MjMsImV4cCI6MjEwNDM2OTYyM30.GmPqlWn3_EZTy23Oziw_N4DuoKDVAhqr6YHnlKBB2Gw";

const PASAJERO_ID_PRUEBA = "5";
const CONDUCTOR_ID_PRUEBA = "10";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Variables de Estado
let modoActual = 'pasajero'; // 'pasajero' o 'conductor'
let origen = null;
let destino = null;
let marcadorOrigen = null;
let marcadorDestino = null;
let timerBusqueda = null;

// Elementos DOM
const btnCambiarModo = document.getElementById('btn-cambiar-modo');
const uiPasajero = document.getElementById('ui-pasajero');
const uiConductor = document.getElementById('ui-conductor');

const inputOrigen = document.getElementById('input-origen');
const inputDestino = document.getElementById('input-destino');
const sugerenciasOrigen = document.getElementById('sugerencias-origen');
const sugerenciasDestino = document.getElementById('sugerencias-destino');

const statusTextPasajero = document.getElementById('status-text-pasajero');
const btnPedirViaje = document.getElementById('btn-pedir-viaje');

const statusTextConductor = document.getElementById('status-text-conductor');
const contenedorSolicitudes = document.getElementById('contenedor-solicitudes');

// Inicialización del Mapa
const map = L.map('map').setView([0, 0], 2);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// Geolocalización
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      origen = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      map.setView([origen.lat, origen.lon], 15);
      marcadorOrigen = L.marker([origen.lat, origen.lon]).addTo(map).bindPopup("Tu ubicación").openPopup();
    },
    () => { statusTextPasajero.innerText = "GPS desactivado o sin permisos."; }
  );
}

// -------------------------------------------------------------
// CONTROL DE CAMBIO DE MODO (Pasajero <-> Conductor)
// -------------------------------------------------------------
btnCambiarModo.addEventListener('click', () => {
  if (modoActual === 'pasajero') {
    modoActual = 'conductor';
    btnCambiarModo.innerText = "Modo: 🚗 Conductor (Cambiar a Pasajero)";
    uiPasajero.classList.add('oculto');
    uiConductor.classList.remove('oculto');
    cargarViajesSolicitados();
  } else {
    modoActual = 'pasajero';
    btnCambiarModo.innerText = "Modo: 🧍 Pasajero (Cambiar a Conductor)";
    uiConductor.classList.add('oculto');
    uiPasajero.classList.remove('oculto');
  }
});

// -------------------------------------------------------------
// LÓGICA PASAJERO
// -------------------------------------------------------------
map.on('click', (e) => {
  if (modoActual !== 'pasajero') return;
  destino = { lat: e.latlng.lat, lon: e.latlng.lng };

  if (marcadorDestino) {
    marcadorDestino.setLatLng(e.latlng);
  } else {
    marcadorDestino = L.marker([destino.lat, destino.lon]).addTo(map);
  }

  actualizarCalculoRuta();
});

function buscarSugerencias(texto, contenedor, alSeleccionar) {
  clearTimeout(timerBusqueda);
  contenedor.innerHTML = "";
  if (texto.trim().length < 3) return;

  timerBusqueda = setTimeout(async () => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(texto)}&limit=5`);
      const datos = await res.json();
      contenedor.innerHTML = "";

      datos.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'sugerencia-item';
        div.innerText = item.display_name;
        div.addEventListener('click', () => {
          alSeleccionar(parseFloat(item.lat), parseFloat(item.lon), item.display_name);
          contenedor.innerHTML = "";
        });
        contenedor.appendChild(div);
      });
    } catch (err) { console.error(err); }
  }, 400);
}

inputOrigen.addEventListener('input', () => {
  buscarSugerencias(inputOrigen.value, sugerenciasOrigen, (lat, lon, nombre) => {
    inputOrigen.value = nombre;
    origen = { lat, lon };
    if (marcadorOrigen) marcadorOrigen.setLatLng([lat, lon]);
    else marcadorOrigen = L.marker([lat, lon]).addTo(map);
    map.setView([lat, lon], 15);
    actualizarCalculoRuta();
  });
});

inputDestino.addEventListener('input', () => {
  buscarSugerencias(inputDestino.value, sugerenciasDestino, (lat, lon, nombre) => {
    inputDestino.value = nombre;
    destino = { lat, lon };
    if (marcadorDestino) marcadorDestino.setLatLng([lat, lon]);
    else marcadorDestino = L.marker([lat, lon]).addTo(map);
    actualizarCalculoRuta();
  });
});

function actualizarCalculoRuta() {
  if (origen && destino) {
    const grupo = new L.featureGroup([marcadorOrigen, marcadorDestino]);
    map.fitBounds(grupo.getBounds().pad(0.2));

    const distanciaKm = calcularDistancia(origen.lat, origen.lon, destino.lat, destino.lon);
    const tarifaEstimada = Math.round(5000 + (distanciaKm * 2000));
    
    statusTextPasajero.innerText = `Tarifa estimada: $${tarifaEstimada}`;
    btnPedirViaje.dataset.tarifa = tarifaEstimada;
    btnPedirViaje.innerText = "Pedir Viaje Ahora";
  }
}

btnPedirViaje.addEventListener('click', async () => {
  if (!origen || !destino) return alert("Selecciona origen y destino.");

  btnPedirViaje.disabled = true;
  btnPedirViaje.innerText = "Solicitando...";

  const tarifa = parseFloat(btnPedirViaje.dataset.tarifa) || 5000;

  const { data, error } = await supabaseClient.from('viajes').insert([{
    pasajero_id: PASAJERO_ID_PRUEBA,
    origen_lat: origen.lat,
    origen_lon: origen.lon,
    destino_lat: destino.lat,
    destino_lon: destino.lon,
    tarifa: tarifa,
    estado: 'solicitado'
  }]).select();

  if (error) {
    alert("Error al solicitar viaje.");
    btnPedirViaje.disabled = false;
  } else {
    statusTextPasajero.innerText = "¡Viaje solicitado! Buscando conductor...";
    escucharEstadoViajePasajero(data[0].id);
  }
});

function escucharEstadoViajePasajero(viajeId) {
  supabaseClient.channel(`pasajero-viaje-${viajeId}`).on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'viajes', filter: `id=eq.${viajeId}`
  }, (payload) => {
    if (payload.new.estado === 'aceptado') {
      statusTextPasajero.innerText = "¡Un conductor ha aceptado tu viaje!";
      btnPedirViaje.innerText = "En Ruta";
    }
  }).subscribe();
}

// -------------------------------------------------------------
// LÓGICA CONDUCTOR
// -------------------------------------------------------------
async function cargarViajesSolicitados() {
  contenedorSolicitudes.innerHTML = "";
  statusTextConductor.innerText = "Buscando solicitudes cercanas...";

  const { data, error } = await supabaseClient
    .from('viajes')
    .select('*')
    .eq('estado', 'solicitado');

  if (data && data.length > 0) {
    statusTextConductor.innerText = `${data.length} viaje(s) disponible(s):`;
    data.forEach(viaje => renderizarTarjetaViaje(viaje));
  } else {
    statusTextConductor.innerText = "No hay viajes disponibles por ahora.";
  }
}

function renderizarTarjetaViaje(viaje) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'tarjeta-viaje';
  tarjeta.innerHTML = `
    <p><strong>Tarifa:</strong> $${viaje.tarifa}</p>
    <button class="btn-main" onclick="aceptarViaje(${viaje.id})">Aceptar Viaje</button>
  `;
  contenedorSolicitudes.appendChild(tarjeta);
}

async function aceptarViaje(viajeId) {
  const { error } = await supabaseClient
    .from('viajes')
    .update({ estado: 'aceptado', conductor_id: CONDUCTOR_ID_PRUEBA })
    .eq('id', viajeId);

  if (!error) {
    alert("¡Viaje aceptado exitosamente!");
    cargarViajesSolicitados();
  }
}

// Realtime para Conductor: detecta nuevos viajes en tiempo real
supabaseClient.channel('solicitudes-conductor').on('postgres_changes', {
  event: 'INSERT', schema: 'public', table: 'viajes'
}, () => {
  if (modoActual === 'conductor') cargarViajesSolicitados();
}).subscribe();

// Función auxiliar Haversine
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}
