const STORAGE_KEY = "avance-document-v1";
const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });

const $ = (id) => document.getElementById(id);
const fields = ["documentDate", "organization", "personName", "openingBalance"];
const body = $("operationsBody");

function today() { return new Date().toISOString().slice(0, 10); }
function formatMoney(value) { return money.format(Number(value) || 0); }

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

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(getData())); $("saveState").textContent = "Сохранено"; }
function clearForm() { if (!confirm("Очистить документ?")) return; fields.forEach((id) => $(id).value = id === "documentDate" ? today() : ""); body.innerHTML = ""; update(); save(); }
function load() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  fields.forEach((id) => $(id).value = saved?.fields?.[id] ?? (id === "documentDate" ? today() : ""));
  (saved?.rows || []).forEach(addRow);
  update();
}

fields.forEach((id) => $(id).addEventListener("input", update));
$("addRowButton").addEventListener("click", () => addRow());
$("saveButton").addEventListener("click", save);
$("clearButton").addEventListener("click", clearForm);
load();
