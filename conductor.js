const SUPABASE_URL = "https://idswjzbrpneordatkqan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3dqemJycG5lb3JkYXRrcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTM2MjMsImV4cCI6MjEwNDM2OTYyM30.GmPqlWn3_EZTy23Oziw_N4DuoKDVAhqr6YHnlKBB2Gw";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let viajePendiente = null;
let marcadorOrigen = null;
let marcadorDestino = null;

const statusText = document.getElementById('status-text');
const btnAction = document.getElementById('btn-action');

// Mapa de Bogotá por defecto
const map = L.map('map').setView([4.6097, -74.0817], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// 1. Buscar si ya hay viajes solicitados al abrir la pantalla
async function buscarViajesDisponibles() {
  const { data, error } = await supabaseClient
    .from('viajes')
    .select('*')
    .eq('estado', 'solicitado')
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error("Error al buscar viajes:", error);
    return;
  }

  if (data && data.length > 0) {
    mostrarViajeEnMapa(data[0]);
  } else {
    statusText.innerText = "Esperando nuevas solicitudes de viaje...";
    btnAction.style.display = "none";
  }
}

// 2. Renderizar ruta y marcadores en el mapa del conductor
function mostrarViajeEnMapa(viaje) {
  viajePendiente = viaje;

  if (marcadorOrigen) map.removeLayer(marcadorOrigen);
  if (marcadorDestino) map.removeLayer(marcadorDestino);

  marcadorOrigen = L.marker([viaje.origen_lat, viaje.origen_lon])
    .addTo(map)
    .bindPopup("Origen del Pasajero");

  marcadorDestino = L.marker([viaje.destino_lat, viaje.destino_lon])
    .addTo(map)
    .bindPopup("Destino");

  // Ajustar la cámara para ver ambos marcadores
  const grupoMarcadores = new L.featureGroup([marcadorOrigen, marcadorDestino]);
  map.fitBounds(grupoMarcadores.getBounds().pad(0.2));

  statusText.innerText = `¡Nuevo viaje disponible! Tarifa: $${viaje.tarifa}`;
  btnAction.style.display = "block";
  btnAction.innerText = "Aceptar Viaje";
  btnAction.disabled = false;
}

// 3. Actualizar estado del viaje al presionar el botón
btnAction.addEventListener('click', async () => {
  if (!viajePendiente) return;

  btnAction.disabled = true;
  btnAction.innerText = "Aceptando...";

  const { data, error } = await supabaseClient
    .from('viajes')
    .update({ estado: 'aceptado' })
    .eq('id', viajePendiente.id)
    .select();

  if (error) {
    console.error("Error al aceptar viaje:", error);
    statusText.innerText = "Error al aceptar el viaje.";
    btnAction.disabled = false;
    btnAction.innerText = "Aceptar Viaje";
  } else {
    statusText.innerText = "¡Viaje aceptado! Dirígete a recoger al pasajero.";
    btnAction.innerText = "En Viaje";
  }
});

// 4. Escuchar en tiempo real cuando un pasajero cree una solicitud
supabaseClient
  .channel('solicitudes-viajes')
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'viajes'
    },
    (payload) => {
      if (payload.new.estado === 'solicitado') {
        mostrarViajeEnMapa(payload.new);
      }
    }
  )
  .subscribe();

buscarViajesDisponibles();