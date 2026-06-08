/**
 * LA MADRIGUERA — Google Apps Script para recibir datos del sistema QR
 * ─────────────────────────────────────────────────────────────────────
 *
 * INSTRUCCIONES DE INSTALACIÓN:
 *
 * 1. Abre tu Google Sheet en el navegador.
 * 2. Menú: Extensiones → Apps Script
 * 3. Borra el contenido que hay por defecto y pega TODO este archivo.
 * 4. Guarda (Ctrl+S).
 * 5. Click en "Implementar" → "Nueva implementación"
 *    · Tipo: Aplicación web
 *    · Ejecutar como: Yo (tu cuenta de Google)
 *    · Quién tiene acceso: Cualquier persona
 * 6. Click en "Implementar" → copia la URL que aparece.
 * 7. Pega esa URL en el campo "Google Sheets" del sistema QR → Guardar.
 * 8. Usa el botón "Probar" para verificar que la conexión funciona.
 *
 * La primera vez que se ejecute, Google pedirá que autorices los permisos.
 * ─────────────────────────────────────────────────────────────────────
 */

// Nombre de la hoja donde se guardarán los datos (puedes cambiar el nombre)
const SHEET_NAME = 'Equipos QR';

// Columnas de la cabecera (en el mismo orden que se guardan los datos)
const HEADERS = ['Fecha', 'N° de Serie', 'Nombre', 'Categoría', 'Specs', 'Descripción', 'URL QR', 'Vista QR'];

/**
 * Recibe los datos del sistema QR (POST desde el navegador).
 */
function doPost(e) {
  try {
    const raw  = e.postData.contents;
    const data = JSON.parse(raw);

    const sheet = getOrCreateSheet();

    // Si la hoja está vacía, agrega los encabezados
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(HEADERS);
      formatHeaders(sheet);
    }

    // No registrar filas de prueba en el Sheet (solo valida la conexión)
    if (data.serie === 'TEST-000') {
      return jsonResponse({ ok: true, msg: 'Prueba de conexión exitosa — no se guardó en el Sheet.' });
    }

    // Agregar fila con los datos del equipo
    sheet.appendRow([
      data.fecha  || new Date().toLocaleString('es-CO'),
      data.serie  || '',
      data.nombre || '',
      data.cat    || '',
      data.specs  || '',
      data.desc   || '',
      data.url    || '',
      '',  // Vista QR — se rellena con fórmula IMAGE abajo
    ]);

    // Insertar imagen del QR en la última columna
    const lastRow = sheet.getLastRow();
    const qrSrc = data.qrImgUrl || (data.url
      ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(data.url)}`
      : '');
    if (qrSrc) {
      sheet.getRange(lastRow, 8).setFormula(`=IMAGE("${qrSrc}")`);
      sheet.setRowHeight(lastRow, 210);
    }

    return jsonResponse({ ok: true, msg: `"${data.nombre}" agregado al Sheet.` });

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message }, true);
  }
}

/**
 * GET simple para verificar que el script está activo.
 */
function doGet(e) {
  return jsonResponse({ ok: true, status: 'La Madriguera QR — Apps Script activo.' });
}

// ── Helpers ──────────────────────────────────────────────────────────

function getOrCreateSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let   sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  return sheet;
}

function formatHeaders(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, HEADERS.length);
  headerRange.setBackground('#0c0e09');
  headerRange.setFontColor('#c5e829');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  sheet.setFrozenRows(1);
  sheet.setColumnWidth(1, 160); // Fecha
  sheet.setColumnWidth(2, 140); // Serie
  sheet.setColumnWidth(3, 180); // Nombre
  sheet.setColumnWidth(4, 120); // Categoría
  sheet.setColumnWidth(5, 240); // Specs
  sheet.setColumnWidth(6, 280); // Descripción
  sheet.setColumnWidth(7, 360); // URL
  sheet.setColumnWidth(8, 220); // Vista QR
}

function jsonResponse(obj, isError) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
