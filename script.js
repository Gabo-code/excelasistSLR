document.addEventListener('DOMContentLoaded', () => {
    // Variables para los parámetros de ubicación
    let TARGET_LAT;
    let TARGET_LON;
    let MAX_DISTANCE_METERS;

    // Referencias a elementos del DOM
    const mapElement = document.getElementById('map');
    const toggleMapButton = document.getElementById('toggleMapButton');
    const driverSelect = document.getElementById('driverSelect');
    const attendanceForm = document.getElementById('attendanceForm');
    const messageElement = document.getElementById('message');
    const timestampInput = document.getElementById('timestamp');
    const vehicleTypeSelect = document.getElementById('vehicleTypeSelect');

    // URL del Google Apps Script
    const googleAppScriptUrl = 'https://script.google.com/macros/s/AKfycbzgd3dsxH6LX_RIhRiE5Porrh9IhDllN-NZs90ejXPBHJZwj_oBZU_jHEXCEEh5bhdvsg/exec';

    // Variables del mapa
    let map = null;
    let userMarker = null;
    let targetMarker = null;
    let radiusCircle = null;

    // Variables de la cámara
    let stream = null;
    let photoTaken = false;
    const cameraPreview = document.getElementById('cameraPreview');
    const photoCanvas = document.getElementById('photoCanvas');
    const photoPreview = document.getElementById('photoPreview');
    const startCameraButton = document.getElementById('startCamera');
    const takePhotoButton = document.getElementById('takePhoto');
    const retakePhotoButton = document.getElementById('retakePhoto');
    const cameraStatus = document.getElementById('cameraStatus');

    // Función para obtener o generar PID
    async function getOrGeneratePID() {
        let pid = localStorage.getItem('driverPID');
        if (!pid) {
            try {
                const response = await fetch(`${googleAppScriptUrl}?action=generatePID`);
                const data = await response.json();
                pid = data.pid;
                localStorage.setItem('driverPID', pid);
            } catch (error) {
                console.error('Error al generar PID:', error);
                throw error;
            }
        }
        return pid;
    }

    // Función para cargar los parámetros de ubicación
    async function loadLocationParams() {
        try {
            const response = await fetch(`${googleAppScriptUrl}?action=getLocationParams`);
            if (!response.ok) throw new Error('Error en la respuesta del servidor');
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            TARGET_LAT = data.latitud;
            TARGET_LON = data.longitud;
            MAX_DISTANCE_METERS = data.radio;

            console.log('Parámetros de ubicación cargados:', { TARGET_LAT, TARGET_LON, MAX_DISTANCE_METERS });
            
            // Inicializar el mapa después de cargar los parámetros
            if (mapElement.classList.contains('visible')) {
                initializeMap();
            }
        } catch (error) {
            console.error('Error al cargar parámetros de ubicación:', error);
            messageElement.textContent = 'Error al cargar parámetros de ubicación';
            messageElement.className = 'error';
        }
    }

    // Función para inicializar el mapa
    function initializeMap() {
        if (!TARGET_LAT || !TARGET_LON || !MAX_DISTANCE_METERS) {
            console.error('Parámetros de ubicación no cargados');
            return;
        }

        if (map) {
            setTimeout(() => {
                map.invalidateSize();
                map.setView([TARGET_LAT, TARGET_LON], 17);
            }, 100);
            return;
        }

        // Asegurarnos que el contenedor sea visible temporalmente para la inicialización
        mapElement.style.height = '400px';
        mapElement.style.opacity = '1';

        // Crear el mapa
        map = L.map('map', {
            center: [TARGET_LAT, TARGET_LON],
            zoom: 17,
            zoomControl: true,
            attributionControl: true,
            fadeAnimation: true
        });

        // Agregar capa de tiles con mejor manejo de carga
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            minZoom: 15,
            attribution: '© OpenStreetMap contributors',
            tileSize: 256,
            updateWhenIdle: false,
            updateWhenZooming: true,
            keepBuffer: 2
        }).addTo(map);

        // Agregar marcador objetivo
        targetMarker = L.marker([TARGET_LAT, TARGET_LON], {
            title: 'Ubicación Permitida'
        }).addTo(map);

        // Agregar círculo de radio
        radiusCircle = L.circle([TARGET_LAT, TARGET_LON], {
            radius: MAX_DISTANCE_METERS,
            color: '#2196F3',
            fillColor: '#2196F3',
            fillOpacity: 0.2,
            weight: 2
        }).addTo(map);

        // Agregar popup al marcador objetivo
        targetMarker.bindPopup('Zona de registro permitida').openPopup();

        // Restaurar el estado inicial del contenedor
        mapElement.style.height = '';
        mapElement.style.opacity = '';

        // Forzar una actualización del mapa después de la inicialización
        setTimeout(() => {
            map.invalidateSize(true);
            map.setView([TARGET_LAT, TARGET_LON], 17);
        }, 100);
    }

    // Función para mostrar/ocultar el mapa
    function toggleMap() {
        const isVisible = mapElement.classList.contains('visible');
        
        if (!isVisible) {
            // Mostrar el mapa
            mapElement.classList.add('visible');
            toggleMapButton.textContent = 'Ocultar Mapa';
            
            // Inicializar o actualizar el mapa con un retraso suficiente
            setTimeout(() => {
                if (!map) {
                    initializeMap();
                } else {
                    map.invalidateSize(true);
                    map.setView([TARGET_LAT, TARGET_LON], 17);
                }
                
                // Iniciar seguimiento de ubicación cuando se muestra el mapa
                if ("geolocation" in navigator) {
                    navigator.geolocation.watchPosition(
                        updateUserLocation,
                        (error) => {
                            console.error('Error al obtener ubicación:', error);
                            messageElement.textContent = 'Error al obtener tu ubicación. Por favor, permite el acceso a la ubicación.';
                            messageElement.className = 'error';
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 5000,
                            maximumAge: 0
                        }
                    );
                } else {
                    messageElement.textContent = 'Tu navegador no soporta geolocalización';
                    messageElement.className = 'error';
                }
            }, 300); // Aumentado el retraso para asegurar que la transición CSS se complete
        } else {
            // Ocultar el mapa
            mapElement.classList.remove('visible');
            toggleMapButton.textContent = 'Mostrar Mapa';
        }
    }

    // Función para actualizar el marcador del usuario
    function updateUserLocation(position) {
        const { latitude, longitude } = position.coords;

        // Crear un icono personalizado rojo
        const redIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: #e53935; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.3);"></div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        });

        if (userMarker) {
            userMarker.setLatLng([latitude, longitude]);
        } else {
            userMarker = L.marker([latitude, longitude], {
                icon: redIcon,
                title: 'Tu ubicación'
            }).addTo(map);
        }

        map.setView([latitude, longitude], map.getZoom());
    }

    // Función para calcular distancia (Haversine)
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371e3; // Radio de la tierra en metros
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                 Math.cos(φ1) * Math.cos(φ2) *
                 Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    // Función para actualizar el timestamp
    function updateTimestamp() {
        const now = new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        timestampInput.value = `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`;
    }

    // Función para cargar conductores
    async function fetchDrivers() {
        try {
            const pid = await getOrGeneratePID();
            
            // Primero, verificar si el usuario ya tiene un conductor asignado
            const driverResponse = await fetch(`${googleAppScriptUrl}?action=getDriverByPID&pid=${pid}`);
            const driverData = await driverResponse.json();
            
            if (driverData && driverData.driver && driverData.driver.name) {
                // Si el conductor está asignado, mostrar solo ese conductor
                driverSelect.innerHTML = `<option value="${driverData.driver.name}" selected>${driverData.driver.name}</option>`;
                vehicleTypeSelect.value = driverData.driver.vehicle;
                vehicleTypeSelect.disabled = true;
                return;
            }

            // Si no tiene conductor asignado, mostrar conductores disponibles
            const availableResponse = await fetch(`${googleAppScriptUrl}?action=getAvailableDrivers`);
            const availableData = await availableResponse.json();
            
            driverSelect.innerHTML = '<option value="">-- Selecciona un conductor --</option>';
            availableData.drivers.forEach(driver => {
                const option = document.createElement('option');
                option.value = driver.name;
                option.textContent = driver.name;
                driverSelect.appendChild(option);
            });
            
            vehicleTypeSelect.disabled = false;
        } catch (error) {
            console.error('Error al cargar conductores:', error);
            messageElement.textContent = 'Error al cargar la lista de conductores';
            messageElement.className = 'error';
        }
    }

    // Función para iniciar la cámara
    async function startCamera() {
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            cameraPreview.srcObject = stream;
            startCameraButton.style.display = 'none';
            takePhotoButton.disabled = false;
            cameraPreview.style.display = 'block';
            photoPreview.style.display = 'none';
            cameraStatus.textContent = 'Cámara activada';
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            cameraStatus.textContent = 'Error al acceder a la cámara. Por favor, permite el acceso.';
        }
    }

    // Función para tomar la foto
    function takePhoto() {
        const context = photoCanvas.getContext('2d');
        photoCanvas.width = cameraPreview.videoWidth;
        photoCanvas.height = cameraPreview.videoHeight;
        context.drawImage(cameraPreview, 0, 0, photoCanvas.width, photoCanvas.height);
        
        photoPreview.src = photoCanvas.toDataURL('image/jpeg');
        photoPreview.style.display = 'block';
        cameraPreview.style.display = 'none';
        takePhotoButton.style.display = 'none';
        retakePhotoButton.style.display = 'inline-block';
        
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        
        photoTaken = true;
        cameraStatus.textContent = 'Foto capturada';
    }

    // Función para volver a tomar la foto
    function retakePhoto() {
        photoTaken = false;
        photoPreview.style.display = 'none';
        retakePhotoButton.style.display = 'none';
        startCameraButton.style.display = 'inline-block';
        takePhotoButton.style.display = 'inline-block';
        takePhotoButton.disabled = true;
        cameraStatus.textContent = '';
        
        // Asegurarse de detener cualquier stream existente
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }

        // Iniciar la cámara automáticamente
        startCamera();
    }

    // Función para verificar salidas pendientes
    async function checkPendingExits(driverName) {
        try {
            const response = await fetch(`${googleAppScriptUrl}?action=checkPendingExits&driverName=${encodeURIComponent(driverName)}`);
            const data = await response.json();
            return data.hasPendingExit;
        } catch (error) {
            console.error('Error al verificar salidas pendientes:', error);
            throw error;
        }
    }

    // Event Listeners
    toggleMapButton.addEventListener('click', toggleMap);

    attendanceForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        // Obtener el botón de submit y deshabilitarlo
        const submitButton = event.target.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Procesando...';

        // Validar que los parámetros de ubicación estén disponibles
        if (!TARGET_LAT || !TARGET_LON || !MAX_DISTANCE_METERS) {
            messageElement.textContent = 'Error: Parámetros de ubicación no disponibles. Por favor, recarga la página.';
            messageElement.className = 'error';
            submitButton.disabled = false;
            submitButton.textContent = 'Registrar Asistencia';
            return;
        }

        // Validar que se haya tomado la foto
        if (!photoTaken) {
            messageElement.textContent = 'Por favor, toma una foto antes de registrar la asistencia';
            messageElement.className = 'error';
            // Reactivar el botón si hay error
            submitButton.disabled = false;
            submitButton.textContent = 'Registrar Asistencia';
            return;
        }

        // Validar la ubicación del usuario
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
            });

            const distance = calculateDistance(
                position.coords.latitude,
                position.coords.longitude,
                TARGET_LAT,
                TARGET_LON
            );

            if (distance > MAX_DISTANCE_METERS) {
                messageElement.textContent = `Estás fuera del radio permitido (${Math.round(distance)} metros del punto de registro)`;
                messageElement.className = 'error';
                submitButton.disabled = false;
                submitButton.textContent = 'Registrar Asistencia';
                return;
            }
        } catch (error) {
            messageElement.textContent = 'Error al obtener tu ubicación. Por favor, permite el acceso a la ubicación y asegúrate de tener GPS activado.';
            messageElement.className = 'error';
            submitButton.disabled = false;
            submitButton.textContent = 'Registrar Asistencia';
            return;
        }

        const driverName = driverSelect.value;
        const vehicleType = vehicleTypeSelect.value;
        const timestamp = timestampInput.value;

        // Verificar tiempo de standby
        try {
            const standbyResponse = await fetch(`${googleAppScriptUrl}?action=checkDriverStandby&driverName=${encodeURIComponent(driverName)}`);
            const standbyData = await standbyResponse.json();

            if (!standbyData.canRegister) {
                messageElement.textContent = `Te quedan ${standbyData.remainingMinutes} minutos en standby`;
                messageElement.className = 'error';
                // Reactivar el botón si hay error
                submitButton.disabled = false;
                submitButton.textContent = 'Registrar Asistencia';
                return;
            }

            // Verificar salidas pendientes antes de permitir el registro
            const pendingResponse = await fetch(`${googleAppScriptUrl}?action=checkPendingExits&driverName=${encodeURIComponent(driverName)}`);
            const pendingData = await pendingResponse.json();

            if (pendingData.hasPendingExit) {
                messageElement.textContent = 'Tienes una salida pendiente';
                messageElement.className = 'error';
                // Reactivar el botón si hay error
                submitButton.disabled = false;
                submitButton.textContent = 'Registrar Asistencia';
                return;
            }

            // Si no hay salidas pendientes, proceder con el registro
            const pid = await getOrGeneratePID();

            // Obtener la foto del canvas
            const photoDataUrl = photoCanvas.toDataURL('image/jpeg');

            // Preparar los datos del formulario
            const formData = new FormData();
            formData.append('driver', driverName);
            formData.append('vehicleType', vehicleType);
            formData.append('timestamp', timestamp);
            formData.append('photo', photoDataUrl);
            formData.append('pid', pid);

            // Enviar los datos
            const response = await fetch(googleAppScriptUrl, {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Si es la primera vez que el conductor marca asistencia, asignar PID
            const driverResponse = await fetch(`${googleAppScriptUrl}?action=getDriverByPID&pid=${pid}`);
            const driverData = await driverResponse.json();

            if (!driverData.driver) {
                const assignResponse = await fetch(`${googleAppScriptUrl}?action=assignDriverPID`, {
                    method: 'POST',
                    body: new URLSearchParams({
                        driverName: driverName,
                        pid: pid,
                        vehicleType: vehicleType
                    })
                });
                const assignData = await assignResponse.json();
                if (assignData.error) {
                    console.error('Error al asignar PID:', assignData.error);
                }
            }

            messageElement.textContent = 'Asistencia registrada correctamente';
            messageElement.className = 'success';
            photoTaken = false;
            photoPreview.style.display = 'none';
            cameraPreview.style.display = 'block';
            startCamera();

            // El botón permanece deshabilitado después de un registro exitoso
            // Forzar recarga de la página después de 2 segundos
            setTimeout(() => {
                window.location.reload();
            }, 2000);

        } catch (error) {
            console.error('Error:', error);
            messageElement.textContent = 'Error al registrar la asistencia: ' + error.message;
            messageElement.className = 'error';
            // Reactivar el botón si hay error
            submitButton.disabled = false;
            submitButton.textContent = 'Registrar Asistencia';
        }
    });

    // Event listeners para la cámara
    startCameraButton.addEventListener('click', startCamera);
    takePhotoButton.addEventListener('click', takePhoto);
    retakePhotoButton.addEventListener('click', retakePhoto);

    // Cargar datos iniciales
    loadLocationParams();
    fetchDrivers();
    updateTimestamp();
    
    // Actualizar el timestamp cada minuto
    setInterval(updateTimestamp, 60000);
}); 