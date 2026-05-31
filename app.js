/* ── Cal App — app.js ── */
'use strict';

// ── State ──────────────────────────────────────────
const state = {
  today: new Date(),
  viewing: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  selectedDate: null,
  reminders: {},       // key: "YYYY-MM-DD", value: [ {id, text, cat, time, recurring} ]
  recurring: [],       // [ {id, text, cat, time} ] — show every day
  todos: [],           // [ {id, text, done} ]
  events: [],          // [ {id, text, start, end} ]
  editingId: null,
  accent: 'amber',     // 'amber' | 'teal'
};

// ── Helpers ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const pad = n => String(n).padStart(2, '0');
const uid = () => Math.random().toString(36).slice(2, 10);

function dateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function formatTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${pad(m)} ${ampm}`;
}

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SHORTS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── Cursor glow ─────────────────────────────────────
const cursorGlow = $('cursor-glow');
const glowPos = { x: 0, y: 0 };
const glowTarget = { x: 0, y: 0 };
let isGlowMoving = false;
const glowTextSelector = [
  '.today-day',
  '.today-full',
  '.section-label',
  '.empty-today',
  '.task-text',
  '.task-time',
  '.task-recurring-badge',
  '.cal-month',
  '.cal-year',
  '.weekdays span',
  '.cell-num',
  '.modal-date-label',
  '.modal-title',
  '.meta-label',
  '.recurring-label',
  '.cat-pill',
  '.mobile-view-btn',
  '.notification-toggle',
  '.notification-enable',
  '.notification-title',
  '.notification-time',
  '.today-tab',
  '.modal-type-tab',
  '.todo-add-toggle',
  '.todo-save',
  '.todo-input',
  '.date-input',
  '.event-bar',
  '.btn-cancel',
  '.btn-save',
  '.toast'
].join(',');
let glowFrame = null;

function moveCursorGlow() {
  glowPos.x += (glowTarget.x - glowPos.x) * 0.16;
  glowPos.y += (glowTarget.y - glowPos.y) * 0.16;
  cursorGlow.style.transform = `translate3d(${glowPos.x}px, ${glowPos.y}px, 0) translate3d(-50%, -50%, 0)`;

  if (Math.abs(glowTarget.x - glowPos.x) > 0.2 || Math.abs(glowTarget.y - glowPos.y) > 0.2) {
    requestAnimationFrame(moveCursorGlow);
  } else {
    isGlowMoving = false;
  }
}

function updateGlowText(x, y) {
  document.querySelectorAll(glowTextSelector).forEach(el => {
    const rect = el.getBoundingClientRect();
    const isHovered =
      x >= rect.left &&
      x <= rect.right &&
      y >= rect.top &&
      y <= rect.bottom;

    el.classList.toggle('glow-lit', isHovered);
  });
}

function clearGlowText() {
  document.querySelectorAll('.glow-lit').forEach(el => el.classList.remove('glow-lit'));
}

window.addEventListener('mousemove', (e) => {
  glowTarget.x = e.clientX;
  glowTarget.y = e.clientY;
  cursorGlow.classList.add('visible');

  if (!isGlowMoving) {
    isGlowMoving = true;
    glowPos.x = glowPos.x || e.clientX;
    glowPos.y = glowPos.y || e.clientY;
    requestAnimationFrame(moveCursorGlow);
  }

  if (glowFrame) cancelAnimationFrame(glowFrame);
  glowFrame = requestAnimationFrame(() => {
    updateGlowText(e.clientX, e.clientY);
    glowFrame = null;
  });
});

window.addEventListener('mouseleave', () => {
  cursorGlow.classList.remove('visible');
  clearGlowText();
});

// ── LocalStorage ────────────────────────────────────
function save() {
  localStorage.setItem('cal_reminders', JSON.stringify(state.reminders));
  localStorage.setItem('cal_recurring', JSON.stringify(state.recurring));
  localStorage.setItem('cal_todos', JSON.stringify(state.todos));
  localStorage.setItem('cal_events', JSON.stringify(state.events));
  localStorage.setItem('cal_accent', state.accent);
}

function load() {
  try {
    const r = localStorage.getItem('cal_reminders');
    const rec = localStorage.getItem('cal_recurring');
    const todos = localStorage.getItem('cal_todos');
    const events = localStorage.getItem('cal_events');
    const acc = localStorage.getItem('cal_accent');
    if (r) state.reminders = JSON.parse(r);
    if (rec) state.recurring = JSON.parse(rec);
    if (todos) state.todos = JSON.parse(todos);
    if (events) state.events = JSON.parse(events);
    if (acc) state.accent = acc;
  } catch(e) {}
}

// ── Accent toggle ────────────────────────────────────
function applyAccent() {
  if (state.accent === 'teal') {
    document.body.classList.add('accent-teal');
  } else {
    document.body.classList.remove('accent-teal');
  }
}

$('accent-toggle').addEventListener('click', () => {
  state.accent = state.accent === 'amber' ? 'teal' : 'amber';
  applyAccent();
  save();
  showToast(state.accent === 'teal' ? 'Switched to soft teal' : 'Switched to warm amber');
});

// ── Notification panel ───────────────────────────────
function getNotificationPermissionLabel() {
  if (!('Notification' in window)) return 'Notifications are not supported in this browser';
  if (Notification.permission === 'granted') return 'Device notifications enabled';
  if (Notification.permission === 'denied') return 'Device notifications blocked by browser settings';
  return 'Enable device notifications for timed reminders';
}

function getNotificationItems() {
  const today = new Date(state.today);
  today.setHours(0, 0, 0, 0);

  const dated = Object.entries(state.reminders)
    .flatMap(([key, items]) => items.map(item => ({ ...item, key, recurring: false })))
    .filter(item => new Date(`${item.key}T00:00:00`) >= today)
    .sort((a, b) => {
      const dateDiff = a.key.localeCompare(b.key);
      if (dateDiff !== 0) return dateDiff;
      return (a.time || '99:99').localeCompare(b.time || '99:99');
    });

  const recurring = state.recurring.map(item => ({ ...item, key: 'Daily', recurring: true }));
  return [...recurring, ...dated].slice(0, 30);
}

function formatNotificationDate(key, recurring) {
  if (recurring) return 'Daily';
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function renderNotificationPanel() {
  $('notification-status').textContent = getNotificationPermissionLabel();
  $('notification-enable').classList.toggle(
    'hidden',
    !('Notification' in window) || Notification.permission === 'granted'
  );

  const list = $('notification-list');
  const items = getNotificationItems();
  list.innerHTML = '';

  if (items.length === 0) {
    list.innerHTML = '<div class="notification-empty">No reminders scheduled.</div>';
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'notification-item';

    const dot = document.createElement('div');
    dot.className = `notification-dot ${item.cat || 'none'}`;

    const content = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'notification-title';
    title.textContent = item.text;

    const meta = document.createElement('div');
    meta.className = 'notification-time';
    const when = formatNotificationDate(item.key, item.recurring);
    meta.textContent = item.time ? `${when} at ${formatTime(item.time)}` : when;

    content.appendChild(title);
    content.appendChild(meta);
    row.appendChild(dot);
    row.appendChild(content);
    list.appendChild(row);
  });
}

$('notification-toggle').addEventListener('click', (e) => {
  e.stopPropagation();
  const panel = $('notification-panel');
  const isOpen = panel.classList.toggle('open');
  panel.setAttribute('aria-hidden', String(!isOpen));
  $('notification-toggle').classList.toggle('active', isOpen);
  $('notification-toggle').setAttribute('aria-expanded', String(isOpen));
  renderNotificationPanel();
});

$('notification-enable').addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!('Notification' in window)) {
    showToast('Device notifications are not supported here');
    renderNotificationPanel();
    return;
  }

  const permission = await Notification.requestPermission();
  renderNotificationPanel();
  scheduleNotifications();
  showToast(permission === 'granted' ? 'Device notifications enabled' : 'Notification permission not enabled');
});

// ── Today panel tabs and to-dos ──────────────────────
function setTodayPanelTab(view) {
  document.querySelectorAll('.today-tab').forEach(option => {
    const isActive = option.dataset.panelTab === view;
    option.classList.toggle('active', isActive);
    option.setAttribute('aria-selected', String(isActive));
  });

  document.querySelectorAll('.today-panel-view').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panelView === view);
  });
}

document.querySelectorAll('.today-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    setTodayPanelTab(tab.dataset.panelTab);
  });
});

$('todo-add-toggle').addEventListener('click', () => {
  const form = $('todo-add-form');
  const isOpen = form.classList.toggle('open');
  form.setAttribute('aria-hidden', String(!isOpen));
  $('todo-add-toggle').classList.toggle('active', isOpen);
  $('todo-add-toggle').setAttribute('aria-expanded', String(isOpen));
  if (isOpen) $('todo-input').focus();
});

function addTodo() {
  const text = $('todo-input').value.trim();
  if (!text) {
    $('todo-input').style.borderColor = '#ef4444';
    setTimeout(() => $('todo-input').style.borderColor = '', 800);
    return;
  }

  state.todos.unshift({ id: uid(), text, done: false });
  $('todo-input').value = '';
  save();
  renderTodos();
  setTodayPanelTab('todos');
  showToast('To-do added');
}

$('todo-save').addEventListener('click', addTodo);

$('todo-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addTodo();
});

document.addEventListener('click', (e) => {
  const panel = $('notification-panel');
  if (!panel.classList.contains('open')) return;
  if (panel.contains(e.target) || $('notification-toggle').contains(e.target)) return;

  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  $('notification-toggle').classList.remove('active');
  $('notification-toggle').setAttribute('aria-expanded', 'false');
});

// ── Calendar image reveal ────────────────────────────
const calendarMain = document.querySelector('.calendar-main');

calendarMain.addEventListener('mousemove', (e) => {
  const rect = calendarMain.getBoundingClientRect();
  calendarMain.style.setProperty('--calendar-reveal-x', `${e.clientX - rect.left}px`);
  calendarMain.style.setProperty('--calendar-reveal-y', `${e.clientY - rect.top}px`);
  calendarMain.classList.add('revealing-image');
});

calendarMain.addEventListener('mouseleave', () => {
  calendarMain.classList.remove('revealing-image');
});

// ── Today Panel ──────────────────────────────────────
function renderTodayPanel() {
  const t = state.today;
  $('today-day').textContent  = t.getDate();
  $('today-full').textContent = `${DAYS[t.getDay()]}, ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;

  const key = dateKey(t);
  const items = state.reminders[key] || [];

  // today's one-off reminders
  const container = $('today-tasks');
  if (items.length === 0) {
    container.innerHTML = '<div class="empty-today">Nothing scheduled — enjoy the calm.</div>';
  } else {
    container.innerHTML = '';
    items.forEach(r => container.appendChild(buildTaskItem(r, key, false)));
  }

  // recurring
  const recContainer = $('recurring-tasks');
  if (state.recurring.length === 0) {
    recContainer.innerHTML = '<div class="empty-today">No recurring reminders.</div>';
  } else {
    recContainer.innerHTML = '';
    state.recurring.forEach(r => recContainer.appendChild(buildTaskItem(r, null, true)));
  }

  renderTodos();
}

function renderTodos() {
  const list = $('todo-list');
  list.innerHTML = '';

  if (state.todos.length === 0) {
    list.innerHTML = '<div class="empty-today">No to-do items yet.</div>';
    return;
  }

  state.todos.forEach(todo => list.appendChild(buildTodoItem(todo)));
}

function buildTodoItem(todo) {
  const div = document.createElement('div');
  div.className = `task-item${todo.done ? ' done' : ''}`;
  div.setAttribute('data-id', todo.id);

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.className = 'todo-check';
  check.checked = todo.done;
  check.addEventListener('change', () => {
    todo.done = check.checked;
    save();
    renderTodos();
  });

  const content = document.createElement('div');
  content.className = 'task-content';

  const text = document.createElement('div');
  text.className = 'task-text';
  text.title = todo.text;
  text.textContent = todo.text;

  if (todo.date) {
    const meta = document.createElement('div');
    meta.className = 'task-time';
    meta.textContent = formatNotificationDate(todo.date, false);
    content.appendChild(text);
    content.appendChild(meta);
  } else {
    content.appendChild(text);
  }

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.title = 'Delete';
  del.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  del.addEventListener('click', () => {
    state.todos = state.todos.filter(item => item.id !== todo.id);
    save();
    renderTodos();
    showToast('To-do removed');
  });

  div.appendChild(check);
  div.appendChild(content);
  div.appendChild(del);
  return div;
}

function buildTaskItem(r, key, isRecurring) {
  const div = document.createElement('div');
  div.className = 'task-item';
  div.setAttribute('data-id', r.id);

  const dot = document.createElement('div');
  dot.className = `task-dot ${r.cat || 'none'}`;

  const content = document.createElement('div');
  content.className = 'task-content';

  const text = document.createElement('div');
  text.className = 'task-text';
  text.title = r.text;
  text.textContent = r.text;

  const meta = document.createElement('div');
  meta.className = 'task-time';

  if (r.time) meta.textContent = formatTime(r.time);
  if (isRecurring) {
    const badge = document.createElement('span');
    badge.className = 'task-recurring-badge';
    badge.textContent = 'daily';
    meta.appendChild(badge);
  }

  content.appendChild(text);
  if (r.time || isRecurring) content.appendChild(meta);

  const del = document.createElement('button');
  del.className = 'task-delete';
  del.title = 'Delete';
  del.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 3L3 11M3 3l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    div.style.transform = 'translateX(8px)';
    div.style.opacity = '0';
    div.style.transition = 'all 0.2s ease';
    setTimeout(() => {
      if (isRecurring) {
        state.recurring = state.recurring.filter(x => x.id !== r.id);
      } else {
        state.reminders[key] = (state.reminders[key] || []).filter(x => x.id !== r.id);
        if (state.reminders[key].length === 0) delete state.reminders[key];
      }
      save();
      scheduleNotifications();
      renderAll();
      showToast('Reminder removed');
    }, 200);
  });

  div.appendChild(dot);
  div.appendChild(content);
  div.appendChild(del);
  return div;
}

// ── Calendar Grid ────────────────────────────────────
function renderCalendar() {
  const v = state.viewing;
  $('cal-month').textContent = MONTHS[v.getMonth()];
  $('cal-year').textContent  = v.getFullYear();

  const grid = $('cal-grid');
  grid.innerHTML = '';

  const year  = v.getFullYear();
  const month = v.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const todayKey = dateKey(state.today);

  let cellIndex = 0;

  // Previous month overflow
  for (let i = firstDay - 1; i >= 0; i--) {
    const cell = buildCell(prevMonthDays - i, true, false);
    cell.style.animationDelay = `${cellIndex * 12}ms`;
    grid.appendChild(cell);
    cellIndex++;
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    const key  = dateKey(date);
    const isToday   = key === todayKey;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    const cell = buildCell(d, false, isToday, isWeekend, key, date);
    cell.style.animationDelay = `${cellIndex * 12}ms`;
    grid.appendChild(cell);
    cellIndex++;
  }

  // Next month fill
  const total = Math.ceil((firstDay + daysInMonth) / 7) * 7;
  let next = 1;
  while (cellIndex < total) {
    const cell = buildCell(next++, true, false);
    cell.style.animationDelay = `${cellIndex * 12}ms`;
    grid.appendChild(cell);
    cellIndex++;
  }

  const today = document.querySelector('.cal-cell.today');
  if (today) {
    today.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

let monthTransitionTimer = null;

function changeMonth(offset) {
  const calendar = document.querySelector('.calendar-main');
  if (monthTransitionTimer) clearTimeout(monthTransitionTimer);

  calendar.classList.remove('month-revealing');
  calendar.classList.add('month-dissolving');

  monthTransitionTimer = setTimeout(() => {
    state.viewing = new Date(state.viewing.getFullYear(), state.viewing.getMonth() + offset, 1);
    renderCalendar();
    attachCellCursorGlow();

    calendar.classList.remove('month-dissolving');
    calendar.classList.add('month-revealing');

    monthTransitionTimer = setTimeout(() => {
      calendar.classList.remove('month-revealing');
      monthTransitionTimer = null;
    }, 360);
  }, 220);
}

function buildCell(day, otherMonth, isToday, isWeekend, key, date) {
  const cell = document.createElement('div');
  cell.className = 'cal-cell' +
    (otherMonth ? ' other-month' : '') +
    (isToday    ? ' today'       : '') +
    (isWeekend  ? ' weekend'     : '');
  cell.setAttribute('role', 'gridcell');
  cell.setAttribute('aria-label', date ? `${MONTHS[date.getMonth()]} ${day}` : String(day));

  const num = document.createElement('div');
  num.className = 'cell-num';
  num.textContent = day;
  cell.appendChild(num);

  if (!otherMonth && key) {
    const reminders = state.reminders[key] || [];
    const recurring  = state.recurring;
    const dayEvents = getEventsForDate(key);

    const allDots = [...reminders, ...recurring];
    if (dayEvents.length > 0) {
      const barsWrap = document.createElement('div');
      barsWrap.className = 'event-bars';
      dayEvents.slice(0, 2).forEach(event => {
        const bar = document.createElement('div');
        const starts = key === event.start;
        const ends = key === event.end;
        const showTitle = starts || date.getDay() === 0;
        bar.className = 'event-bar' +
          (starts ? ' starts' : ' continues') +
          (ends ? ' ends' : '');
        bar.textContent = showTitle ? event.text : '';
        bar.title = `${event.text}: ${formatNotificationDate(event.start, false)} - ${formatNotificationDate(event.end, false)}`;
        barsWrap.appendChild(bar);
      });
      if (dayEvents.length > 2) {
        const more = document.createElement('div');
        more.className = 'event-more';
        more.textContent = `+${dayEvents.length - 2} more`;
        barsWrap.appendChild(more);
      }
      cell.appendChild(barsWrap);
    } else if (allDots.length > 0) {
      const dotsWrap = document.createElement('div');
      dotsWrap.className = 'cell-dots';
      const shown = allDots.slice(0, 5);
      shown.forEach(r => {
        const dot = document.createElement('div');
        dot.className = `cell-dot ${r.cat || 'none'}`;
        dotsWrap.appendChild(dot);
      });
      if (allDots.length > 5) {
        const more = document.createElement('div');
        more.className = 'cell-dot more';
        dotsWrap.appendChild(more);
      }
      cell.appendChild(dotsWrap);
    }

    cell.addEventListener('click', () => openModal(date, key));
  }

  return cell;
}

function getEventsForDate(key) {
  return state.events
    .filter(event => key >= event.start && key <= event.end)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}

// ── Modal ────────────────────────────────────────────
let selectedCat = null;
let modalEntryType = 'reminder';

function setModalEntryType(type) {
  modalEntryType = type;
  const isTodo = type === 'todo';
  const isEvent = type === 'event';

  $('modal').classList.toggle('todo-mode', isTodo);
  $('modal').classList.toggle('event-mode', isEvent);
  $('modal-title').textContent = isEvent ? 'Add event' : isTodo ? 'Add to-do' : 'Add reminder';
  $('reminder-text').placeholder = isEvent ? 'Event name' : isTodo ? 'What do you need to do?' : 'What do you need to remember?';
  $('btn-save').textContent = isEvent ? 'Save event' : isTodo ? 'Save to-do' : 'Save reminder';

  document.querySelectorAll('.modal-type-tab').forEach(tab => {
    const isActive = tab.dataset.entryType === type;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', String(isActive));
  });
}

function openModal(date, key) {
  state.selectedDate = { date, key };

  const label = `${DAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
  $('modal-date-label').textContent = label;
  setModalEntryType('reminder');

  $('reminder-text').value = '';
  $('reminder-time').value = '';
  $('event-start').value = key;
  $('event-end').value = key;
  $('recurring-toggle').checked = false;
  $('recurring-label').textContent = 'Off';
  $('recurring-label').classList.remove('on');
  selectedCat = null;

  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));

  const overlay = $('modal-overlay');
  overlay.classList.add('open');
  setTimeout(() => $('reminder-text').focus(), 50);
}

function closeModal() {
  $('modal-overlay').classList.remove('open');
}

function saveReminder() {
  const text = $('reminder-text').value.trim();
  if (!text) {
    $('reminder-text').focus();
    $('reminder-text').style.borderColor = '#ef4444';
    setTimeout(() => $('reminder-text').style.borderColor = '', 800);
    return;
  }

  if (modalEntryType === 'todo') {
    state.todos.unshift({ id: uid(), text, done: false, date: state.selectedDate.key });
    save();
    closeModal();
    renderAll();
    setTodayPanelTab('todos');
    showToast('To-do added');
    return;
  }

  if (modalEntryType === 'event') {
    const start = $('event-start').value;
    const end = $('event-end').value;
    if (!start || !end || end < start) {
      $('event-end').focus();
      $('event-end').style.borderColor = '#ef4444';
      setTimeout(() => $('event-end').style.borderColor = '', 800);
      return;
    }

    state.events.push({ id: uid(), text, start, end });
    save();
    closeModal();
    renderAll();
    showToast(start === end ? 'Event saved' : 'Multi-day event saved');
    return;
  }

  const time      = $('reminder-time').value;
  const recurring = $('recurring-toggle').checked;
  const id = uid();
  const entry = { id, text, cat: selectedCat, time };

  if (recurring) {
    state.recurring.push(entry);
  } else {
    const key = state.selectedDate.key;
    if (!state.reminders[key]) state.reminders[key] = [];
    state.reminders[key].push(entry);
  }

  save();
  closeModal();
  renderAll();
  scheduleNotifications();
  showToast(recurring ? 'Recurring reminder saved' : 'Reminder saved');
}

// Category pills
document.querySelectorAll('.cat-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    if (selectedCat === btn.dataset.cat) {
      selectedCat = null;
    } else {
      selectedCat = btn.dataset.cat;
      btn.classList.add('active');
    }
  });
});

document.querySelectorAll('.modal-type-tab').forEach(tab => {
  tab.addEventListener('click', () => setModalEntryType(tab.dataset.entryType));
});

// Recurring toggle
$('recurring-toggle').addEventListener('change', function() {
  const label = $('recurring-label');
  if (this.checked) {
    label.textContent = 'On — every day';
    label.classList.add('on');
  } else {
    label.textContent = 'Off';
    label.classList.remove('on');
  }
});

$('modal-close').addEventListener('click', closeModal);
$('btn-cancel').addEventListener('click', closeModal);
$('btn-save').addEventListener('click', saveReminder);

$('modal-overlay').addEventListener('click', (e) => {
  if (e.target === $('modal-overlay')) closeModal();
});

$('reminder-text').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveReminder();
  if (e.key === 'Escape') closeModal();
});

// ── Navigation ───────────────────────────────────────
$('prev-btn').addEventListener('click', () => {
  changeMonth(-1);
});
$('next-btn').addEventListener('click', () => {
  changeMonth(1);
});

// ── Mobile view switch ───────────────────────────────
document.querySelectorAll('.mobile-view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const app = $('app');
    const view = btn.dataset.mobileView;

    app.classList.toggle('mobile-show-calendar', view === 'calendar');
    app.classList.toggle('mobile-show-today', view === 'today');

    document.querySelectorAll('.mobile-view-btn').forEach(option => {
      const isActive = option === btn;
      option.classList.toggle('active', isActive);
      option.setAttribute('aria-pressed', String(isActive));
    });
  });
});

// ── Notifications ────────────────────────────────────
let notificationTimers = [];

function scheduleNotifications() {
  notificationTimers.forEach(timer => clearTimeout(timer));
  notificationTimers = [];

  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const todayKey = dateKey(state.today);
  const todayReminders = state.reminders[todayKey] || [];
  const allToday = [...todayReminders, ...state.recurring];

  allToday.forEach(r => {
    if (!r.time) return;
    const [h, m] = r.time.split(':').map(Number);
    const fireAt = new Date(state.today);
    fireAt.setHours(h, m, 0, 0);
    const ms = fireAt - Date.now();
    if (ms > 0 && ms < 86400000) {
      const timer = setTimeout(() => {
        triggerNotification(r);
      }, ms);
      notificationTimers.push(timer);
    }
  });
}

function triggerNotification(r) {
  // Browser push
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Reminder', {
      body: r.text,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="%23f59e0b"/></svg>',
    });
  }
  // In-page toast
  showToast(`⏰ ${r.text}`);
}

// ── Toast ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

// ── Render All ────────────────────────────────────────
function attachCellCursorGlow() {
  const cells = document.querySelectorAll('.cal-cell');
  cells.forEach(cell => {
    // If some cells are disabled (other-month), they won't have listeners.
    if (cell.classList.contains('other-month')) return;

    cell.addEventListener('mouseenter', () => {
      cell.classList.add('is-glowing');
    });

    cell.addEventListener('mouseleave', () => {
      cell.classList.remove('is-glowing');
    });

    cell.addEventListener('mousemove', (e) => {
      const r = cell.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      cell.style.setProperty('--mx', `${x}px`);
      cell.style.setProperty('--my', `${y}px`);
    });
  });
}

function renderAll() {
  renderTodayPanel();
  renderCalendar();
  renderNotificationPanel();
  attachCellCursorGlow();
}


// ── Init ──────────────────────────────────────────────
load();
applyAccent();
renderAll();
scheduleNotifications();
