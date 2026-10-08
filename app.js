const SUPABASE_URL = "https://sgwhxfvcqcfwewekhspw.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_gaeh2owrgPYET5iof4jJ4w_ghxPcksQ";
if (!window.supabase || typeof window.supabase.createClient !== "function") {
  const message = document.getElementById("authMessage");
  if (message) message.textContent = "Не удалось загрузить библиотеку Supabase. Обновите страницу через Ctrl+F5.";
  throw new Error("Supabase library was not loaded");
}
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

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
function getData() {
  return {
    fields: Object.fromEntries(fields.map((id) => [id, $(id).value])),
    rows: [...body.querySelectorAll("tr")].map((row) => ({ date: row.querySelector(".operation-date").value, name: row.querySelector(".operation-name").value, amount: row.querySelector(".operation-amount").value }))
  };
}

function addRow(data = {}) {
  const row = document.createElement("tr");
  row.innerHTML = `<td><input type="date" class="operation-date" value="${data.date || today()}"></td><td><input type="text" class="operation-name" placeholder="Например, закупка материалов" value="${escapeHtml(data.name || "")}"></td><td><input type="number" class="operation-amount" min="0" step="0.01" placeholder="0" value="${data.amount ?? ""}"></td><td><button class="remove-row" type="button" title="Удалить строку">×</button></td>`;
  body.appendChild(row);
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", update));
  row.querySelector(".remove-row").addEventListener("click", () => { row.remove(); update(); });
  update();
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
  const { data, error } = await supabase.from("documents").select("*, operations(*)").order("updated_at", { ascending: false });
  if (error) { showMessage(`Ошибка загрузки документов: ${error.message}`); return; }
  savedDocuments = (data || []).map((doc) => ({ ...doc, total: (doc.operations || []).reduce((sum, row) => sum + Number(row.amount || 0), 0) }));
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
  (document.operations || []).forEach((row) => addRow({ date: row.operation_date, name: row.name, amount: row.amount }));
  update();
  $("savedPanel").hidden = true;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function save() {
  const data = getData();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return showMessage("Сначала войдите в аккаунт.");
  let documentId = currentDocumentId;
  let documentNumber = $("documentNumber").value;
  if (!documentId) {
    const maxNumber = savedDocuments.reduce((max, doc) => Math.max(max, Number(doc.number_value) || 0), 0) + 1;
    documentNumber = `АВ-${String(maxNumber).padStart(4, "0")}`;
    $("documentNumber").value = documentNumber;
  }
  const documentPayload = { user_id: user.id, document_number: documentNumber, number_value: Number(documentNumber.replace(/\D/g, "")) || 1, document_date: data.fields.documentDate || today(), organization: data.fields.organization || null, person_name: data.fields.personName || null, opening_balance: Number(data.fields.openingBalance) || 0, updated_at: new Date().toISOString() };
  let result;
  if (documentId) result = await supabase.from("documents").update(documentPayload).eq("id", documentId).select().single();
  else result = await supabase.from("documents").insert(documentPayload).select().single();
  if (result.error) return showMessage(`Ошибка сохранения документа: ${result.error.message}`);
  documentId = result.data.id;
  currentDocumentId = documentId;
  await supabase.from("operations").delete().eq("document_id", documentId);
  const operations = data.rows.filter((row) => row.name || Number(row.amount)).map((row) => ({ document_id: documentId, user_id: user.id, operation_date: row.date || today(), name: row.name || "", amount: Number(row.amount) || 0 }));
  if (operations.length) {
    const operationResult = await supabase.from("operations").insert(operations);
    if (operationResult.error) return showMessage(`Документ сохранён, но операции не записались: ${operationResult.error.message}`);
  }
  $("saveState").textContent = `Сохранено · ${documentNumber}`;
  await loadDocuments();
}

async function deleteDocument(id) {
  if (!confirm("Удалить сохранённый документ?")) return;
  const { error } = await supabase.from("documents").delete().eq("id", id);
  if (error) return showMessage(`Ошибка удаления: ${error.message}`);
  if (currentDocumentId === id) clearForm(false);
  await loadDocuments();
}

function clearForm(ask = true) { if (ask && !confirm("Очистить документ?")) return; currentDocumentId = null; fields.forEach((id) => $(id).value = id === "documentDate" ? today() : ""); body.innerHTML = ""; update(); }

async function enterApp() {
  $("authPanel").hidden = true;
  $("appContent").hidden = false;
  if (!$("signOutButton")) { const button = document.createElement("button"); button.id = "signOutButton"; button.className = "button button-ghost"; button.textContent = "Выйти"; button.addEventListener("click", () => supabase.auth.signOut()); $("topbarActions").appendChild(button); }
  $("documentDate").value = today();
  await loadDocuments();
  update();
}

function leaveApp() { $("authPanel").hidden = false; $("appContent").hidden = true; currentDocumentId = null; }

async function signIn() {
  showMessage("Выполняю вход...", false);
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: $("authEmail").value.trim(), password: $("authPassword").value });
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
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return showMessage(error.message);
    showMessage(data.session ? "Аккаунт создан." : "Аккаунт создан. Проверьте почту для подтверждения.", false);
  } catch (error) {
    showMessage(`Ошибка соединения: ${error.message || error}`);
  }
}

fields.filter((id) => id !== "documentNumber").forEach((id) => $(id).addEventListener("input", update));
$("addRowButton").addEventListener("click", () => addRow());
$("saveButton").addEventListener("click", save);
$("clearButton").addEventListener("click", clearForm);
$("documentsButton").addEventListener("click", () => { $("savedPanel").hidden = !$("savedPanel").hidden; renderSavedDocuments(); });
$("signInButton").addEventListener("click", signIn);
$("signUpButton").addEventListener("click", signUp);

supabase.auth.onAuthStateChange((event, session) => { if (session) enterApp(); else leaveApp(); });
supabase.auth.getSession().then(({ data }) => { if (data.session) enterApp(); else leaveApp(); });
