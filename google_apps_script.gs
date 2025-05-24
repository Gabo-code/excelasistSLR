// Función para obtener la lista de asistencias
function getAttendances() {
  console.log("Iniciando getAttendances");
  const sheetName = "AsistenciasRegistradas";
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    console.log("Spreadsheet obtenida");
    
    const sheet = ss.getSheetByName(sheetName);
    console.log("Buscando hoja:", sheetName);

    if (!sheet) {
      console.error("Hoja no encontrada:", sheetName);
      return ContentService
            .createTextOutput(JSON.stringify({ error: "Hoja \'" + sheetName + "\' no encontrada." }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // Obtener los datos de la hoja
    console.log("Obteniendo datos de la hoja");
    const data = sheet.getDataRange().getValues();
    console.log("Datos obtenidos, filas totales:", data.length);
    
    if (data.length <= 1) {
      console.log("No hay registros en la hoja (solo encabezados o vacía)");
      return ContentService
            .createTextOutput(JSON.stringify({ attendances: [] }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const headers = data[0];
    console.log("Encabezados encontrados:", headers);

    // Encontrar los índices de las columnas
    const vehiculoIndex = headers.findIndex(header => header === "Vehículo");
    const nombreIndex = headers.findIndex(header => header === "Nombre");
    const ingresoIndex = headers.findIndex(header => header === "Fecha Hora Ingreso");
    const salidaIndex = headers.findIndex(header => header === "Fecha Hora Salida");

    console.log("Índices de columnas:", {
      vehiculo: vehiculoIndex,
      nombre: nombreIndex,
      ingreso: ingresoIndex,
      salida: salidaIndex
    });

    if (vehiculoIndex === -1 || nombreIndex === -1 || ingresoIndex === -1) {
      throw new Error("No se encontraron todas las columnas requeridas");
    }

    const attendances = data.slice(1).map(row => {
      return {
        vehicleType: row[vehiculoIndex] || '',
        driver: row[nombreIndex] || '',
        timestamp: row[ingresoIndex] || '',
        exitTime: salidaIndex !== -1 ? row[salidaIndex] || '' : ''
      };
    }).filter(record => record.driver && record.timestamp);

    console.log("Registros procesados:", attendances.length);
    
    const response = { attendances: attendances };
    console.log("Enviando respuesta con datos");
    
    return ContentService
          .createTextOutput(JSON.stringify(response))
          .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Error en getAttendances: " + error.toString() + " Stack: " + error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ error: "Error interno del servidor: " + error.toString() }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para verificar si un conductor tiene salidas pendientes
function checkPendingExits(driverName) {
  console.log("Verificando salidas pendientes para:", driverName);
  const sheetName = "AsistenciasRegistradas";
  
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      throw new Error("Hoja no encontrada: " + sheetName);
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Encontrar índices de columnas necesarias
    const nombreIndex = headers.findIndex(header => header === "Nombre");
    const salidaIndex = headers.findIndex(header => header === "Fecha Hora Salida");
    
    if (nombreIndex === -1 || salidaIndex === -1) {
      throw new Error("Columnas requeridas no encontradas");
    }

    // Buscar registros del conductor sin fecha de salida
    const pendingExits = data.slice(1).filter(row => 
      row[nombreIndex] === driverName && 
      (!row[salidaIndex] || row[salidaIndex].toString().trim() === "")
    );

    return {
      hasPendingExit: pendingExits.length > 0,
      count: pendingExits.length
    };

  } catch (error) {
    console.error("Error en checkPendingExits:", error.toString());
    throw error;
  }
}

// Función para obtener el tiempo de standby
function getStandbyTime() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Parametros");
    
    if (!sheet) {
      throw new Error("Hoja 'Parametros' no encontrada");
    }

    // Buscar la columna "Tiempo standby"
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const standbyIndex = headers.findIndex(header => header === "Tiempo standby");

    if (standbyIndex === -1) {
      throw new Error("Columna 'Tiempo standby' no encontrada");
    }

    // Obtener el valor de la fila 2
    const standbyTime = sheet.getRange(2, standbyIndex + 1).getValue();
    
    if (!standbyTime || isNaN(standbyTime)) {
      throw new Error("Valor de tiempo standby inválido");
    }

    return standbyTime;
  } catch (error) {
    console.error("Error al obtener tiempo de standby:", error);
    throw error;
  }
}

// Función para verificar si un conductor puede registrarse
function checkDriverStandby(driverName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("AsistenciasRegistradas");
    
    if (!sheet) {
      throw new Error("Hoja 'AsistenciasRegistradas' no encontrada");
    }

    // Obtener encabezados
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const nombreIndex = headers.findIndex(header => header === "Nombre");
    const salidaIndex = headers.findIndex(header => header === "Fecha Hora Salida");

    if (nombreIndex === -1 || salidaIndex === -1) {
      throw new Error("Columnas requeridas no encontradas");
    }

    // Obtener todos los registros del conductor
    const data = sheet.getDataRange().getValues();
    const driverRecords = data.slice(1).filter(row => 
      row[nombreIndex] === driverName && row[salidaIndex]
    );

    if (driverRecords.length === 0) {
      return { canRegister: true };
    }

    // Obtener el último registro de salida
    const lastExit = driverRecords.reduce((latest, current) => {
      const currentDate = new Date(current[salidaIndex]);
      const latestDate = new Date(latest[salidaIndex]);
      return currentDate > latestDate ? current : latest;
    });

    const standbyTime = getStandbyTime();
    const lastExitTime = new Date(lastExit[salidaIndex]);
    const now = new Date();
    const minutesSinceLastExit = Math.floor((now - lastExitTime) / (1000 * 60));
    const remainingMinutes = standbyTime - minutesSinceLastExit;

    return {
      canRegister: remainingMinutes <= 0,
      remainingMinutes: remainingMinutes > 0 ? remainingMinutes : 0
    };
  } catch (error) {
    console.error("Error al verificar standby:", error);
    throw error;
  }
}

// Modificar doGet para manejar diferentes acciones
function doGet(e) {
  console.log("Iniciando doGet con parámetros:", e.parameter);
  
  try {
    switch(e.parameter.action) {
      case 'getAttendances':
        return getAttendances();
      case 'getSectors':
        return getSectors();
      case 'getLocationParams':
        const params = getLocationParams();
        return ContentService
              .createTextOutput(JSON.stringify(params))
              .setMimeType(ContentService.MimeType.JSON);
      case 'generatePID':
        return ContentService
              .createTextOutput(JSON.stringify({ pid: generatePID() }))
              .setMimeType(ContentService.MimeType.JSON);
      case 'getAvailableDrivers':
        return ContentService
              .createTextOutput(JSON.stringify(getAvailableDrivers()))
              .setMimeType(ContentService.MimeType.JSON);
      case 'getDriverByPID':
        const driverInfo = getDriverByPID(e.parameter.pid);
        return ContentService
              .createTextOutput(JSON.stringify({ driver: driverInfo }))
              .setMimeType(ContentService.MimeType.JSON);
      case 'checkPendingExits':
        const result = checkPendingExits(e.parameter.driverName);
        return ContentService
              .createTextOutput(JSON.stringify(result))
              .setMimeType(ContentService.MimeType.JSON);
      case 'checkDriverStandby':
        const standbyResult = checkDriverStandby(e.parameter.driverName);
        return ContentService
              .createTextOutput(JSON.stringify(standbyResult))
              .setMimeType(ContentService.MimeType.JSON);
      default:
        return getDrivers();
    }
  } catch (error) {
    console.error("Error en doGet:", error.toString(), "Stack:", error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ 
            error: "Error procesando la solicitud: " + error.toString() 
          }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

function getDrivers() {
  const sheetName = "Conductores"; 
  const nameColumn = 1;
  const startRow = 2; 

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return ContentService
            .createTextOutput(JSON.stringify({ error: "Hoja \'" + sheetName + "\' no encontrada." }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const range = sheet.getRange(startRow, nameColumn, sheet.getLastRow() - (startRow - 1), 1);
    const values = range.getValues();
    const drivers = values.flat().filter(name => name.toString().trim() !== "");

    return ContentService
          .createTextOutput(JSON.stringify({ drivers: drivers }))
          .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Error en getDrivers: " + error.toString() + " Stack: " + error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ error: "Error interno del servidor: " + error.toString() }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para crear la carpeta de fotos si no existe
function getOrCreatePhotoFolder() {
  try {
    const folderName = "Fotos_Asistencia";
    console.log("Buscando carpeta:", folderName);
    
    let folders = DriveApp.getFoldersByName(folderName);
    
    if (folders.hasNext()) {
      const folder = folders.next();
      console.log("Carpeta existente encontrada. ID:", folder.getId());
      return folder;
    } else {
      console.log("Creando nueva carpeta...");
      const newFolder = DriveApp.createFolder(folderName);
      console.log("Nueva carpeta creada. ID:", newFolder.getId());
      return newFolder;
    }
  } catch (error) {
    console.error("Error al obtener/crear carpeta:", error.toString());
    console.error("Stack trace:", error.stack);
    throw error;
  }
}

// Función para guardar la foto y obtener el enlace
function savePhoto(base64Data, fileName) {
  try {
    console.log("Iniciando guardado de foto para:", fileName);
    
    if (!base64Data) {
      throw new Error("No se recibieron datos de imagen (base64Data es null o vacío)");
    }

    // Validar formato base64
    const base64Parts = base64Data.split(',');
    if (base64Parts.length !== 2) {
      throw new Error("Formato base64 inválido - no contiene la estructura esperada");
    }

    console.log("Decodificando datos base64...");
    const decodedData = Utilities.base64Decode(base64Parts[1]);
    if (!decodedData || decodedData.length === 0) {
      throw new Error("Error al decodificar datos base64");
    }

    const photoBlob = Utilities.newBlob(decodedData, 'image/jpeg', fileName);
    console.log("Blob creado correctamente. Tamaño:", photoBlob.getBytes().length);
    
    console.log("Obteniendo carpeta de fotos...");
    const folder = getOrCreatePhotoFolder();
    if (!folder) {
      throw new Error("No se pudo obtener o crear la carpeta de fotos");
    }
    console.log("Carpeta obtenida:", folder.getName(), "ID:", folder.getId());
    
    console.log("Guardando archivo...");
    const file = folder.createFile(photoBlob);
    if (!file) {
      throw new Error("Error al crear el archivo en Drive");
    }
    console.log("Archivo creado con ID:", file.getId());
    
    console.log("Configurando permisos...");
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    const url = file.getUrl();
    console.log("URL del archivo:", url);
    return url;
  } catch (error) {
    console.error("Error detallado al guardar la foto:", error.toString());
    console.error("Stack trace:", error.stack);
    throw error;
  }
}

// Función para obtener sectores
function getSectors() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Parametros");
    
    if (!sheet) {
      throw new Error("Hoja 'Parametros' no encontrada");
    }

    // Buscar la columna "Sector"
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const sectorIndex = headers.findIndex(header => header === "Sector");

    if (sectorIndex === -1) {
      throw new Error("Columna 'Sector' no encontrada en la hoja Parametros");
    }

    // Obtener todos los sectores (excluyendo el encabezado)
    const sectors = sheet.getRange(2, sectorIndex + 1, sheet.getLastRow() - 1, 1)
                        .getValues()
                        .flat()
                        .filter(sector => sector !== "");

    return ContentService
          .createTextOutput(JSON.stringify({ sectors: sectors }))
          .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Error en getSectors:", error.toString(), "Stack:", error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ 
            error: "Error al obtener sectores: " + error.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para obtener los parámetros de ubicación
function getLocationParams() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Parametros");
    
    if (!sheet) {
      throw new Error("Hoja 'Parametros' no encontrada");
    }

    // Obtener encabezados
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // Encontrar índices de las columnas
    const latitudIndex = headers.findIndex(header => header === "latitud");
    const longitudIndex = headers.findIndex(header => header === "longitud");
    const radioIndex = headers.findIndex(header => header === "radio");

    if (latitudIndex === -1 || longitudIndex === -1 || radioIndex === -1) {
      throw new Error("No se encontraron todas las columnas necesarias (latitud, longitud, radio)");
    }

    // Obtener los valores (primera fila después del encabezado)
    const values = sheet.getRange(2, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    return {
      latitud: values[latitudIndex],
      longitud: values[longitudIndex],
      radio: values[radioIndex]
    };
  } catch (error) {
    console.error("Error al obtener parámetros de ubicación:", error);
    throw error;
  }
}

// Función para marcar la salida de un conductor
function markExit(e) {
  console.log("Iniciando markExit");
  const sheetName = "AsistenciasRegistradas";
  
  try {
    if (!e.parameter.timestamp) {
      throw new Error("No se proporcionó el timestamp del registro");
    }

    const isAbsent = e.parameter.isAbsent === 'true';
    
    // Si no es ausente, validar campos adicionales
    if (!isAbsent) {
      const bolsos = parseInt(e.parameter.bolsos);
      const sector = e.parameter.sector;
      const ssl = parseInt(e.parameter.ssl);

      if (isNaN(bolsos) || bolsos < 0 || bolsos > 6) {
        throw new Error("Valor de Bolsos inválido");
      }
      if (!sector) {
        throw new Error("Sector no especificado");
      }
      if (isNaN(ssl) || ssl < 0 || ssl > 3) {
        throw new Error("Valor de SSL inválido");
      }
    }

    const searchTimestamp = e.parameter.timestamp;
    console.log("Buscando registro con timestamp:", searchTimestamp);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      throw new Error("Hoja no encontrada: " + sheetName);
    }

    // Obtener datos y encabezados
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    
    // Encontrar índices de columnas necesarias
    const timestampIndex = headers.findIndex(header => header === "Fecha Hora Ingreso");
    const exitIndex = headers.findIndex(header => header === "Fecha Hora Salida");
    const checkboxIndex = headers.findIndex(header => header === "Marcar salida");
    const bolsosIndex = headers.findIndex(header => header === "Bolsos");
    const sectorIndex = headers.findIndex(header => header === "Sector");
    const sslIndex = headers.findIndex(header => header === "SSL");
    const ausenteIndex = headers.findIndex(header => header === "Ausente");

    // Si no existe la columna Ausente, crearla
    if (ausenteIndex === -1) {
      const newColumnIndex = headers.length + 1;
      sheet.getRange(1, newColumnIndex).setValue("Ausente");
      headers.push("Ausente");
    }

    // Función para formatear fecha a string comparable
    function formatDateToString(date) {
      const d = new Date(date);
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const seconds = d.getSeconds().toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }

    // Buscar la fila del registro
    const rowIndex = data.findIndex((row, index) => {
      if (index === 0 || !row[timestampIndex]) return false;
      const rowTime = formatDateToString(row[timestampIndex]);
      return rowTime === searchTimestamp;
    });

    if (rowIndex === -1) {
      console.error("No se encontró el registro. Timestamp buscado:", searchTimestamp);
      console.error("Timestamps disponibles:", data.slice(1).map(row => formatDateToString(row[timestampIndex])));
      throw new Error("No se encontró el registro especificado");
    }

    // Marcar la salida y actualizar campos
    const now = new Date();
    const rowNumber = rowIndex + 1;

    // Actualizar hora de salida y marcar salida
    sheet.getRange(rowNumber, exitIndex + 1).setValue(now);
    sheet.getRange(rowNumber, checkboxIndex + 1).setValue(true);

    if (isAbsent) {
      // Si es ausente, marcar la columna ausente y dejar los otros campos vacíos
      sheet.getRange(rowNumber, ausenteIndex + 1).setValue(true);
      if (bolsosIndex !== -1) sheet.getRange(rowNumber, bolsosIndex + 1).setValue('');
      if (sectorIndex !== -1) sheet.getRange(rowNumber, sectorIndex + 1).setValue('');
      if (sslIndex !== -1) sheet.getRange(rowNumber, sslIndex + 1).setValue('');
    } else {
      // Si no es ausente, actualizar los campos normalmente
      sheet.getRange(rowNumber, bolsosIndex + 1).setValue(parseInt(e.parameter.bolsos));
      sheet.getRange(rowNumber, sectorIndex + 1).setValue(e.parameter.sector);
      sheet.getRange(rowNumber, sslIndex + 1).setValue(parseInt(e.parameter.ssl));
      if (ausenteIndex !== -1) sheet.getRange(rowNumber, ausenteIndex + 1).setValue(false);
    }

    return ContentService
          .createTextOutput(JSON.stringify({ 
            status: "success", 
            message: isAbsent ? "Ausencia registrada correctamente" : "Salida registrada correctamente",
            exitTime: now.toLocaleString()
          }))
          .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Error en markExit:", error.toString(), "Stack:", error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ 
            status: "error", 
            message: error.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

// Modificar doPost para manejar el marcaje de salida
function doPost(e) {
  console.log("Iniciando doPost con parámetros:", e.parameter);
  
  if (e.parameter.action === 'markExit') {
    return markExit(e);
  }

  if (e.parameter.action === 'assignDriverPID') {
    try {
      const result = assignDriverPID(
        e.parameter.driverName,
        e.parameter.pid,
        e.parameter.vehicleType
      );
      return ContentService
            .createTextOutput(JSON.stringify(result))
            .setMimeType(ContentService.MimeType.JSON);
    } catch (error) {
      return ContentService
            .createTextOutput(JSON.stringify({ 
              status: "error", 
              message: error.toString() 
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }
  }
  
  // Si no es markExit, entonces es registro de asistencia
  try {
    // Validar parámetros recibidos
    if (!e || !e.parameter) {
      throw new Error("No se recibieron parámetros en la solicitud");
    }

    const driver = e.parameter.driver;
    const timestamp = e.parameter.timestamp;
    const vehicleType = e.parameter.vehicleType;
    const photoData = e.parameter.photo;

    // Log de datos recibidos (excepto la foto por su tamaño)
    console.log("Datos recibidos:", {
      driver: driver,
      timestamp: timestamp,
      vehicleType: vehicleType,
      photoReceived: photoData ? "Sí" : "No",
      photoLength: photoData ? photoData.length : 0
    });

    if (!driver || !timestamp || !vehicleType || !photoData) {
      const missingFields = [];
      if (!driver) missingFields.push("conductor");
      if (!timestamp) missingFields.push("timestamp");
      if (!vehicleType) missingFields.push("tipo de vehículo");
      if (!photoData) missingFields.push("foto");
      
      const errorMsg = "Faltan datos requeridos: " + missingFields.join(", ");
      console.error(errorMsg);
      return ContentService
            .createTextOutput(JSON.stringify({ 
              status: "error", 
              message: errorMsg
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    // Validar formato de la foto
    if (!photoData.startsWith('data:image')) {
      console.error("Formato de foto inválido. Datos recibidos no comienzan con 'data:image'");
      return ContentService
            .createTextOutput(JSON.stringify({ 
              status: "error", 
              message: "Formato de foto inválido" 
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    console.log("Preparando para guardar la foto");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = "AsistenciasRegistradas";
    let sheet = ss.getSheetByName(sheetName);

    const expectedHeaders = ["Nombre", "Fecha Hora Ingreso", "Vehículo", "Foto"];
    let columnMap = {}; 

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      expectedHeaders.forEach((header, index) => {
        columnMap[header] = index + 1;
      });
    } else {
      const lastCol = sheet.getLastColumn();
      const currentHeaders = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];
      
      currentHeaders.forEach((header, index) => {
        if (header && header.toString().trim() !== "") {
          columnMap[header] = index + 1;
        }
      });

      let nextHeaderCol = lastCol > 0 ? lastCol : 0;
      expectedHeaders.forEach(expectedHeader => {
        if (!columnMap[expectedHeader]) {
          nextHeaderCol++;
          sheet.getRange(1, nextHeaderCol).setValue(expectedHeader);
          columnMap[expectedHeader] = nextHeaderCol;
        }
      });
    }

    // Guardar la foto y obtener el enlace
    const fileName = `${driver}_${timestamp.replace(/[/:]/g, '-')}.jpg`;
    console.log("Intentando guardar foto con nombre:", fileName);
    
    let photoUrl;
    try {
      photoUrl = savePhoto(photoData, fileName);
      console.log("Foto guardada exitosamente. URL:", photoUrl);
    } catch (photoError) {
      console.error("Error al guardar la foto:", photoError);
      return ContentService
            .createTextOutput(JSON.stringify({ 
              status: "error", 
              message: "Error al guardar la foto: " + photoError.toString()
            }))
            .setMimeType(ContentService.MimeType.JSON);
    }

    const nextRow = sheet.getLastRow() + 1;

    // Escribir los datos en la hoja
    if (columnMap["Nombre"]) {
      sheet.getRange(nextRow, columnMap["Nombre"]).setValue(driver);
    }
    if (columnMap["Fecha Hora Ingreso"]) {
      // El timestamp viene en formato M/D/YYYY H:MM:SS
      const [datePart, timePart] = timestamp.split(' ');
      const [month, day, year] = datePart.split('/');
      const [hours, minutes, seconds] = timePart.split(':');
      const date = new Date(year, month - 1, day, hours, minutes, seconds);
      sheet.getRange(nextRow, columnMap["Fecha Hora Ingreso"]).setValue(date);
    }
    if (columnMap["Vehículo"]) {
      sheet.getRange(nextRow, columnMap["Vehículo"]).setValue(vehicleType);
    }
    if (columnMap["Foto"]) {
      sheet.getRange(nextRow, columnMap["Foto"]).setValue(photoUrl);
    }

    return ContentService
          .createTextOutput(JSON.stringify({ 
            status: "success", 
            message: `Asistencia registrada para ${driver} (${vehicleType})`,
            photoUrl: photoUrl
          }))
          .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    console.error("Error en doPost:", error.toString(), "Stack:", error.stack);
    return ContentService
          .createTextOutput(JSON.stringify({ 
            status: "error", 
            message: "Error interno del servidor: " + error.toString()
          }))
          .setMimeType(ContentService.MimeType.JSON);
  }
}

// Función para generar un PID único
function generatePID() {
  return Utilities.getUuid();
}

// Función para obtener conductores disponibles (sin PID asignado)
function getAvailableDrivers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Conductores");
  
  if (!sheet) {
    throw new Error("Hoja 'Conductores' no encontrada");
  }

  // Obtener encabezados
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nombreIndex = headers.findIndex(header => header === "Nombre");
  const pidIndex = headers.findIndex(header => header === "pid");
  const vehiculoIndex = headers.findIndex(header => header === "Vehículo");

  if (nombreIndex === -1) {
    throw new Error("Columna 'Nombre' no encontrada");
  }

  // Obtener todos los datos
  const data = sheet.getDataRange().getValues();
  const drivers = data.slice(1) // Excluir encabezados
    .filter(row => {
      const hasPid = pidIndex !== -1 && row[pidIndex];
      return !hasPid && row[nombreIndex]; // Solo conductores sin PID
    })
    .map(row => ({
      name: row[nombreIndex],
      vehicle: vehiculoIndex !== -1 ? row[vehiculoIndex] || '' : ''
    }));

  return { drivers };
}

// Función para verificar y obtener información del conductor por PID
function getDriverByPID(pid) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Conductores");
  
  if (!sheet) {
    throw new Error("Hoja 'Conductores' no encontrada");
  }

  // Obtener encabezados
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nombreIndex = headers.findIndex(header => header === "Nombre");
  const pidIndex = headers.findIndex(header => header === "pid");
  const vehiculoIndex = headers.findIndex(header => header === "Vehículo");

  if (pidIndex === -1) {
    throw new Error("Columna 'pid' no encontrada");
  }

  // Buscar el conductor con el PID
  const data = sheet.getDataRange().getValues();
  const driverRow = data.slice(1).find(row => row[pidIndex] === pid);

  if (driverRow) {
    return {
      name: driverRow[nombreIndex],
      vehicle: vehiculoIndex !== -1 ? driverRow[vehiculoIndex] || '' : ''
    };
  }

  return null;
}

// Función para asignar PID y vehículo a un conductor
function assignDriverPID(driverName, pid, vehicleType) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Conductores");
  
  if (!sheet) {
    throw new Error("Hoja 'Conductores' no encontrada");
  }

  // Obtener encabezados
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nombreIndex = headers.findIndex(header => header === "Nombre");
  const pidIndex = headers.findIndex(header => header === "pid");
  const vehiculoIndex = headers.findIndex(header => header === "Vehículo");

  if (pidIndex === -1 || nombreIndex === -1 || vehiculoIndex === -1) {
    throw new Error("No se encontraron todas las columnas necesarias");
  }

  // Buscar el conductor
  const data = sheet.getDataRange().getValues();
  const rowIndex = data.findIndex((row, index) => 
    index > 0 && row[nombreIndex] === driverName && !row[pidIndex]
  );

  if (rowIndex === -1) {
    throw new Error("Conductor no encontrado o ya tiene PID asignado");
  }

  // Actualizar PID y vehículo
  sheet.getRange(rowIndex + 1, pidIndex + 1).setValue(pid);
  sheet.getRange(rowIndex + 1, vehiculoIndex + 1).setValue(vehicleType);

  return { status: "success", message: "PID y vehículo asignados correctamente" };
}
