// App bootstrap, shared utilities, and remaining actions

// =========================
    // Config / constants
    // =========================
    
// =========================
    // Global app state
    // =========================
    
let fileSeedIndex = 0;

    // =========================
    // App bootstrap
    // =========================
    async function init() {
      await initAuth();
      await ensureProfile();
      await ensureMembershipOrShowOnboarding();
      // Subscribe after membership/group is known; helper guards against duplicates.
      await ensureGroupRealtimeSubscription();
      await loadTasks();
      await loadAlerts();
      await loadMessages();
      await loadResources();
      await loadAvailabilityBlocks();
      updateHeaderGroupTag();

      renderAvatars();
      populateMemberSelects();
      populateResourceTypeFilter();

      seedInitialData();
      renderSchedule();
      refreshAll();

      document.addEventListener('click', function (e) {
        const plusWrap = document.querySelector('.plus-menu-wrap');
        if (plusWrap && !plusWrap.contains(e.target)) {
          document.getElementById('plusMenu').classList.remove('open');
        }
      });
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

    function uploadResourceSeed(senderId, name, icon, type, timeLabel) {
      state.resources.push({
        id: Date.now() + Math.floor(Math.random() * 1000),
        senderId,
        name,
        icon,
        type,
        size: randomDemoSize(),
        time: timeLabel,
      });
      state.contributions[senderId].filesUploaded += 1;
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
      return new Date(a.dueDate) - new Date(b.dueDate);
    }

    function formatTime(date) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function formatDateLabel(dateStr) {
      const date = new Date(dateStr + 'T00:00:00');
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
      const due = new Date(dateStr + 'T00:00:00');
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diff = Math.ceil((due - today) / (1000 * 60 * 60 * 24));

      if (diff <= 0) return 'Due today';
      if (diff === 1) return 'Due in 1 day';
      return `Due in ${diff} days`;
    }

    function randomDemoSize() {
      const value = Math.random() * 3.8 + 0.2;
      return value < 1 ? `${Math.round(value * 1024)}KB` : `${value.toFixed(1)}MB`;
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
