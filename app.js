const SUPABASE_URL = "https://idswjzbrpneordatkqan.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlkc3dqemJycG5lb3JkYXRrcWFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3OTM2MjMsImV4cCI6MjEwNDM2OTYyM30.GmPqlWn3_EZTy23Oziw_N4DuoKDVAhqr6YHnlKBB2Gw";

const PASAJERO_ID_PRUEBA = "5";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let origen = null;
let destino = null;
let marcadorOrigen = null;
let marcadorDestino = null;
let timerBusqueda = null;

const statusText = document.getElementById('status-text');
const btnAction = document.getElementById('btn-action');

// Captura de inputs y listas de sugerencias
const inputOrigen = document.getElementById('input-origen');
const inputDestino = document.getElementById('input-destino');
const sugerenciasOrigen = document.getElementById('sugerencias-origen');
const sugerenciasDestino = document.getElementById('sugerencias-destino');

const map = L.map('map').setView([0, 0], 2);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '© OpenStreetMap'
}).addTo(map);

// 1. Geolocalización automática
if ("geolocation" in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      origen = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      map.setView([origen.lat, origen.lon], 15);

      marcadorOrigen = L.marker([origen.lat, origen.lon])
        .addTo(map)
        .bindPopup("Tu ubicación")
        .openPopup();

      statusText.innerText = "Ingresa una dirección o toca el mapa.";
    },
    (err) => {
      statusText.innerText = "Permiso de ubicación denegado o GPS desactivado.";
    }
  );
}

// 2. Selección de Destino tocando el mapa
map.on('click', (e) => {
  destino = { lat: e.latlng.lat, lon: e.latlng.lng };

  if (marcadorDestino) {
    marcadorDestino.setLatLng(e.latlng);
  } else {
    marcadorDestino = L.marker([destino.lat, destino.lon]).addTo(map);
  }

  actualizarCalculoRuta();
});

// 3. Autocompletado de direcciones en tiempo real (Nominatim API)
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
    } catch (err) {
      console.error("Error al buscar sugerencias:", err);
    }
  }, 400);
}

// Escuchar escritura en Origen
inputOrigen.addEventListener('input', () => {
  buscarSugerencias(inputOrigen.value, sugerenciasOrigen, (lat, lon, nombre) => {
    inputOrigen.value = nombre;
    origen = { lat, lon };

    if (marcadorOrigen) {
      marcadorOrigen.setLatLng([lat, lon]);
    } else {
      marcadorOrigen = L.marker([lat, lon]).addTo(map);
    }

    map.setView([lat, lon], 15);
    marcadorOrigen.bindPopup("Origen").openPopup();
    actualizarCalculoRuta();
  });
});

// Escuchar escritura en Destino
inputDestino.addEventListener('input', () => {
  buscarSugerencias(inputDestino.value, sugerenciasDestino, (lat, lon, nombre) => {
    inputDestino.value = nombre;
    destino = { lat, lon };

    if (marcadorDestino) {
      marcadorDestino.setLatLng([lat, lon]);
    } else {
      marcadorDestino = L.marker([lat, lon]).addTo(map);
    }

    actualizarCalculoRuta();
  });
});

// Actualizar cálculo de tarifa y encuadre del mapa
function actualizarCalculoRuta() {
  if (origen && destino) {
    const grupo = new L.featureGroup([marcadorOrigen, marcadorDestino]);
    map.fitBounds(grupo.getBounds().pad(0.2));

    const distanciaKm = calcularDistancia(origen.lat, origen.lon, destino.lat, destino.lon);
    const tarifaEstimada = Math.round(5000 + (distanciaKm * 2000));
    
    statusText.innerText = `Tarifa estimada: $${tarifaEstimada}`;
    btnAction.dataset.tarifa = tarifaEstimada;
    btnAction.innerText = "Pedir Viaje Ahora";
  }
}

// 4. Crear Viaje en Supabase
btnAction.addEventListener('click', async () => {
  if (!origen || !destino) {
    alert("Debes seleccionar un origen y un destino.");
    return;
  }

  btnAction.disabled = true;
  btnAction.innerText = "Solicitando viaje...";

  const tarifa = parseFloat(btnAction.dataset.tarifa) || 5000;

  const { data, error } = await supabaseClient
    .from('viajes')
    .insert([
      {
        pasajero_id: PASAJERO_ID_PRUEBA,
        origen_lat: origen.lat,
        origen_lon: origen.lon,
        destino_lat: destino.lat,
        destino_lon: destino.lon,
        tarifa: tarifa,
        estado: 'solicitado'
      }
    ])
    .select();

  if (error) {
    console.error("Error al crear viaje:", error);
    statusText.innerText = "Error al solicitar el viaje. Revisa la consola.";
    btnAction.disabled = false;
    btnAction.innerText = "Pedir Viaje Ahora";
  } else {
    console.log("Viaje registrado:", data);
    statusText.innerText = "¡Viaje solicitado! Buscando conductor...";
    btnAction.innerText = "Buscando Conductor...";

    const nuevoViajeId = data[0].id;
    escucharEstadoViaje(nuevoViajeId);
  }
});

// Función matemática auxiliar (Fórmula Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 5. Escuchar cambios en tiempo real del viaje
function escucharEstadoViaje(viajeId) {
  supabaseClient
    .channel(`viaje-${viajeId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'viajes',
        filter: `id=eq.${viajeId}`
      },
      (payload) => {
        const viajeActualizado = payload.new;
        
        if (viajeActualizado.estado === 'aceptado') {
          statusText.innerText = "¡Un conductor ha aceptado tu viaje! Está en camino.";
          btnAction.innerText = "En Ruta";
        } else if (viajeActualizado.estado === 'completado') {
          statusText.innerText = "¡Has llegado a tu destino!";
          btnAction.innerText = "Viaje Finalizado";
        }
      }
    )
    .subscribe();
}