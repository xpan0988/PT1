// App bootstrap, shared utilities, and remaining actions

// =========================
    // Config / constants
    // =========================
    
// =========================
    // Global app state
    // =========================
    
    // =========================
    // App bootstrap
    // =========================
    async function runStartupPhase(label, work) {
      const timerLabel = `[startup] ${label}`;
      console.time(timerLabel);
      try {
        return await work();
      } finally {
        console.timeEnd(timerLabel);
      }
    }

    async function hydrateCurrentGroupData() {
      if (!state.currentGroup) return;

      // Member data is a dependency for mapping user ids in the datasets below.
      await runStartupPhase('loadMembers', loadMembers);

      // These loaders are independent once members are ready.
      await Promise.all([
        runStartupPhase('loadTasks', loadTasks),
        runStartupPhase('loadAlerts', loadAlerts),
        runStartupPhase('loadResources', loadResources),
        runStartupPhase('loadAvailabilityBlocks', loadAvailabilityBlocks),
      ]);

      // Messages include synthetic alert messages, so load after alerts complete.
      await runStartupPhase('loadMessages', loadMessages);
    }

    function renderInitialVisibleSurfaces() {
      renderAvatars();
      populateMemberSelects();
      refreshAll();
    }

    async function init() {
      // Note: run StudyMesh from a local HTTP server (for example http://localhost),
      // not from file://, so browser auth/storage APIs can work correctly.
      document.addEventListener('click', function (e) {
        const plusWrap = document.querySelector('.plus-menu-wrap');
        if (plusWrap && !plusWrap.contains(e.target)) {
          document.getElementById('plusMenu').classList.remove('open');
        }
      });

      console.time('[startup] total');
      await runStartupPhase('initAuth', initAuth);
      await runStartupPhase('ensureProfile', ensureProfile);
      const hasMembership = await runStartupPhase('membership resolution', ensureMembershipOrShowOnboarding);
      if (!hasMembership) {
        console.timeEnd('[startup] total');
        return;
      }

      state.isHydratingInitialData = true;
      try {
        await runStartupPhase('group hydration', hydrateCurrentGroupData);
        updateHeaderGroupTag();
        seedInitialData();
        await runStartupPhase('initial render block', async () => renderInitialVisibleSurfaces());

        // Subscribe once after initial hydration to avoid overlap with startup loads.
        await runStartupPhase('subscription setup', ensureGroupRealtimeSubscription);
      } finally {
        state.isHydratingInitialData = false;
      }

      await flushPendingRealtimeTables();
      console.timeEnd('[startup] total');
    }



    async function ensureGroupRealtimeSubscription() {
      if (!state.currentGroup?.id || !state.currentMembership) return;
      await subscribeToGroupRealtime(state.currentGroup.id);
    }

    // =========================
    // Auth / profile / group flow
    // =========================

    // =========================
    // Supabase data loading
    // =========================

    // =========================
    // Timetable interactions
    // =========================

    // =========================
    // Onboarding / group membership flow
    // =========================

    // =========================
    // UI helpers / shared rendering helpers
    // =========================

    function seedInitialData() {
      if (state.members.length === 0 || state.tasks.length > 0 || state.resources.length > 0 || state.messages.length > 0 || state.alerts.length > 0) {
        return;
      }

      const memberCount = state.members.length;
      const safeMember = (index) => index % memberCount;

      addTaskSeed('Create low-fi dashboard sketches', safeMember(0), 'High', offsetDate(1), true);

      if (memberCount >= 2) {
        addTaskSeed('Prepare tutorial demo notes', safeMember(1), 'High', offsetDate(4), false);
      }
      if (memberCount >= 3) {
        addTaskSeed('Refine interview question wording', safeMember(2), 'Medium', offsetDate(2), false);
      }
      if (memberCount >= 4) {
        addTaskSeed('Review final report structure', safeMember(3), 'Low', offsetDate(6), false);
      }

      
    }

    function switchView(view) {
      state.currentView = view;
      document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
      });
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      document.getElementById('view-' + view).classList.add('active');
      if (view === 'timetable') {
        renderSchedule();
        state.hasRenderedSchedule = true;
      }
    }

    // =========================
    // Chat / alert / resource actions
    // =========================

    // =========================
    // Task actions
    // =========================

    async function deleteTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;
      if (!canEditTask(task)) {
        showToast('You can only delete tasks you created', 'alert');
        return;
      }

      const { error } = await supabaseClient
        .from('tasks')
        .delete()
        .eq('id', taskId);

      if (error) {
        console.error('deleteTask failed', error);
        showToast('Failed to delete task', 'alert');
        return;
      }

      if (state.editingTaskId === taskId) {
        resetTaskForm();
      }

      await loadTasks();
      refreshAll();
      showToast(`Task deleted: ${task.title}`, 'task');
    }

    function addChatMessage(senderId, text, timeLabel) {
      state.messages.push({
        id: Date.now() + Math.random(),
        type: 'text',
        senderId,
        text,
        time: timeLabel || formatTime(new Date()),
      });
    }

    function getCurrentMemberIndex() {
      return state.memberIndexByDbId.get(state.currentUser?.id) ?? -1;
    }

    function addTaskSeed(title, assigneeId, priority, dueDate, completed) {
      const task = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        title,
        assigneeId,
        priority,
        dueDate,
        completed,
        createdAt: new Date().toISOString(),
        completedAt: completed ? new Date().toISOString() : null,
      };

      state.tasks.push(task);
      if (completed) state.contributions[assigneeId].tasksCompleted += 1;
    }

    function createAlertSeed(senderId, text, timeLabel, acknowledgedBy) {
      const alertId = Date.now() + Math.floor(Math.random() * 1000);

      state.alerts.push({
        id: alertId,
        senderId,
        text,
        time: timeLabel,
        createdAt: new Date().toISOString(),
        acknowledgedBy: [...new Set([senderId, ...acknowledgedBy])],
      });

      state.messages.push({
        id: 'alert-' + alertId,
        type: 'alert',
        senderId,
        text,
        time: timeLabel,
        alertId,
      });

      return alertId;
    }

    function acknowledgeAlertSeed(alertId, memberId) {
      const alert = state.alerts.find(a => a.id === alertId);
      if (alert && !alert.acknowledgedBy.includes(memberId)) {
        alert.acknowledgedBy.push(memberId);
      }
    }

    function sortByDueDateAsc(a, b) {
      return parseDateInputToDate(a.dueDate) - parseDateInputToDate(b.dueDate);
    }

    function formatTime(date) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateLabel(dateStr) {
      const date = parseDateInputToDate(dateStr);
      if (Number.isNaN(date.getTime())) return 'Invalid date';
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    function formatHourRange(startHour, endHour) {
      const pad = (value) => String(value).padStart(2, '0');
      const normalizedEnd = endHour === 24 ? '24:00' : `${pad(endHour)}:00`;
      return `${pad(startHour)}:00–${normalizedEnd}`;
    }

    function offsetDate(days) {
      const date = new Date();
      date.setDate(date.getDate() + days);
      return date.toISOString().slice(0, 10);
    }

    function daysUntilText(dateStr) {
      const now = new Date();
      const due = parseDateInputToDate(dateStr);
      if (Number.isNaN(due.getTime())) return 'Due date unavailable';
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

      if (diff <= 0) return 'Due today';
      if (diff === 1) return 'Due in 1 day';
      return `Due in ${diff} days`;
    }

    function isValidDueDateInput(dateStr) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ''))) return false;
      const date = parseDateInputToDate(dateStr);
      return !Number.isNaN(date.getTime()) && toIsoDateInput(date) === dateStr;
    }

    function parseDateInputToDate(dateStr) {
      const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!match) return new Date('invalid');
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);
      return new Date(year, monthIndex, day);
    }

    function toIsoDateInput(date) {
      if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    function formatFileSize(bytes) {
      const mb = bytes / 1024 / 1024;
      return mb < 1 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${mb.toFixed(1)}MB`;
    }

    function getFileIcon(ext) {
      const map = {
        pdf: '📄',
        doc: '📝',
        docx: '📝',
        txt: '📃',
        xls: '📋',
        xlsx: '📋',
        png: '🖼️',
        jpg: '🖼️',
        jpeg: '🖼️',
        fig: '🎨',
        csv: '📊',
        html: '🌐',
        css: '🎨',
        js: '💛'
      };
      return map[ext] || '📎';
    }

    function escHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function showToast(message, type = 'chat') {
      const wrap = document.getElementById('toastContainer');
      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      toast.textContent = message;
      wrap.appendChild(toast);
      setTimeout(() => toast.remove(), 3200);
    }

    init();
