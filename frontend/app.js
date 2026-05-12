const isLocal = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
const API_BASE = isLocal && window.location.port !== '8000' ? "http://127.0.0.1:8000" : "";
const tokenKey = "management_tool_token";

// ── Panel refs ────────────────────────────────────────────────────
const authPanel      = document.querySelector("#authPanel");
const dashboardPanel = document.querySelector("#dashboardPanel");
const adminPanel     = document.querySelector("#adminPanel");

// ── Auth refs ─────────────────────────────────────────────────────
const authMessage       = document.querySelector("#authMessage");
const loginForm         = document.querySelector("#loginForm");
const signupForm        = document.querySelector("#signupForm");
const rolePicker        = document.querySelector("#rolePicker");
const signupFields      = document.querySelector("#signupFields");
const roleInput         = document.querySelector("#roleInput");
const selectedRoleBadge = document.querySelector("#selectedRoleBadge");
const roleBackBtn       = document.querySelector("#roleBackBtn");

// ── Dashboard refs ────────────────────────────────────────────────
const appMessage        = document.querySelector("#appMessage");
const projectForm       = document.querySelector("#projectForm");
const taskForm          = document.querySelector("#taskForm");
const projectList       = document.querySelector("#projectList");
const taskProjectSelect = document.querySelector("#taskProjectSelect");
const welcomeTitle      = document.querySelector("#welcomeTitle");
const userRoleBadge     = document.querySelector("#userRoleBadge");

// ── Admin refs ────────────────────────────────────────────────────
const adminEmployeeGrid = document.querySelector("#adminEmployeeGrid");
const adminMessage      = document.querySelector("#adminMessage");

// ── State ─────────────────────────────────────────────────────────
let currentUser  = null;
let projects     = [];
let allManagers  = [];
let allProjects  = [];
let allTasks     = [];
let kanbanViewMode = 'my';

// assignedToInput can be replaced by a select for managers, so use let
let assignedToInput = document.querySelector("#assignedToInput");

// ══ Utilities ═════════════════════════════════════════════════════

function getToken() { return localStorage.getItem(tokenKey); }

function setMessage(target, text, type = "") {
  target.textContent = text;
  target.className = `message ${type}`.trim();
}

async function apiRequest(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.detail || "Request failed");
  return data;
}

function formatDate(value) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function toApiDate(value) { return value ? new Date(value).toISOString() : null; }

// ══ Custom Modal ══════════════════════════════════════════════════
function showModal(title, body, placeholder, onConfirm) {
  const backdrop = document.querySelector("#modalBackdrop");
  const titleEl  = document.querySelector("#modalTitle");
  const bodyEl   = document.querySelector("#modalBody");
  const inputEl  = document.querySelector("#modalInput");
  const cancel   = document.querySelector("#modalCancelBtn");
  const confirm  = document.querySelector("#modalConfirmBtn");
  const close    = document.querySelector("#modalCloseBtn");

  titleEl.textContent = title;
  bodyEl.textContent = body;
  inputEl.placeholder = placeholder;
  inputEl.value = "";
  backdrop.classList.remove("hidden");

  // Keep focus in modal
  setTimeout(() => inputEl.focus(), 100);

  const cleanup = () => {
    backdrop.classList.add("hidden");
    cancel.removeEventListener("click", onCancelClick);
    close.removeEventListener("click", onCancelClick);
    confirm.removeEventListener("click", onConfirmClick);
  };

  const onCancelClick = () => { cleanup(); onConfirm(null); };
  const onConfirmClick = () => { cleanup(); onConfirm(inputEl.value); };

  cancel.addEventListener("click", onCancelClick);
  close.addEventListener("click", onCancelClick);
  confirm.addEventListener("click", onConfirmClick);
}

// ══ Panel switching ════════════════════════════════════════════════

function showAuth()        { dashboardPanel.classList.add("hidden"); adminPanel.classList.add("hidden"); authPanel.classList.remove("hidden"); }
function showDashboard()   { authPanel.classList.add("hidden"); adminPanel.classList.add("hidden"); dashboardPanel.classList.remove("hidden"); }
function showAdminPanel()  { authPanel.classList.add("hidden"); dashboardPanel.classList.add("hidden"); adminPanel.classList.remove("hidden"); }

// ══ Auth tabs ══════════════════════════════════════════════════════

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".auth-card .form").forEach((f) => f.classList.remove("active"));
    button.classList.add("active");
    document.querySelector(`#${button.dataset.authTab}Form`).classList.add("active");
    setMessage(authMessage, "");
    if (button.dataset.authTab === "signup") resetSignupToStep1();
  });
});

// ══ Role picker ════════════════════════════════════════════════════

function resetSignupToStep1() {
  rolePicker.classList.remove("hidden");
  signupFields.classList.add("hidden");
  roleInput.value = "";
  signupForm.reset();
  document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
}

document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    const role = card.dataset.role;
    roleInput.value = role;
    document.querySelectorAll(".role-card").forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    rolePicker.classList.add("hidden");
    signupFields.classList.remove("hidden");
    const icon  = role === "manager" ? "🏢" : "👤";
    const label = role === "manager" ? "Manager" : "Employee";
    selectedRoleBadge.innerHTML = `${icon} Signing up as <strong>${label}</strong>`;
  });
});

roleBackBtn.addEventListener("click", resetSignupToStep1);

// ══ Login ══════════════════════════════════════════════════════════

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm))),
    });
    localStorage.setItem(tokenKey, data.access_token);
    setMessage(authMessage, "");
    await bootAfterLogin();
  } catch (error) {
    setMessage(authMessage, error.message, "error");
  }
});

// ══ Sign-up ════════════════════════════════════════════════════════

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiRequest("/auth/signup", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(new FormData(signupForm))),
    });
    setMessage(authMessage, "Account created. You can log in now.", "success");
    signupForm.reset();
    resetSignupToStep1();
    document.querySelector("[data-auth-tab='login']").click();
  } catch (error) {
    setMessage(authMessage, error.message, "error");
  }
});

// ══ Regular dashboard ══════════════════════════════════════════════

async function loadCurrentUser() {
  currentUser = await apiRequest("/me");
  welcomeTitle.textContent = `Welcome, ${currentUser.name}`;
  userRoleBadge.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
}

// For managers: swap the assignee number-input with a dropdown of their employees.
async function setupAssigneeField() {
  if (currentUser.role !== "manager") {
    assignedToInput.value = currentUser.id;
    return;
  }
  try {
    const data = await apiRequest("/me/team");
    const employees = data.employees || [];
    const select = document.createElement("select");
    select.name = "assigned_to";
    select.id   = "assignedToInput";
    select.required = true;
    select.setAttribute("aria-label", "Assign to employee");
    if (!employees.length) {
      const opt = document.createElement("option");
      opt.value = ""; opt.textContent = "No employees under you";
      select.append(opt);
    } else {
      employees.forEach((emp) => {
        const opt = document.createElement("option");
        opt.value = emp.id;
        opt.textContent = `${emp.name}`;
        select.append(opt);
      });
    }
    assignedToInput.replaceWith(select);
    assignedToInput = document.querySelector("#assignedToInput");
  } catch (e) {
    console.warn("Could not load team:", e);
    assignedToInput.value = currentUser.id;
  }
}

async function loadStats() {
  const stats = await apiRequest("/dashboard/stats");
  document.querySelector("#totalTasks").textContent    = stats.total_tasks;
  document.querySelector("#todoTasks").textContent     = stats.todo_tasks;
  document.querySelector("#progressTasks").textContent = stats.in_progress_tasks;
  document.querySelector("#doneTasks").textContent     = stats.done_tasks;
  document.querySelector("#overdueTasks").textContent  = stats.overdue_tasks;
  await loadNotifications();
  await loadAnalytics();
}

async function loadProjects() {
  const data = await apiRequest("/projects/?limit=50");
  projects = data.projects || [];
  renderProjects();
  renderProjectOptions();
}

async function loadTasks() {
  const data = await apiRequest("/tasks/?limit=50");
  allTasks = data.tasks || [];
  filterAndRenderTasks();
}

function filterAndRenderTasks() {
  let filtered = allTasks;
  if (currentUser?.role === 'manager') {
    if (kanbanViewMode === 'my') {
      filtered = allTasks.filter(t => t.assigned_to === currentUser.id);
    } else {
      filtered = allTasks.filter(t => t.assigned_to !== currentUser.id);
    }
  }
  renderTasks(filtered);
}

async function refreshApp() {
  await Promise.all([loadStats(), loadProjects(), loadTasks()]);
}

function renderProjectOptions() {
  taskProjectSelect.innerHTML = "";
  if (!projects.length) {
    const opt = document.createElement("option");
    opt.value = ""; opt.textContent = "Create a project first";
    taskProjectSelect.append(opt);
    return;
  }
  projects.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id; opt.textContent = p.name;
    taskProjectSelect.append(opt);
  });
}

function renderProjects() {
  projectList.innerHTML = "";
  if (!projects.length) { projectList.innerHTML = '<p class="empty">No projects yet.</p>'; return; }
  projects.forEach((project) => {
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-head">
        <h3>${escapeHtml(project.name)}</h3>
        <span class="pill">${escapeHtml(project.role)}</span>
      </div>
      <p>${escapeHtml(project.description || "No description")}</p>
      <div class="meta"><span class="pill">ID ${project.id}</span></div>`;
    projectList.append(item);
  });
}

// ── Kanban state ───────────────────────────────────────────────────
const KANBAN_COLS = ['todo', 'in_progress', 'done', 'on_hold'];
let draggedTaskId   = null;
let draggedFromStatus = null;

function renderTasks(tasks) {
  // Clear all columns
  KANBAN_COLS.forEach(s => {
    const el = document.getElementById(`cards-${s}`);
    const ct = document.getElementById(`count-${s}`);
    if (el) el.innerHTML = '';
    if (ct) ct.textContent = '0';
  });

  const grouped = { todo: [], in_progress: [], done: [], on_hold: [] };
  tasks.forEach(t => { (grouped[t.status] ? grouped[t.status] : grouped.todo).push(t); });

  KANBAN_COLS.forEach(status => {
    const container = document.getElementById(`cards-${status}`);
    const countEl   = document.getElementById(`count-${status}`);
    const cards     = grouped[status] || [];
    if (countEl) countEl.textContent = cards.length;
    if (!container) return;
    if (!cards.length) {
      container.innerHTML = '<div class="kanban-empty">Empty</div>';
      return;
    }
    cards.forEach(task => container.appendChild(createKanbanCard(task)));
  });

  setupKanbanDrop();
}

function createKanbanCard(task) {
  const card = document.createElement('div');
  card.className = `kanban-card priority-${task.priority}`;
  card.draggable = true;
  card.dataset.taskId = task.id;
  card.dataset.status = task.status;

  const isOnHold   = task.status === 'on_hold';
  const appealNote = task.on_hold_reason || '';
  const pEmoji     = { high: '🔴', medium: '🟡', low: '🟢' }[task.priority] || '⚪';
  const assigneeBadge = (currentUser && currentUser.role === 'manager' && task.assigned_to !== currentUser.id)
    ? `<span class="pill" style="margin-left:auto">👤 ${escapeHtml(task.assignee_name || `ID ${task.assigned_to}`)}</span>`
    : '';
  const isDone = task.status === 'done';

  card.innerHTML = `
    <div class="kcard-header">
      <span class="kcard-drag">⠿</span>
      <span class="kcard-title">${escapeHtml(task.title)}</span>
    </div>
    ${task.description ? `<p class="kcard-desc">${escapeHtml(task.description)}</p>` : ''}
    ${isOnHold ? `<div class="kcard-appeal">⚠️ ${escapeHtml(appealNote || 'Appeal sent — awaiting manager reassignment')}</div>` : ''}
    ${isDone && task.completion_feedback ? `
      <div class="kcard-feedback" style="background:var(--surface-muted); padding:8px; border-radius:6px; margin-top:8px; font-size:0.8rem;">
        <strong>Feedback:</strong> ${escapeHtml(task.completion_feedback)}
        ${task.completion_file ? `<br/><a href="${API_BASE}/${task.completion_file}" target="_blank" style="color:var(--primary); text-decoration:underline;">📎 Download Attachment</a>` : ''}
      </div>
    ` : ''}
    <div class="kcard-meta">
      <span class="kcard-priority">${pEmoji} ${task.priority}</span>
      <span class="kcard-due">${formatDate(task.due_date)}</span>
      ${assigneeBadge}
    </div>
    <div class="kcard-actions">
      <button class="kcard-btn analyse-btn" data-task-id="${task.id}">✦ Analyse</button>
      ${!isOnHold ? `<button class="kcard-btn cantdo-btn" data-task-id="${task.id}">⛔ Can't Do</button>` : ''}
    </div>
    <div class="analysis-container"></div>`;

  // Drag
  card.addEventListener('dragstart', e => {
    draggedTaskId     = task.id;
    draggedFromStatus = task.status;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => card.classList.add('dragging'), 0);
  });
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    draggedTaskId = null;
  });

  // Analyse
  card.querySelector('.analyse-btn')?.addEventListener('click', function() { handleAnalyse(this); });

  // Can't Do
  card.querySelector('.cantdo-btn')?.addEventListener('click', () => handleCantDo(task));

  return card;
}

async function handleCantDo(task) {
  showModal(
    "Request Reassignment",
    `Why can't you complete "${task.title}"? This sends a reassignment appeal to your manager.`,
    "Enter reason here...",
    async (reason) => {
      if (reason === null) return;
      try {
        await apiRequest(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'on_hold', on_hold_reason: reason.trim() }) });
        setMessage(appMessage, 'Task moved to On Hold. Manager has been notified.', 'success');
        await Promise.all([loadStats(), loadTasks()]);
      } catch (err) { setMessage(appMessage, err.message, 'error'); }
    }
  );
}

// ══ COMPLETE TASK MODAL LOGIC ═════════════════════════════════════
function showCompleteTaskModal(taskId) {
  const backdrop = document.getElementById("completeModalBackdrop");
  const form = document.getElementById("completeTaskForm");
  const closeBtn = document.getElementById("completeModalCloseBtn");
  const cancelBtn = document.getElementById("completeModalCancelBtn");

  form.reset();
  backdrop.classList.remove("hidden");

  const cleanup = () => {
    backdrop.classList.add("hidden");
    closeBtn.removeEventListener('click', cleanup);
    cancelBtn.removeEventListener('click', cleanup);
    form.removeEventListener('submit', handleSubmit);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    try {
      await apiRequest(`/tasks/${taskId}/complete`, { method: 'POST', body: formData });
      setMessage(appMessage, 'Task marked as Done!', 'success');
      await Promise.all([loadStats(), loadTasks()]);
      cleanup();
    } catch (err) {
      setMessage(appMessage, err.message, 'error');
    }
  };

  closeBtn.addEventListener('click', cleanup);
  cancelBtn.addEventListener('click', cleanup);
  form.addEventListener('submit', handleSubmit);
}

function setupKanbanDrop() {
  KANBAN_COLS.forEach(status => {
    const container = document.getElementById(`cards-${status}`);
    const column    = document.getElementById(`col-${status}`);
    if (!container || !column) return;

    container.addEventListener('dragover', e => {
      e.preventDefault();
      column.classList.add('drag-over');
    });
    container.addEventListener('dragleave', e => {
      if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over');
    });
    container.addEventListener('drop', async e => {
      e.preventDefault();
      column.classList.remove('drag-over');
      if (!draggedTaskId || draggedFromStatus === status) return;

      // Employees must use "Can't Do" button for on_hold
      if (status === 'on_hold' && currentUser?.role === 'employee') {
        setMessage(appMessage, 'Use the ⛔ Can\'t Do button to request reassignment.', 'error');
        return;
      }
      
      // If moving to 'done', require feedback via modal
      if (status === 'done') {
        const tId = draggedTaskId;
        showCompleteTaskModal(tId);
        return;
      }
      
      try {
        await apiRequest(`/tasks/${draggedTaskId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
        setMessage(appMessage, 'Task updated.', 'success');
        await Promise.all([loadStats(), loadTasks()]);
      } catch (err) { setMessage(appMessage, err.message, 'error'); }
    });
  });
}

async function handleAnalyse(btn) {
  const taskId    = btn.dataset.taskId;
  const container = btn.closest('.kanban-card').querySelector('.analysis-container');

  if (container.innerHTML) { container.innerHTML = ''; btn.textContent = '✦ Analyse'; return; }

  btn.disabled = true; btn.textContent = 'Analysing…';
  container.innerHTML = `<p style="color:#6d28d9;font-size:0.8rem;padding:6px 0">⏳ Analysing…</p>`;

  try {
    const data = await apiRequest(`/tasks/${taskId}/analyse`, { method: 'POST' });
    const a = data.analysis;
    const cx = `complexity-${(a.complexity || 'medium').toLowerCase()}`;
    const risks = (a.risks || []).map(r => `<span class="analysis-chip">${escapeHtml(r)}</span>`).join('');
    const steps = (a.action_steps || []).map((s, i) => `<span class="analysis-chip">${i + 1}. ${escapeHtml(s)}</span>`).join('');
    container.innerHTML = `
      <div class="analysis-panel">
        <div class="analysis-header"><h4>✦ AI Analysis</h4><button class="analysis-close">✕</button></div>
        <div class="analysis-body">
          <p class="analysis-summary">${escapeHtml(a.summary || '')}</p>
          <div class="analysis-row"><span class="analysis-label">Complexity</span><span class="analysis-chip ${cx}">${escapeHtml(a.complexity || '—')}</span></div>
          <div class="analysis-row"><span class="analysis-label">Est. Time</span><span class="analysis-hours">⏱ ${a.estimated_hours ?? '?'} hrs</span></div>
          ${risks ? `<div class="analysis-row"><span class="analysis-label">Risks</span><div class="analysis-chips">${risks}</div></div>` : ''}
          ${steps ? `<div class="analysis-row"><span class="analysis-label">Steps</span><div class="analysis-chips">${steps}</div></div>` : ''}
          ${a.tips ? `<p class="analysis-tip">💡 ${escapeHtml(a.tips)}</p>` : ''}
        </div>
      </div>`;
    container.querySelector('.analysis-close').addEventListener('click', () => { container.innerHTML = ''; btn.textContent = '✦ Analyse'; });
    btn.textContent = '✦ Analyse';
  } catch (err) {
    container.innerHTML = `<p style="color:var(--danger);font-size:0.8rem;padding:4px 0">${escapeHtml(err.message)}</p>`;
    btn.textContent = '✦ Analyse';
  } finally { btn.disabled = false; }
}

// ══ AI Member Suggestion ═════════════════════════════════════════

/**
 * Renders AI suggestions into any panel element.
 * When a row is clicked, it selects that user in the given assignee <select> or <input>.
 */
function renderAiSuggestions(panel, data, assigneeEl) {
  const suggestions = data.suggestions || [];
  const summary     = data.summary || "";

  panel.classList.remove("hidden");
  panel.innerHTML = `
    <div class="ai-suggest-header">
      <h4>🤖 AI Member Suggestions</h4>
      <button class="ai-suggest-close" title="Close">✕</button>
    </div>
    ${summary ? `<p class="ai-suggest-summary">💡 ${escapeHtml(summary)}</p>` : ""}
    <div class="ai-suggest-list">
      ${suggestions.map(s => `
        <div class="ai-suggest-row ${s.rank === 1 ? 'rank-1' : ''}" data-user-id="${s.user_id}" role="button" tabindex="0" title="Click to select ${escapeHtml(s.name)}">
          <span class="ai-rank-badge ${s.rank === 1 ? 'rank-1' : ''}">${s.rank}</span>
          <div class="ai-member-info">
            <span class="ai-member-name">${escapeHtml(s.name)}</span>
            <span class="ai-member-reason">${escapeHtml(s.reason)}</span>
          </div>
          <div class="ai-score-wrap">
            <span class="ai-score-label">${s.score ?? '?'}%</span>
            <div class="ai-score-bar-bg">
              <div class="ai-score-bar-fill" style="width:0%" data-target="${s.score ?? 0}%"></div>
            </div>
          </div>
        </div>`).join("")}
    </div>`;

  // Animate score bars after paint
  requestAnimationFrame(() => {
    panel.querySelectorAll(".ai-score-bar-fill").forEach(bar => {
      bar.style.width = bar.dataset.target;
    });
  });

  // Row click → auto-fill assignee
  panel.querySelectorAll(".ai-suggest-row").forEach(row => {
    const handler = () => {
      const uid = row.dataset.userId;
      if (assigneeEl) {
        if (assigneeEl.tagName === "SELECT") {
          // Find the option matching this user id
          const opt = [...assigneeEl.options].find(o => String(o.value) === String(uid));
          if (opt) { assigneeEl.value = uid; }
        } else {
          assigneeEl.value = uid;
        }
      }
      // Highlight selected
      panel.querySelectorAll(".ai-suggest-row").forEach(r => r.style.background = "");
      row.style.background = "#ede9fe";
    };
    row.addEventListener("click", handler);
    row.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") handler(); });
  });

  // Close button
  panel.querySelector(".ai-suggest-close").addEventListener("click", () => {
    panel.classList.add("hidden");
    panel.innerHTML = "";
  });
}

// ── Manager dashboard: AI suggest button ──────────────────────────
document.querySelector("#taskAiSuggestBtn")?.addEventListener("click", async function () {
  if (currentUser?.role !== "manager") return;

  const btn     = this;
  const panel   = document.querySelector("#taskAiSuggestPanel");
  const projSel = document.querySelector("#taskProjectSelect");
  const titleEl = document.querySelector("#taskForm [name='title']");
  const descEl  = document.querySelector("#taskForm [name='description']");

  if (!projSel || !projSel.value) {
    setMessage(appMessage, "Please select a project first.", "error");
    return;
  }

  const projectId = projSel.value;
  const title     = titleEl?.value?.trim() || "";
  const desc      = descEl?.value?.trim()  || "";

  // Toggle off if already open
  if (!panel.classList.contains("hidden") && panel.innerHTML) {
    panel.classList.add("hidden");
    panel.innerHTML = "";
    return;
  }

  // Show loading
  btn.disabled = true;
  panel.classList.remove("hidden");
  panel.innerHTML = `<div class="ai-suggest-loading"><div class="ai-spinner"></div> Analysing your team…</div>`;

  try {
    const params = new URLSearchParams({ task_title: title, task_description: desc });
    const data   = await apiRequest(`/projects/${projectId}/suggest-member?${params}`);
    renderAiSuggestions(panel, data, document.querySelector("#assignedToInput"));
  } catch (err) {
    panel.innerHTML = `<p style="padding:12px;color:var(--danger);font-size:0.82rem">${escapeHtml(err.message)}</p>`;
  } finally {
    btn.disabled = false;
  }
});

projectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await apiRequest("/projects/", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(projectForm))) });
    projectForm.reset();
    setMessage(appMessage, "Project created.", "success");
    await loadProjects();
  } catch (error) { setMessage(appMessage, error.message, "error"); }
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(taskForm));
  payload.assigned_to = Number(payload.assigned_to);
  payload.project_id  = Number(payload.project_id);
  payload.due_date    = toApiDate(payload.due_date);
  try {
    await apiRequest("/tasks/", { method: "POST", body: JSON.stringify(payload) });
    taskForm.reset();
    setMessage(appMessage, "Task created.", "success");
    await Promise.all([loadStats(), loadTasks()]);
  } catch (error) { setMessage(appMessage, error.message, "error"); }
});


document.querySelector("#refreshProjectsBtn").addEventListener("click", async () => {
  try { await loadProjects(); setMessage(appMessage, "Projects refreshed.", "success"); }
  catch (error) { setMessage(appMessage, error.message, "error"); }
});

document.querySelector("#refreshTasksBtn").addEventListener("click", async () => {
  try { await Promise.all([loadStats(), loadTasks()]); setMessage(appMessage, "Tasks refreshed.", "success"); }
  catch (error) { setMessage(appMessage, error.message, "error"); }
});

document.querySelector("#logoutBtn").addEventListener("click", logout);

// ══ Admin panel ════════════════════════════════════════════════════

async function loadAdminData() {
  adminEmployeeGrid.innerHTML = '<p class="empty">Loading…</p>';
  setMessage(adminMessage, "");
  try {
    const [empData, mgrData, projData] = await Promise.all([
      apiRequest("/admin/employees"),
      apiRequest("/admin/managers"),
      apiRequest("/admin/projects"),
    ]);
    allManagers = mgrData.managers || [];
    allProjects = projData.projects || [];
    renderAdminEmployees(empData.employees || []);
    await loadAnalytics();
  } catch (error) {
    setMessage(adminMessage, error.message, "error");
  }
}

function renderAdminEmployees(employees) {
  adminEmployeeGrid.innerHTML = "";
  if (!employees.length) {
    adminEmployeeGrid.innerHTML = '<p class="empty">No employees found.</p>';
    return;
  }

  const projectOptions = allProjects.length
    ? allProjects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")
    : `<option value="">No projects available</option>`;

  employees.forEach((emp) => {
    const card = document.createElement("div");
    card.className = "admin-employee-card";

    const managerOptions = allManagers
      .map((m) => `<option value="${m.id}" ${emp.manager?.id === m.id ? "selected" : ""}>${escapeHtml(m.name)}</option>`)
      .join("");

    // Only employees can be assigned a manager
    const managerAssignHtml = emp.role === "employee" ? `
      <div class="admin-manager-assign">
        <label class="admin-label">Manager
          <select class="admin-mgr-select" data-employee-id="${emp.id}">
            <option value="">— Unassigned —</option>
            ${managerOptions}
          </select>
        </label>
        <button class="primary-btn admin-assign-btn" data-employee-id="${emp.id}">Save</button>
      </div>` : "";

    const rolePill = emp.role === "manager"
      ? `<span class="pill" style="background: rgba(139,92,246,0.15); color: #c4b5fd; border: 1px solid rgba(139,92,246,0.3);">Manager</span>`
      : `<span class="pill" style="background: rgba(16,185,129,0.15); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.3);">Employee</span>`;

    const taskRows = emp.tasks.length
      ? emp.tasks.map((t) => `
          <tr>
            <td style="font-weight: 500;">${escapeHtml(t.title)}</td>
            <td><span class="pill ${escapeHtml(t.priority)}">${escapeHtml(t.priority)}</span></td>
            <td><span class="pill" style="opacity: 0.8">${escapeHtml(t.status.replaceAll("_", " "))}</span></td>
            <td style="color: var(--muted);">${formatDate(t.due_date)}</td>
            <td><button class="ghost-btn-sm admin-delete-task-btn" style="color: var(--danger)" data-task-id="${t.id}">Delete</button></td>
          </tr>`).join("")
      : `<tr><td colspan="5" class="empty-cell" style="padding: 24px; text-align: center; color: var(--muted);">No tasks assigned</td></tr>`;

    card.innerHTML = `
      <div class="admin-emp-header">
        <div class="admin-emp-info">
          <div class="admin-avatar">${escapeHtml(emp.name).charAt(0)}</div>
          <div>
            <span class="admin-emp-name">${escapeHtml(emp.name)} ${rolePill}</span>
            <span class="admin-emp-email">${escapeHtml(emp.email)}</span>
          </div>
        </div>
        <div class="admin-emp-actions">
          ${managerAssignHtml}
          <button class="ghost-btn-sm admin-delete-user-btn" style="color: var(--danger);" data-employee-id="${emp.id}">Remove User</button>
        </div>
      </div>
      <div class="admin-assign-section">
        <button type="button" class="secondary-btn admin-toggle-task-btn" data-employee-id="${emp.id}">+ Assign Task</button>
        <form class="admin-task-form hidden" data-employee-id="${emp.id}">
          <div class="admin-task-form-grid">
            <input type="text" name="title" placeholder="Task title" required />
            <select name="priority">
              <option value="low">Low</option>
              <option value="medium" selected>Medium</option>
              <option value="high">High</option>
            </select>
            <input type="datetime-local" name="due_date" />
            <select name="project_id" required>${projectOptions}</select>
          </div>
          <div class="admin-ai-suggest-bar">
            <button type="button" class="ai-suggest-btn admin-ai-suggest-btn" data-employee-id="${emp.id}">🤖 AI Suggest Best Member</button>
          </div>
          <div class="admin-ai-suggest-panel hidden" data-employee-id="${emp.id}"></div>
          <button type="submit" class="primary-btn">Assign Task</button>
        </form>
      </div>
      <div class="admin-task-table-wrap">
        <table class="admin-task-table">
          <thead><tr><th>Task</th><th>Priority</th><th>Status</th><th>Due</th><th>Action</th></tr></thead>
          <tbody>${taskRows}</tbody>
        </table>
      </div>`;
    adminEmployeeGrid.append(card);
  });

  // ── Manager save buttons
  adminEmployeeGrid.querySelectorAll(".admin-assign-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const empId    = Number(btn.dataset.employeeId);
      const select   = adminEmployeeGrid.querySelector(`.admin-mgr-select[data-employee-id="${empId}"]`);
      const managerId = select.value ? Number(select.value) : null;
      try {
        await apiRequest(`/admin/employees/${empId}/manager`, {
          method: "PATCH", body: JSON.stringify({ manager_id: managerId }),
        });
        setMessage(adminMessage, "Manager updated.", "success");
        await loadAdminData();
      } catch (error) { setMessage(adminMessage, error.message, "error"); }
    });
  });

  // ── Delete user buttons
  adminEmployeeGrid.querySelectorAll(".admin-delete-user-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const empId = Number(btn.dataset.employeeId);
      const name  = btn.closest(".admin-employee-card").querySelector(".admin-emp-name").textContent;
      if (!confirm(`Delete user "${name}" and all their data? This cannot be undone.`)) return;
      try {
        await apiRequest(`/admin/users/${empId}`, { method: "DELETE" });
        setMessage(adminMessage, `User "${name}" deleted.`, "success");
        await loadAdminData();
      } catch (error) { setMessage(adminMessage, error.message, "error"); }
    });
  });

  // ── Delete task buttons
  adminEmployeeGrid.querySelectorAll(".admin-delete-task-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const taskId = Number(btn.dataset.taskId);
      if (!confirm("Delete this task?")) return;
      try {
        await apiRequest(`/admin/tasks/${taskId}`, { method: "DELETE" });
        setMessage(adminMessage, "Task deleted.", "success");
        await loadAdminData();
      } catch (error) { setMessage(adminMessage, error.message, "error"); }
    });
  });

  // ── Toggle assign-task forms
  adminEmployeeGrid.querySelectorAll(".admin-toggle-task-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const empId = btn.dataset.employeeId;
      const form  = adminEmployeeGrid.querySelector(`.admin-task-form[data-employee-id="${empId}"]`);
      form.classList.toggle("hidden");
      btn.textContent = form.classList.contains("hidden") ? "+ Assign Task" : "− Cancel";
    });
  });

  // ── Admin AI suggest buttons inside each employee card
  adminEmployeeGrid.querySelectorAll(".admin-ai-suggest-btn").forEach((btn) => {
    btn.addEventListener("click", async function () {
      const form      = this.closest(".admin-task-form");
      const panel     = form.querySelector(".admin-ai-suggest-panel");
      const projSel   = form.querySelector("[name='project_id']");
      const titleEl   = form.querySelector("[name='title']");
      const projectId = projSel?.value || null;

      // Toggle off
      if (!panel.classList.contains("hidden") && panel.innerHTML) {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
      }

      this.disabled = true;
      panel.classList.remove("hidden");
      panel.innerHTML = `<div class="ai-suggest-loading"><div class="ai-spinner"></div> Analysing all employees…</div>`;

      try {
        const title = titleEl?.value?.trim() || "";
        const params = new URLSearchParams({ task_title: title });
        if (projectId) params.set("project_id", projectId);
        const data = await apiRequest(`/admin/suggest-member?${params}`);

        // For admin panel we don't auto-select an assignee input (each card IS the assignee)
        // Instead we render the list for reference. Clicking a row highlights the best pick.
        // We still wire a pseudo-element so the name is shown.
        renderAiSuggestions(panel, data, null);
      } catch (err) {
        panel.innerHTML = `<p style="padding:12px;color:var(--danger);font-size:0.82rem">${escapeHtml(err.message)}</p>`;
      } finally {
        this.disabled = false;
      }
    });
  });

  // ── Assign task form submissions
  adminEmployeeGrid.querySelectorAll(".admin-task-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const empId   = Number(form.dataset.employeeId);
      const payload = Object.fromEntries(new FormData(form));
      payload.assigned_to = empId;
      payload.project_id  = Number(payload.project_id);
      payload.due_date    = payload.due_date ? new Date(payload.due_date).toISOString() : null;
      try {
        await apiRequest("/admin/tasks", { method: "POST", body: JSON.stringify(payload) });
        setMessage(adminMessage, "Task assigned.", "success");
        form.reset();
        form.classList.add("hidden");
        const toggleBtn = adminEmployeeGrid.querySelector(`.admin-toggle-task-btn[data-employee-id="${empId}"]`);
        if (toggleBtn) toggleBtn.textContent = "+ Assign Task";
        await loadAdminData();
      } catch (error) { setMessage(adminMessage, error.message, "error"); }
    });
  });
}

function setupKanbanTabs() {
  const tabsContainer = document.getElementById('kanbanTabs');
  const tabs = document.querySelectorAll('.kanban-tab');
  if (currentUser?.role === 'manager') {
    tabsContainer.classList.remove('hidden');
    // Remove existing to prevent dupes (or just ensure it's idempotent by replacing nodes)
    // Actually, setting it in bootAfterLogin means it runs once per login.
    tabs.forEach(tab => {
      // Just clear and add
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
      newTab.addEventListener('click', (e) => {
        document.querySelectorAll('.kanban-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        kanbanViewMode = e.target.dataset.view;
        filterAndRenderTasks();
      });
    });
  } else {
    tabsContainer.classList.add('hidden');
  }
}

document.querySelector("#adminRefreshBtn").addEventListener("click", loadAdminData);
document.querySelector("#adminLogoutBtn").addEventListener("click", logout);

// ══ Boot ═══════════════════════════════════════════════════════════

function logout() {
  localStorage.removeItem(tokenKey);
  currentUser = null;
  showAuth();
}

async function bootAfterLogin() {
  await loadCurrentUser();
  if (currentUser.role === "admin") {
    showAdminPanel();
    await loadAdminData();
  } else {
    showDashboard();
    setupKanbanTabs();
    // Reset visibility every login (in case previous session was employee)
    document.querySelector("#projectForm").classList.remove("hidden");
    document.querySelector("#taskForm").classList.remove("hidden");
    // Employees can view but not create tasks/projects
    if (currentUser.role === "employee") {
      document.querySelector("#projectForm").classList.add("hidden");
      document.querySelector("#taskForm").classList.add("hidden");
    }
    await setupAssigneeField();
    await refreshApp();
    await loadNotifications();
  }
}

async function boot() {
  if (!getToken()) { showAuth(); return; }
  try {
    await bootAfterLogin();
  } catch {
    localStorage.removeItem(tokenKey);
    showAuth();
  }
}

// ══ Notifications Logic ══════════════════════════════════════════
async function loadNotifications() {
  try {
    const data = await apiRequest('/notifications/');
    const notifs = data.notifications || [];
    const unreadCount = notifs.filter(n => !n.is_read).length;
    
    const isManager = currentUser?.role === 'manager' || currentUser?.role === 'employee';
    const badge = document.getElementById(currentUser?.role === 'admin' ? 'adminNotifBadge' : 'notifBadge');
    const list = document.getElementById(currentUser?.role === 'admin' ? 'adminNotifList' : 'notifList');

    if (!badge || !list) return;

    if (unreadCount > 0) {
      badge.textContent = unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }

    if (notifs.length === 0) {
      list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
        <p class="notif-msg">${escapeHtml(n.message)}</p>
        <span class="notif-time">${formatDate(n.created_at)}</span>
      </div>
    `).join('');

    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        if (!item.classList.contains('unread')) return;
        await apiRequest(`/notifications/${item.dataset.id}/read`, { method: 'PATCH' });
        loadNotifications();
      });
    });

  } catch (err) { console.error('Failed to load notifications', err); }
}

function setupNotificationListeners() {
  const toggleDropdown = (btnId, dropdownId) => {
    const btn = document.getElementById(btnId);
    const drop = document.getElementById(dropdownId);
    if (!btn || !drop) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      drop.classList.toggle('hidden');
      if (!drop.classList.contains('hidden')) loadNotifications();
    });
    document.addEventListener('click', (e) => {
      if (!btn.contains(e.target) && !drop.contains(e.target)) {
        drop.classList.add('hidden');
      }
    });
  };

  toggleDropdown('notifBtn', 'notifDropdown');
  toggleDropdown('adminNotifBtn', 'adminNotifDropdown');

  const handleMarkAllRead = async (btnId) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      try {
        await apiRequest('/notifications/read_all', { method: 'PATCH' });
        loadNotifications();
      } catch (err) { console.error('Failed to mark all read', err); }
    });
  };

  handleMarkAllRead('markAllReadBtn');
  handleMarkAllRead('adminMarkAllReadBtn');
}

setupNotificationListeners();

boot();

let statusChartInstance = null;
let priorityChartInstance = null;

async function loadAnalytics() {
  try {
    const data = await apiRequest('/dashboard/analytics');
    
    const isAdmin = currentUser?.role === 'admin';
    const statusCtx = document.getElementById(isAdmin ? 'adminStatusChart' : 'statusChart');
    const priorityCtx = document.getElementById(isAdmin ? 'adminPriorityChart' : 'priorityChart');
    
    if (!statusCtx || !priorityCtx) return;

    if (statusChartInstance) statusChartInstance.destroy();
    if (priorityChartInstance) priorityChartInstance.destroy();

    const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim() || '#fff';

    statusChartInstance = new Chart(statusCtx, {
      type: 'doughnut',
      data: {
        labels: ['To Do', 'In Progress', 'Done', 'On Hold'],
        datasets: [{
          data: [data.status.todo, data.status.in_progress, data.status.done, data.status.on_hold],
          backgroundColor: ['#6c63ff', '#ffb74d', '#4caf50', '#f44336'],
          borderColor: 'transparent'
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { labels: { color: textColor } },
          title: { display: true, text: 'Tasks by Status', color: textColor }
        }
      }
    });

    priorityChartInstance = new Chart(priorityCtx, {
      type: 'bar',
      data: {
        labels: ['Low', 'Medium', 'High'],
        datasets: [{
          label: 'Count',
          data: [data.priority.low, data.priority.medium, data.priority.high],
          backgroundColor: ['#4caf50', '#ffb74d', '#f44336'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { ticks: { color: textColor, stepSize: 1 } },
          x: { ticks: { color: textColor } }
        },
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Tasks by Priority', color: textColor }
        }
      }
    });

  } catch (err) {
    console.error("Failed to load analytics", err);
  }
}
