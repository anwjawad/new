
// --------------------------------------------------------
// CONFIGURATION
// --------------------------------------------------------
const GAS_API_URL = "https://script.google.com/macros/s/AKfycbxJ0bG4MEptJCL_4057PM1UkFXrVSp5Vyydrq4ZvAUzGt3-gqyGq4aV1UhRpi90tszK/exec";

let appData = {
    patients: [],
    wards: {},
    // Hardcoded ranges since they are static
    ranges: {
        'WBC': [4.0, 11.0],
        'HGB': [13.5, 17.5],
        'PLT': [150, 450],
        'Creatinine': [0.7, 1.3],
        'Potassium (K)': [3.5, 5.1],
        'Sodium (Na)': [136, 145],
        'Chloride (Cl)': [98, 107],
        'Calcium': [8.6, 10.3],
        'Magnesium': [1.7, 2.2],
        'Albumin': [3.4, 5.4],
        'Total Bilirubin': [0.1, 1.2],
        'CRP': [0, 10],
        'BUN': [7, 20]
    },
    currentWard: null,
    currentPatient: null
};

// Toggle Mobile Sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');

    // Toggle Sidebar visibility
    if (sidebar.classList.contains('-translate-x-full')) {
        // Open
        sidebar.classList.remove('-translate-x-full');

        // Show Overlay
        overlay.classList.remove('hidden');
        // Small delay to allow display:block to apply before opacity transition
        setTimeout(() => overlay.classList.remove('opacity-0'), 10);
    } else {
        // Close
        sidebar.classList.add('-translate-x-full');

        // Hide Overlay
        overlay.classList.add('opacity-0');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

// Auto-save timer
let saveTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    if (GAS_API_URL.includes("Paste_Your")) {
        alert("Please paste your Google Web App URL in main.js file!");
        loadMockData();
    } else {
        fetchData();
    }
});

function loadMockData() {
    // Just so the UI isn't empty on first open
    appData.wards = { 'Demo Ward': [] };
    renderWardsSidebar();
}

async function fetchData() {
    try {
        document.getElementById('patient-count').innerText = "...";
        const res = await fetch(GAS_API_URL);
        const patients = await res.json();

        if (patients.error) {
            alert("Error from Sheet: " + patients.error);
            return;
        }

        appData.patients = patients;

        // Group by Ward
        appData.wards = {};
        patients.forEach(p => {
            const w = p.ward || 'Unassigned';
            if (!appData.wards[w]) appData.wards[w] = [];
            appData.wards[w].push(p);
        });

        renderWardsSidebar();

        // Select first ward by default, or keep current if valid
        const wardKeys = Object.keys(appData.wards);
        if (appData.currentWard && wardKeys.includes(appData.currentWard)) {
            selectWard(appData.currentWard);
        } else {
            const firstWard = wardKeys[0];
            if (firstWard) selectWard(firstWard);
        }

    } catch (e) {
        console.error("Failed to load data", e);
    }
}

function renderWardsSidebar() {
    const list = document.getElementById('wards-list');
    list.innerHTML = '';

    Object.keys(appData.wards).forEach(ward => {
        const count = appData.wards[ward].length;
        const btn = document.createElement('div');
        btn.className = `p-3 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors flex justify-between items-center group ward-item relative overflow-hidden`;
        btn.onclick = (e) => {
            // Check if delete button was clicked
            if (e.target.closest('.delete-ward-btn')) return;
            selectWard(ward);
        }

        btn.innerHTML = `
            <div class="flex items-center gap-3">
                <div class="w-2 h-8 bg-slate-200 rounded-full group-hover:bg-medical-400 transition-colors" id="ward-indicator-${ward.replace(/\s/g, '')}"></div>
                <span class="font-medium text-slate-700 group-hover:text-medical-700">${ward}</span>
            </div>
            <div class="flex items-center gap-2">
                 <span class="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-full">${count}</span>
                 <button class="delete-ward-btn text-xs text-slate-300 hover:text-red-500 hidden group-hover:block transition-all p-1" onclick="deleteWard('${ward}')" title="Delete Ward"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        btn.dataset.ward = ward;
        list.appendChild(btn);
    });
}

function addNewWard() {
    const name = prompt("Enter new ward name:");
    if (!name || name.trim() === "") return;

    // Check if exists
    if (appData.wards[name]) {
        alert("Ward already exists!");
        selectWard(name);
        return;
    }

    // Add locally
    appData.wards[name] = [];
    renderWardsSidebar();
    selectWard(name);
}

function deleteWard(wardName) {
    const count = appData.wards[wardName].length;
    if (!confirm(`Are you sure you want to delete '${wardName}'?\nIt contains ${count} patients.\n\nPatients will be moved to 'Unassigned'.`)) return;

    const patientsToUpdate = appData.wards[wardName];

    // Optimistic Update
    if (!appData.wards['Unassigned']) appData.wards['Unassigned'] = [];

    const updates = {};

    patientsToUpdate.forEach(p => {
        p.ward = "Unassigned";
        appData.wards['Unassigned'].push(p);
        updates[p.id] = { ward: 'Unassigned' };
    });

    delete appData.wards[wardName];

    // Refresh UI
    renderWardsSidebar();
    selectWard('Unassigned');

    // Sync to Backend
    if (GasApiAvailable()) {
        syncBatchUpdate(updates);
    }
}

async function syncBatchUpdate(updates) {
    if (Object.keys(updates).length === 0) return;

    document.getElementById('save-status').innerText = "Processing batch update...";

    try {
        const payload = {
            action: 'batch_update',
            updates: updates
        };

        await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        document.getElementById('save-status').innerHTML = '<i class="fa-solid fa-check text-green-500 mr-1"></i> Changes saved';

    } catch (e) {
        console.error("Batch update failed", e);
        document.getElementById('save-status').innerText = "Update Failed!";
    }
}

function GasApiAvailable() {
    return !GAS_API_URL.includes("Paste_Your");
}

function selectWard(wardName) {
    appData.currentWard = wardName;
    document.getElementById('current-ward-title').innerText = wardName;

    if (appData.wards[wardName]) {
        document.getElementById('patient-count').innerText = appData.wards[wardName].length;
        renderPatientsGrid(appData.wards[wardName]);
    } else {
        document.getElementById('patient-count').innerText = 0;
        renderPatientsGrid([]);
    }

    // Highlight sidebar
    document.querySelectorAll('.ward-item').forEach(el => {
        if (el.dataset.ward === wardName) {
            el.classList.add('bg-blue-50', 'border-l-4', 'border-medical-500');
            el.querySelector('div.bg-slate-200').classList.remove('bg-slate-200');
            el.querySelector('div.w-2').classList.add('bg-medical-500');
        } else {
            el.classList.remove('bg-blue-50', 'border-l-4', 'border-medical-500');
            el.querySelector('div.w-2').classList.add('bg-slate-200');
            el.querySelector('div.w-2').classList.remove('bg-medical-500');
        }
    });
}

function renderPatientsGrid(patients) {
    const grid = document.getElementById('patients-grid');
    grid.innerHTML = '';

    if (!patients || patients.length === 0) {
        grid.innerHTML = '<div class="col-span-3 text-center text-slate-400 py-10">No patients in this ward</div>';
        return;
    }

    patients.forEach(p => {
        const card = document.createElement('div');
        card.className = "bg-white rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-lg transition-shadow border border-slate-100 cursor-pointer group relative overflow-hidden";
        card.onclick = () => openModal(p);

        let labBadges = '';
        if (p.labs) {
            Object.entries(p.labs).forEach(([k, v]) => {
                const status = checkLabStatus(k, v.value);
                if (status !== 'normal') {
                    const colorClass = status === 'high' ? 'bg-red-50 text-red-600 border-red-100' : 'bg-orange-50 text-orange-600 border-orange-100';
                    const icon = status === 'high' ? '↑' : '↓';
                    labBadges += `<span class="text-[10px] uppercase font-bold px-2 py-1 rounded-md border ${colorClass}">${k} ${v.value} ${icon}</span>`;
                }
            });
        }

        let symptomText = '';
        if (p.symptoms) {
            Object.entries(p.symptoms).forEach(([k, v]) => {
                if (v.active) {
                    const note = v.note ? `<span class="text-slate-400 font-normal ml-1">(${v.note})</span>` : '';
                    symptomText += `<div class="text-xs text-rose-600 font-medium mb-1">• ${k} ${note}</div>`;
                }
            });
        }

        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                     <h3 class="font-bold text-lg text-slate-800 group-hover:text-medical-600 transition-colors">${p.name}</h3>
                     <div class="text-xs text-slate-400 font-mono">${p.code}</div>
                </div>
                <div class="bg-slate-100 text-slate-500 text-xs font-bold px-2 py-1 rounded-lg">RM ${p.room}</div>
            </div>
            
            ${labBadges ? `<div class="flex flex-wrap gap-1 mb-3">${labBadges}</div>` : ''}

            <div class="space-y-1 mb-4">
                <div class="text-sm text-slate-600"><span class="font-medium text-slate-400 text-xs uppercase mr-1">Dx</span> ${p.diagnosis}</div>
                <div class="text-sm text-slate-600 truncate"><span class="font-medium text-slate-400 text-xs uppercase mr-1">Rx</span> ${p.treatment}</div>
            </div>

            ${symptomText ? `<div class="bg-rose-50/50 p-2 rounded-lg border border-rose-100 mb-2">${symptomText}</div>` : ''}

            <div class="flex items-center gap-2 mt-4 pt-3 border-t border-slate-50">
                <div class="w-5 h-5 rounded-full bg-indigo-100 text-indigo-500 flex items-center justify-center text-[10px]"><i class="fa-solid fa-user-doctor"></i></div>
                <span class="text-xs text-slate-500 font-medium">${p.provider}</span>
            </div>
        `;
        grid.appendChild(card);
    });
}

function checkLabStatus(name, value) {
    if (!appData.ranges[name]) return 'normal';
    const [min, max] = appData.ranges[name];
    if (value < min) return 'low';
    if (value > max) return 'high';
    return 'normal';
}

function openModal(patient) {
    appData.currentPatient = patient;
    const modal = document.getElementById('patient-modal');
    const panel = document.getElementById('modal-panel');

    document.getElementById('modal-patient-name').innerText = patient.name;
    document.getElementById('modal-patient-code').innerText = patient.code;
    document.getElementById('modal-patient-age').innerText = `${patient.age} Yrs`;
    document.getElementById('modal-patient-room').innerText = `Room ${patient.room}`;

    document.getElementById('inp-diagnosis').value = patient.diagnosis || '';
    document.getElementById('inp-provider').value = patient.provider || '';
    document.getElementById('inp-treatment').value = patient.treatment || '';
    document.getElementById('inp-medications').value = patient.medications || '';
    document.getElementById('inp-notes').value = patient.notes || '';

    ['inp-diagnosis', 'inp-provider', 'inp-treatment', 'inp-medications', 'inp-notes'].forEach(id => {
        document.getElementById(id).oninput = () => triggerSave();
    });

    renderModalLabs(patient.labs || {});
    renderModalSymptoms(patient.symptoms || {});

    modal.classList.remove('hidden');
    setTimeout(() => { panel.classList.remove('translate-x-full'); }, 10);
}

function closeModal() {
    const modal = document.getElementById('patient-modal');
    const panel = document.getElementById('modal-panel');
    panel.classList.add('translate-x-full');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (appData.currentWard) renderPatientsGrid(appData.wards[appData.currentWard]);
    }, 300);
}

function renderModalLabs(labs) {
    const container = document.getElementById('modal-labs-list');
    container.innerHTML = '';

    const standardLabs = Object.keys(appData.ranges);

    standardLabs.forEach(labName => {
        const labData = labs[labName] || { value: '', unit: '' };
        const val = labData.value;
        const status = val ? checkLabStatus(labName, val) : 'normal';

        let colorClass = 'bg-slate-50 border-slate-200 text-slate-700';
        if (status === 'high') colorClass = 'bg-red-50 border-red-200 text-red-700';
        if (status === 'low') colorClass = 'bg-orange-50 border-orange-200 text-orange-700';

        const wrapper = document.createElement('div');
        wrapper.className = `flex-shrink-0 w-32 p-3 rounded-xl border ${colorClass} flex flex-col items-center justify-center text-center`;
        const range = appData.ranges[labName];

        wrapper.innerHTML = `
            <span class="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">${labName}</span>
            <input type="number" step="0.1" value="${val}" class="w-full text-center bg-transparent font-bold text-lg focus:outline-none mb-1" placeholder="--">
            <span class="text-[9px] opacity-60">Ref: ${range[0]} - ${range[1]}</span>
        `;

        const input = wrapper.querySelector('input');
        input.onchange = (e) => {
            const newVal = parseFloat(e.target.value);
            if (!appData.currentPatient.labs) appData.currentPatient.labs = {};
            if (!appData.currentPatient.labs[labName]) appData.currentPatient.labs[labName] = {};
            appData.currentPatient.labs[labName].value = isNaN(newVal) ? '' : newVal;

            renderModalLabs(appData.currentPatient.labs);
            triggerSave();
        };
        container.appendChild(wrapper);
    });
}

function renderModalSymptoms(symptoms) {
    const container = document.getElementById('modal-symptoms-grid');
    container.innerHTML = '';

    const possibleSymptoms = [
        "Pain", "Fatigue", "Drowsiness", "Nausea", "Vomiting",
        "Lack of Appetite", "Shortness of Breath", "Depression",
        "Anxiety", "Sleep Disturbance", "Constipation", "Confusion", "Wellbeing"
    ];

    possibleSymptoms.forEach(sym => {
        const sData = symptoms[sym] || { active: false, note: '' };
        const isActive = sData.active;
        const baseClass = isActive ? 'bg-rose-500 text-white shadow-md shadow-rose-200' : 'bg-white border border-slate-200 text-slate-600 hover:border-rose-300';

        const btn = document.createElement('div');
        btn.className = `${baseClass} p-3 rounded-xl transition-all duration-200 cursor-pointer flex flex-col gap-2`;

        btn.innerHTML = `
            <div class="flex justify-between items-center w-full">
                <span class="font-medium text-sm select-none">${sym}</span>
                ${isActive ? '<i class="fa-solid fa-check text-xs"></i>' : ''}
            </div>
            ${isActive ? `<input type="text" value="${sData.note}" placeholder="Note..." class="w-full text-xs bg-white/20 text-white placeholder-white/70 border-none rounded px-2 py-1 focus:ring-1 focus:ring-white/50 focus:outline-none" onclick="event.stopPropagation()">` : ''}
        `;

        btn.onclick = (e) => {
            if (e.target.tagName === 'INPUT') return;

            if (!appData.currentPatient.symptoms) appData.currentPatient.symptoms = {};
            if (!appData.currentPatient.symptoms[sym]) appData.currentPatient.symptoms[sym] = { active: false, note: '' };

            appData.currentPatient.symptoms[sym].active = !appData.currentPatient.symptoms[sym].active;
            renderModalSymptoms(appData.currentPatient.symptoms);
            triggerSave();
        };

        const input = btn.querySelector('input');
        if (input) {
            input.oninput = (e) => {
                appData.currentPatient.symptoms[sym].note = e.target.value;
                triggerSave();
            };
        }
        container.appendChild(btn);
    });
}

function triggerSave() {
    const status = document.getElementById('save-status');
    status.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin text-blue-500 mr-1"></i> Saving...';

    if (appData.currentPatient) {
        appData.currentPatient.diagnosis = document.getElementById('inp-diagnosis').value;
        appData.currentPatient.provider = document.getElementById('inp-provider').value;
        appData.currentPatient.treatment = document.getElementById('inp-treatment').value;
        appData.currentPatient.medications = document.getElementById('inp-medications').value;
        appData.currentPatient.notes = document.getElementById('inp-notes').value;
    }

    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToBackend, 1500);
}

async function saveToBackend() {
    if (GAS_API_URL.includes("Paste_Your")) {
        console.warn("No GAS URL configured, not saving.");
        document.getElementById('save-status').innerText = 'Not Saved (Configure URL)';
        return;
    }

    if (!appData.currentPatient) return;

    try {
        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(appData.currentPatient)
        });

        const status = document.getElementById('save-status');
        status.innerHTML = '<i class="fa-solid fa-check text-green-500 mr-1"></i> Saved';
        document.getElementById('last-edited').innerText = 'Last saved: ' + new Date().toLocaleTimeString();

    } catch (e) {
        console.error("Save failed", e);
        document.getElementById('save-status').innerText = 'Save Failed!';
    }
}


// ----- IMPORT LOGIC -----

let csvData = [];
let csvHeaders = [];

function openImportModal() {
    document.getElementById('import-modal').classList.remove('hidden');
    // Reset state
    document.getElementById('import-step-1').classList.remove('hidden');
    document.getElementById('import-step-2').classList.add('hidden');
    document.getElementById('import-step-3').classList.add('hidden');
    document.getElementById('btn-start-import').disabled = true;
    document.getElementById('btn-start-import').classList.add('cursor-not-allowed', 'bg-slate-300');
    document.getElementById('btn-start-import').classList.remove('bg-medical-600', 'hover:bg-medical-700');
    document.getElementById('paste-input').value = "";

    // Also reset Paste Button
    const btnParams = document.getElementById('btn-process-paste');
    if (btnParams) {
        btnParams.disabled = true;
        btnParams.classList.add('cursor-not-allowed', 'bg-slate-200', 'text-slate-400');
        btnParams.classList.remove('bg-medical-600', 'text-white', 'hover:bg-medical-700');
    }
}

function closeImportModal() {
    document.getElementById('import-modal').classList.add('hidden');
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.name.endsWith('.csv')) {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: function (results) {
                csvData = results.data;
                csvHeaders = results.meta.fields;
                showMappingStep();
            },
            error: function (err) {
                alert("Error parsing CSV: " + err.message);
            }
        });
    } else if (file.name.match(/\.xlsx?$|\.xls$/)) {
        const reader = new FileReader();
        reader.onload = function (e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (json.length === 0) {
                alert("Excel file is empty");
                return;
            }

            const headers = json[0];
            const rows = json.slice(1);

            csvHeaders = headers;
            csvData = rows.map(row => {
                let obj = {};
                headers.forEach((h, i) => {
                    obj[h] = row[i];
                });
                return obj;
            });

            showMappingStep();
        };
        reader.readAsArrayBuffer(file);
    } else {
        alert("Unsupported file format. Please use .csv or .xlsx");
    }
}

function checkPasteInput() {
    const val = document.getElementById('paste-input').value;
    const btn = document.getElementById('btn-process-paste');
    if (val && val.trim().length > 0) {
        btn.disabled = false;
        btn.classList.remove('bg-slate-200', 'text-slate-400', 'cursor-not-allowed');
        btn.classList.add('bg-medical-600', 'text-white', 'hover:bg-medical-700');
    } else {
        btn.disabled = true;
        btn.classList.add('bg-slate-200', 'text-slate-400', 'cursor-not-allowed');
        btn.classList.remove('bg-medical-600', 'text-white', 'hover:bg-medical-700');
    }
}

function handlePaste() {
    let rawData = document.getElementById('paste-input').value;
    if (!rawData) return;

    rawData = rawData.trim();
    const isTabSeparated = rawData.includes('\t');

    Papa.parse(rawData, {
        header: true,
        skipEmptyLines: 'greedy',
        delimiter: isTabSeparated ? "\t" : "",
        complete: function (results) {
            if (results.data && results.data.length > 0) {
                const messyHeaders = results.meta.fields || [];
                csvHeaders = messyHeaders.filter(h => h && h.trim() !== "");

                csvData = results.data.map(row => {
                    const cleanRow = {};
                    csvHeaders.forEach(h => {
                        cleanRow[h] = row[h];
                    });
                    return cleanRow;
                });

                if (csvHeaders.length === 0) {
                    alert("Could not detect any valid headers. Please ensure the first row contains header names.");
                    return;
                }

                showMappingStep();
            } else {
                alert("Could not parse data. Ensure you pasted a table with headers.");
            }
        },
        error: function (err) {
            alert("Error parsing: " + err.message);
        }
    });
}

function showMappingStep() {
    document.getElementById('import-step-1').classList.add('hidden');
    document.getElementById('import-step-2').classList.remove('hidden');

    document.getElementById('btn-start-import').disabled = false;
    document.getElementById('btn-start-import').classList.remove('cursor-not-allowed', 'bg-slate-300');
    document.getElementById('btn-start-import').classList.add('bg-medical-600', 'hover:bg-medical-700');

    renderMappingTable();
}

function renderMappingTable() {
    const tbody = document.getElementById('mapping-table-body');
    tbody.innerHTML = '';

    const appFields = [
        { key: 'name', label: 'Patient Name', aliases: ['patient name', 'name', 'full name'] },
        { key: 'code', label: 'Patient Code/ID', aliases: ['patient code', 'code', 'id', 'mrn', 'file no'] },
        { key: 'ward', label: 'Ward Name', aliases: ['ward', 'unit', 'location'] },
        { key: 'room', label: 'Room Number', aliases: ['room', 'bed'] },
        { key: 'age', label: 'Age', aliases: ['age', 'dob'] },
        { key: 'diagnosis', label: 'Diagnosis', aliases: ['diagnosis', 'cause of admission', 'admission reason', 'dx'] },
        { key: 'provider', label: 'Provider', aliases: ['provider', 'physician', 'doctor', 'consultant'] },
        { key: 'treatment', label: 'Treatment', aliases: ['treatment', 'plan', 'rx'] },
        { key: 'medications', label: 'Medication List', aliases: ['medications', 'meds', 'medication list', 'drugs'] }
    ];

    appFields.forEach(field => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";

        let selectedHeader = "";
        const lowerLabel = field.label.toLowerCase();
        const lowerKey = field.key.toLowerCase();
        const aliases = field.aliases || [];

        // Find best match in CSV headers
        csvHeaders.forEach(h => {
            const lowerH = h.toLowerCase();

            // 1. Exact Match
            if (lowerH === lowerKey || lowerH === lowerLabel) {
                selectedHeader = h;
                return;
            }

            // 2. Alias Match (Word Boundary)
            // prevent "id" matching "provider"
            if (aliases.some(a => {
                // Escape special regex chars if any
                const escapedAlias = a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`(^|[^a-z0-9])${escapedAlias}([^a-z0-9]|$)`, 'i');
                return regex.test(lowerH);
            })) {
                selectedHeader = h;
            }
        });

        const options = csvHeaders.map(h => `<option value="${h}" ${h === selectedHeader ? 'selected' : ''}>${h}</option>`).join('');

        tr.innerHTML = `
            <td class="px-4 py-3 font-medium text-slate-700">${field.label}</td>
            <td class="px-4 py-3">
                <select class="w-full bg-white border border-slate-200 rounded-lg text-sm p-2 focus:ring-2 focus:ring-medical-500 outline-none map-select" data-field="${field.key}">
                    <option value="">(Skip)</option>
                    ${options}
                </select>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function startImport() {
    document.getElementById('import-step-2').classList.add('hidden');
    document.getElementById('import-step-3').classList.remove('hidden');
    document.getElementById('import-footer').classList.add('hidden');

    const mapping = {};
    document.querySelectorAll('.map-select').forEach(select => {
        if (select.value) {
            mapping[select.dataset.field] = select.value;
        }
    });

    const newPatients = csvData.map(row => {
        const p = {};
        Object.keys(mapping).forEach(key => {
            p[key] = row[mapping[key]];
        });

        // Context Aware: Ward
        if ((!p.ward || p.ward === '') && appData.currentWard && appData.currentWard !== 'Unassigned') {
            p.ward = appData.currentWard;
        }

        p.id = Date.now().toString() + Math.random().toString().slice(2, 5);
        p.labs = p.labs || {};
        p.symptoms = p.symptoms || {};
        p.notes = p.notes || "";
        return p;
    });

    document.getElementById('import-status-text').innerText = `Uploading ${newPatients.length} patients...`;

    try {
        const payload = {
            action: 'import',
            patients: newPatients
        };

        // DEBUG: Check payload
        console.log("Payload:", payload);

        const res = await fetch(GAS_API_URL, {
            method: 'POST',
            mode: 'no-cors', // <--- This often hides errors. 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        // Since mode is no-cors, we can't read the response text.
        // We rely on the request passing through.

        document.getElementById('import-status-text').innerText = "Processing on server...";
        await new Promise(r => setTimeout(r, 2000));

        alert("Import sent to server! Refresh the page in a few seconds to see changes.\n(If empty, check headers in Sheet)");
        closeImportModal();
        fetchData();

    } catch (e) {
        alert("Import Failed: " + e.message);
        closeImportModal();
    }
}
