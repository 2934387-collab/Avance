const STORAGE_KEY = "avance-document-v1";
const DOCUMENTS_KEY = "avance-saved-documents-v1";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

const $ = (id) => document.getElementById(id);
const fields = ["documentDate", "documentNumber", "organization", "personName", "openingBalance"];
const body = $("operationsBody");
let currentDocumentId = null;

function today() { return new Date().toISOString().slice(0, 10); }
function formatMoney(value) { return money.format(Number(value) || 0); }
function getSavedDocuments() { return JSON.parse(localStorage.getItem(DOCUMENTS_KEY) || "[]"); }
function setSavedDocuments(documents) { localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents)); }
function createId() { return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function nextDocumentNumber(documents) {
  const max = documents.reduce((highest, doc) => Math.max(highest, Number(doc.numberValue) || 0), 0);
  return { numberValue: max + 1, number: `АВ-${String(max + 1).padStart(4, "0")}` };
}

function addRow(data = {}) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="date" class="operation-date" value="${data.date || today()}"></td>
    <td><input type="text" class="operation-name" placeholder="Например, закупка материалов" value="${escapeHtml(data.name || "")}"></td>
    <td><input type="number" class="operation-amount" min="0" step="0.01" placeholder="0" value="${data.amount ?? ""}"></td>
    <td><button class="remove-row" type="button" title="Удалить строку">×</button></td>`;
  body.appendChild(row);
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
  row.querySelector(".remove-row").addEventListener("click", () => { row.remove(); update(); });
  update();
}

function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }

function getData() {
  return {
    fields: Object.fromEntries(fields.map((id) => [id, $(id).value])),
    rows: [...body.querySelectorAll("tr")].map((row) => ({
      date: row.querySelector(".operation-date").value,
      name: row.querySelector(".operation-name").value,
      amount: row.querySelector(".operation-amount").value,
    })),
  };
}

function refreshSuggestions() {
  const documents = getSavedDocuments();
  const organizations = [...new Set(documents.map((doc) => doc.fields.organization).filter(Boolean))].sort();
  const names = [...new Set(documents.map((doc) => doc.fields.personName).filter(Boolean))].sort();
  $("organizationOptions").innerHTML = organizations.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("nameOptions").innerHTML = names.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function renderSavedDocuments() {
  const documents = getSavedDocuments().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const list = $("savedDocumentsList");
  $("savedEmptyState").hidden = documents.length > 0;
  list.innerHTML = documents.map((doc) => `
    <div class="saved-item" data-id="${doc.id}">
      <div class="saved-item-main">
        <div class="saved-item-title">${escapeHtml(doc.number)} · ${escapeHtml(doc.fields.organization || "Без организации")}</div>
        <div class="saved-item-meta">${escapeHtml(doc.fields.documentDate || "Без даты")} · ${escapeHtml(doc.fields.personName || "Без имени")} · ${formatMoney(doc.total)}</div>
      </div>
      <div class="saved-item-actions"><button class="open-document" type="button">Открыть</button><button class="delete-document" type="button">Удалить</button></div>
    </div>`).join("");
  list.querySelectorAll(".saved-item").forEach((item) => {
    const id = item.dataset.id;
    item.querySelector(".open-document").addEventListener("click", () => loadDocument(id));
    item.querySelector(".delete-document").addEventListener("click", () => deleteDocument(id));
  });
  refreshSuggestions();
}

function loadDocument(id) {
  const document = getSavedDocuments().find((item) => item.id === id);
  if (!document) return;
  currentDocumentId = document.id;
  fields.forEach((field) => $(field).value = document.fields[field] || "");
  body.innerHTML = "";
  document.rows.forEach(addRow);
  update();
  $("savedPanel").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteDocument(id) {
  if (!confirm("Удалить сохранённый документ?")) return;
  setSavedDocuments(getSavedDocuments().filter((document) => document.id !== id));
  if (currentDocumentId === id) clearForm(false);
  renderSavedDocuments();
}

function update() {
  const data = getData();
  const total = data.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const opening = Number(data.fields.openingBalance) || 0;
  $("totalAmount").textContent = formatMoney(total);
  $("tableTotal").textContent = formatMoney(total);
  $("endingBalance").textContent = formatMoney(opening + total);
  $("operationCount").textContent = data.rows.length;
  $("emptyState").hidden = data.rows.length > 0;
  $("saveState").textContent = "Есть несохранённые изменения";
}

function save() {
  const data = getData();
  const documents = getSavedDocuments();
  let document = documents.find((item) => item.id === currentDocumentId);
  if (!document) {
    const next = nextDocumentNumber(documents);
    document = { id: createId(), number: next.number, numberValue: next.numberValue, createdAt: new Date().toISOString() };
    currentDocumentId = document.id;
    $("documentNumber").value = document.number;
    data.fields.documentNumber = document.number;
    documents.push(document);
  }
  document.fields = data.fields;
  document.rows = data.rows;
  document.total = data.rows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  document.updatedAt = new Date().toISOString();
  setSavedDocuments(documents);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  $("saveState").textContent = `Сохранено · ${document.number}`;
  renderSavedDocuments();
}
function clearForm(ask = true) { if (ask && !confirm("Очистить документ?")) return; currentDocumentId = null; fields.forEach((id) => $(id).value = id === "documentDate" ? today() : ""); body.innerHTML = ""; update(); }
function load() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  fields.forEach((id) => $(id).value = saved?.fields?.[id] ?? (id === "documentDate" ? today() : ""));
  (saved?.rows || []).forEach(addRow);
  renderSavedDocuments();
  update();
}

fields.forEach((id) => $(id).addEventListener("input", update));
$("addRowButton").addEventListener("click", () => addRow());
$("saveButton").addEventListener("click", save);
$("clearButton").addEventListener("click", clearForm);
$("documentsButton").addEventListener("click", () => { $("savedPanel").hidden = !$("savedPanel").hidden; renderSavedDocuments(); });
load();
