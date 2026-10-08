const SUPABASE_URL = "https://sgwhxfvcqcfwewekhspw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gaeh2owrgPYET5iof4jJ4w_ghxPcksQ";
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  const message = document.getElementById("authMessage");
  if (message) message.textContent = "Не удалось загрузить библиотеку Supabase. Обновите страницу через Ctrl+F5.";
  throw new Error("Supabase library was not loaded");
}
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const money = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 2 });
const $ = (id) => document.getElementById(id);
const fields = ["documentDate", "documentNumber", "organization", "personName", "openingBalance"];
const body = $("operationsBody");
let currentDocumentId = null;
let savedDocuments = [];

function today() { return new Date().toISOString().slice(0, 10); }
function formatMoney(value) { return money.format(Number(value) || 0); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char])); }
function showMessage(message, isError = true) { $("authMessage").textContent = message; $("authMessage").style.color = isError ? "#a84e4e" : "#2f8a66"; }
function movement(rows) { return rows.reduce((sum, row) => sum + ((Number(row.amount) || 0) * (row.type === "income" ? 1 : -1)), 0); }
function documentEnding(doc) {
  if (doc.ending_balance !== null && doc.ending_balance !== undefined) return Number(doc.ending_balance) || 0;
  return (Number(doc.opening_balance) || 0) + movement((doc.operations || []).map((row) => ({ type: row.operation_type, amount: row.amount })));
}
function previousDocument() {
  const organization = $("organization").value.trim();
  const personName = $("personName").value.trim();
  const date = $("documentDate").value || today();
  if (!organization || !personName) return null;
  return savedDocuments.filter((doc) => doc.id !== currentDocumentId && doc.organization === organization && doc.person_name === personName && doc.document_date <= date)
    .sort((a, b) => `${b.document_date}T${b.created_at || b.updated_at || ""}`.localeCompare(`${a.document_date}T${a.created_at || a.updated_at || ""}`))[0] || null;
}
function syncOpeningBalance() {
  const previous = previousDocument();
  const input = $("openingBalance");
  input.readOnly = Boolean(previous);
  if (previous) {
    input.value = documentEnding(previous).toFixed(2);
    $("saveState").textContent = `Остаток из документа ${previous.document_number}`;
  }
  update();
  if (previous) $("saveState").textContent = `Остаток из документа ${previous.document_number}`;
}
function getData() {
  return {
    fields: Object.fromEntries(fields.map((id) => [id, $(id).value])),
    rows: [...body.querySelectorAll("tr")].map((row) => ({ date: row.querySelector(".operation-date").value, name: row.querySelector(".operation-name").value, type: row.querySelector(".operation-income").checked ? "income" : "expense", amount: row.querySelector(".operation-amount").value }))
  };
}

function addRow(data = {}) {
  const row = document.createElement("tr");
  row.innerHTML = `<td><input type="date" class="operation-date" value="${data.date || today()}"></td><td><input type="text" class="operation-name" placeholder="Например, закупка материалов" value="${escapeHtml(data.name || "")}"></td><td><input type="number" class="operation-amount" min="0" step="0.01" placeholder="0" value="${data.amount ?? ""}"></td><td class="income-cell"><input type="checkbox" class="operation-income" aria-label="Доход"${data.type === "income" ? " checked" : ""}></td><td><button class="remove-row" type="button" title="Удалить строку">×</button></td>`;
  body.appendChild(row);
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
  row.querySelector(".operation-income").addEventListener("change", update);
  row.querySelector(".remove-row").addEventListener("click", () => { row.remove(); update(); });
  update();
}

function update() {
  const data = getData();
  const opening = Number(data.fields.openingBalance) || 0;
  const netMovement = movement(data.rows);
  const total = netMovement;
  $("totalAmount").textContent = formatMoney(total);
  $("tableTotal").textContent = formatMoney(total);
  const ending = opening + netMovement;
  $("endingBalance").textContent = formatMoney(ending);
  $("operationCount").textContent = data.rows.length;
  $("emptyState").hidden = data.rows.length > 0;
  $("saveState").textContent = currentDocumentId ? "Есть несохранённые изменения" : "Новый документ";
}

function refreshSuggestions() {
  const organizations = [...new Set(savedDocuments.map((doc) => doc.organization).filter(Boolean))].sort();
  const names = [...new Set(savedDocuments.map((doc) => doc.person_name).filter(Boolean))].sort();
  $("organizationOptions").innerHTML = organizations.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  $("nameOptions").innerHTML = names.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

function renderSavedDocuments() {
  const list = $("savedDocumentsList");
  $("savedEmptyState").hidden = savedDocuments.length > 0;
  list.innerHTML = savedDocuments.map((doc) => `<div class="saved-item" data-id="${doc.id}"><div class="saved-item-main"><div class="saved-item-title">${escapeHtml(doc.document_number)} · ${escapeHtml(doc.organization || "Без организации")}</div><div class="saved-item-meta">${escapeHtml(doc.document_date || "Без даты")} · ${escapeHtml(doc.person_name || "Без имени")} · ${formatMoney(doc.total || 0)}</div></div><div class="saved-item-actions"><button class="open-document" type="button">Открыть</button><button class="delete-document" type="button">Удалить</button></div></div>`).join("");
  list.querySelectorAll(".saved-item").forEach((item) => {
    item.querySelector(".open-document").addEventListener("click", () => loadDocument(item.dataset.id));
    item.querySelector(".delete-document").addEventListener("click", () => deleteDocument(item.dataset.id));
  });
  refreshSuggestions();
}

async function loadDocuments() {
  const { data, error } = await supabaseClient.from("documents").select("*, operations(*)").order("updated_at", { ascending: false });
  if (error) { showMessage(`Ошибка загрузки документов: ${error.message}`); return; }
  savedDocuments = (data || []).map((doc) => ({ ...doc, ending_balance: documentEnding(doc), total: movement((doc.operations || []).map((row) => ({ type: row.operation_type, amount: row.amount }))) }));
  renderSavedDocuments();
}

async function loadDocument(id) {
  const document = savedDocuments.find((item) => item.id === id);
  if (!document) return;
  currentDocumentId = document.id;
  $("documentDate").value = document.document_date || today();
  $("documentNumber").value = document.document_number || "";
  $("organization").value = document.organization || "";
  $("personName").value = document.person_name || "";
  $("openingBalance").value = document.opening_balance || "";
  body.innerHTML = "";
  (document.operations || []).forEach((row) => addRow({ date: row.operation_date, name: row.name, type: row.operation_type, amount: row.amount }));
  syncOpeningBalance();
  update();
  $("savedPanel").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function save() {
  const saveButton = $("saveButton");
  const originalSaveText = saveButton.textContent;
  saveButton.disabled = true;
  saveButton.textContent = "Сохранение...";
  const data = getData();
  const user = (await supabaseClient.auth.getUser()).data.user;
  if (!user) {
    saveButton.disabled = false;
    saveButton.textContent = originalSaveText;
    $("saveState").textContent = "Сначала войдите в аккаунт";
    return;
  }
  let documentId = currentDocumentId;
  let documentNumber = $("documentNumber").value;
  if (!documentId) {
    const maxNumber = savedDocuments.reduce((max, doc) => Math.max(max, Number(doc.number_value) || 0), 0) + 1;
    documentNumber = `АВ-${String(maxNumber).padStart(4, "0")}`;
    $("documentNumber").value = documentNumber;
  }
  const endingBalance = (Number(data.fields.openingBalance) || 0) + movement(data.rows);
  const documentPayload = { user_id: user.id, document_number: documentNumber, number_value: Number(documentNumber.replace(/\D/g, "")) || 1, document_date: data.fields.documentDate || today(), organization: data.fields.organization || null, person_name: data.fields.personName || null, opening_balance: Number(data.fields.openingBalance) || 0, ending_balance: endingBalance, updated_at: new Date().toISOString() };
  let result;
  if (documentId) result = await supabaseClient.from("documents").update(documentPayload).eq("id", documentId).select().single();
  else result = await supabaseClient.from("documents").insert(documentPayload).select().single();
  if (result.error) {
    saveButton.disabled = false;
    saveButton.textContent = originalSaveText;
    $("saveState").textContent = `Ошибка: ${result.error.message}`;
    return;
  }
  documentId = result.data.id;
  currentDocumentId = documentId;
  const deleteResult = await supabaseClient.from("operations").delete().eq("document_id", documentId);
  if (deleteResult.error) {
    saveButton.disabled = false;
    saveButton.textContent = originalSaveText;
    $("saveState").textContent = `Ошибка операций: ${deleteResult.error.message}`;
    return;
  }
  const operations = data.rows.filter((row) => row.name || Number(row.amount)).map((row) => ({ document_id: documentId, user_id: user.id, operation_date: row.date || today(), name: row.name || "", operation_type: row.type || "expense", amount: Number(row.amount) || 0 }));
  if (operations.length) {
    const operationResult = await supabaseClient.from("operations").insert(operations);
    if (operationResult.error) {
      saveButton.disabled = false;
      saveButton.textContent = originalSaveText;
      $("saveState").textContent = `Документ сохранён, но ошибка операций: ${operationResult.error.message}`;
      return;
    }
  }
  $("saveState").textContent = `Сохранено · ${documentNumber}`;
  saveButton.textContent = "Сохранено";
  setTimeout(() => { saveButton.disabled = false; saveButton.textContent = originalSaveText; }, 1800);
  await loadDocuments();
}

async function deleteDocument(id) {
  if (!confirm("Удалить сохранённый документ?")) return;
  const { error } = await supabaseClient.from("documents").delete().eq("id", id);
  if (error) return showMessage(`Ошибка удаления: ${error.message}`);
  if (currentDocumentId === id) clearForm(false);
  await loadDocuments();
}

function clearForm(ask = true) { if (ask && !confirm("Очистить документ?")) return; currentDocumentId = null; fields.forEach((id) => $(id).value = id === "documentDate" ? today() : ""); body.innerHTML = ""; update(); }

async function enterApp() {
  $("authPanel").hidden = true;
  $("appContent").hidden = false;
  if (!$("signOutButton")) { const button = document.createElement("button"); button.id = "signOutButton"; button.className = "button button-ghost"; button.textContent = "Выйти"; button.addEventListener("click", () => supabaseClient.auth.signOut()); $("topbarActions").appendChild(button); }
  $("documentDate").value = today();
  await loadDocuments();
  update();
}

function leaveApp() { $("authPanel").hidden = false; $("appContent").hidden = true; currentDocumentId = null; }

async function signIn() {
  showMessage("Выполняю вход...", false);
  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email: $("authEmail").value.trim(), password: $("authPassword").value });
    if (error) showMessage(error.message);
  } catch (error) {
    showMessage(`Ошибка соединения: ${error.message || error}`);
  }
}

async function signUp() {
  showMessage("Создаю аккаунт...", false);
  try {
    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    if (!email || !password) return showMessage("Введите email и пароль.");
    if (password.length < 6) return showMessage("Пароль должен содержать минимум 6 символов.");
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if (error) return showMessage(error.message);
    showMessage(data.session ? "Аккаунт создан." : "Аккаунт создан. Проверьте почту для подтверждения.", false);
  } catch (error) {
    showMessage(`Ошибка соединения: ${error.message || error}`);
  }
}

fields.filter((id) => id !== "documentNumber").forEach((id) => {
  const handler = ["organization", "personName", "documentDate"].includes(id) ? syncOpeningBalance : update;
  $(id).addEventListener("input", handler);
  if (["organization", "personName", "documentDate"].includes(id)) $(id).addEventListener("change", handler);
});
$("addRowButton").addEventListener("click", () => addRow());
$("saveButton").addEventListener("click", save);
$("clearButton").addEventListener("click", clearForm);
$("documentsButton").addEventListener("click", () => { $("savedPanel").hidden = !$("savedPanel").hidden; renderSavedDocuments(); });
$("signInButton").addEventListener("click", signIn);
$("signUpButton").addEventListener("click", signUp);

supabaseClient.auth.onAuthStateChange((event, session) => { if (session) enterApp(); else leaveApp(); });
supabaseClient.auth.getSession().then(({ data }) => { if (data.session) enterApp(); else leaveApp(); });
