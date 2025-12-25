
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify(getAllPatients()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  
  // Action Dispatch
  if (data.action === 'import') {
    return handleImport(data.patients);
  } else if (data.action === 'batch_update') {
    return handleBatchUpdate(data.updates);
  } else {
    // Default: Single Patient Update/Create
    return handleSingleUpdate(data);
  }
}

// --- Handlers ---

function handleImport(patients) {
  const sheet = getWorkingSheet();
  const headers = ensureHeaders(sheet);
  
  // Convert objects to rows
  const rows = patients.map(p => {
    // Ensure all fields map to headers
    return headers.map(h => {
      if (h === 'labs' || h === 'symptoms') {
        return JSON.stringify(p[h] || {});
      }
      return p[h] || '';
    });
  });
  
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', count: rows.length }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleBatchUpdate(updates) {
  const sheet = getWorkingSheet();
  const headers = ensureHeaders(sheet);
  const data = sheet.getDataRange().getValues(); // Read all
  
  // Map ID to Row Index (0-based relative to data array)
  const idColIdx = headers.indexOf('id');
  const idRowMap = {};
  
  // data[0] is headers
  for (let i = 1; i < data.length; i++) {
    const id = data[i][idColIdx];
    if (id) idRowMap[id] = i; 
  }
  
  Object.keys(updates).forEach(id => {
    const rowIndex = idRowMap[id];
    if (rowIndex) {
      const updateFields = updates[id];
      Object.keys(updateFields).forEach(field => {
        const colIdx = headers.indexOf(field);
        if (colIdx > -1) {
          // Update in memory first (optional, but good for consistency)
          // Write directly to cell: Row is rowIndex + 1 (1-based), Col is colIdx + 1
          sheet.getRange(rowIndex + 1, colIdx + 1).setValue(updateFields[field]);
        }
      });
    }
  });
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);
}

function handleSingleUpdate(p) {
  const sheet = getWorkingSheet();
  const headers = ensureHeaders(sheet);
  
  // Find existing row by ID
  const data = sheet.getDataRange().getValues();
  const idIndex = headers.indexOf('id');
  
  let rowIndex = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][idIndex] == p.id) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }
  
  // Prepare row data
  const rowData = headers.map(key => {
    if (key === 'labs') return JSON.stringify(p.labs || {});
    if (key === 'symptoms') return JSON.stringify(p.symptoms || {});
    return p[key] || '';
  });
  
  if (rowIndex > 0) {
    // Update
    sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
  } else {
    // Create
    sheet.appendRow(rowData);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', id: p.id }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getAllPatients() {
  const sheet = getWorkingSheet();
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  const patients = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const p = {};
    headers.forEach((key, idx) => {
      if (key === 'labs' || key === 'symptoms') {
        try {
          p[key] = JSON.parse(row[idx]);
        } catch (e) { p[key] = {}; }
      } else {
        p[key] = row[idx];
      }
    });
    patients.push(p);
  }
  return patients;
}


// --- Helpers ---

function getWorkingSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Patients');
  if (!sheet) {
    sheet = ss.getSheets()[0];
    sheet.setName('Patients');
  }
  return sheet;
}

function ensureHeaders(sheet) {
  const required = [
    'id', 'name', 'code', 
    'ward', 'room', 'age', 
    'diagnosis', 'provider', 
    'treatment', 'medications', 
    'notes', 'symptoms', 'labs', 
    'last_updated'
  ];
  
  const lastCol = sheet.getLastColumn();
  if (lastCol === 0) {
    sheet.appendRow(required);
    return required;
  }
  
  const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  
  // Add missing headers
  const missing = required.filter(h => !currentHeaders.includes(h));
  if (missing.length > 0) {
    sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]);
    return [...currentHeaders, ...missing];
  }
  
  return currentHeaders;
}
