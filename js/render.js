// Rendering and DOM update helpers

    function updateHeaderGroupTag() {
      const tag = document.getElementById('headerGroupTag');
      if (!tag) return;

      if (state.currentGroup) {
        tag.textContent = state.currentGroup.name;
        return;
      }

      tag.textContent = 'Student Group Board';
    }


    function renderAvatars() {
      const el = document.getElementById('memberAvatars');
      if (state.members.length === 0) {
        el.innerHTML = '';
        return;
      }

      el.innerHTML = state.members.map(m =>
        `<div class="avatar" style="background:${m.color}" title="${m.name}">${m.initials}</div>`
      ).join('');
    }


    function populateMemberSelects() {
      const chatSelect = document.getElementById('chatSender');
      const taskSelect = document.getElementById('taskAssignee');

      if (state.members.length === 0) {
        chatSelect.innerHTML = '';
        taskSelect.innerHTML = '';
        return;
      }

      const options = state.members.map(m => `<option value="${m.id}" ${m.dbId === state.currentUser?.id ? 'selected' : ''}>${m.name}</option>`).join('');
      chatSelect.innerHTML = options;
      taskSelect.innerHTML = options;
    }


    function refreshAll() {
      recalculateContributions();
      renderChatMessages();
      renderAlerts();
      renderTasks();
      renderCompletedTasks();
      renderResources();
      populateResourceTypeFilter();
      renderNearestDue();
      renderProgress();
      updateStatusChips();
    }


    function recalculateContributions() {
      state.contributions = state.members.map(member => {
        const tasksCompleted = state.tasks.filter(task =>
          task.completed && state.members[task.assigneeId]?.dbId === member.dbId
        ).length;

        const filesUploaded = state.resources.filter(resource =>
          state.members[resource.senderId]?.dbId === member.dbId
        ).length;

        return {
          tasksCompleted,
          filesUploaded
        };
      });
    }


    function renderChatMessages() {
      const wrap = document.getElementById('chatMessages');
      if (state.messages.length === 0) {
        wrap.innerHTML = `<div class="empty-state"><div class="emo">💬</div>No messages yet</div>`;
        return;
      }

      const currentSenderId = parseInt(document.getElementById('chatSender').value || '0', 10);

      wrap.innerHTML = state.messages.map(msg => {
        const member = state.members[msg.senderId];
        if (!member) return '';

        if (msg.type === 'alert') {
          const alert = state.alerts.find(a => a.id === msg.alertId);
          const hasRead = alert ? alert.acknowledgedBy.includes(currentSenderId) : true;
          const pendingCount = alert ? state.members.length - alert.acknowledgedBy.length : 0;
          return `
            <div class="msg alert">
              <div class="msg-avatar" style="background:${member.color}">${member.initials}</div>
              <div class="msg-body">
                <div class="msg-meta">
                  <span class="msg-name" style="color:${member.color}">${member.name}</span>
                  <span class="msg-time">${msg.time}</span>
                </div>
                <div class="msg-text">
                  ${escHtml(msg.text)}
                  <div class="msg-alert-meta">
                    <span class="alert-inline-badge">ALERT</span>
                    <span class="meta-pill">${alert ? alert.acknowledgedBy.length : 0}/${state.members.length} read</span>
                    <span class="meta-pill">${pendingCount} pending</span>
                    <button class="ack-btn" onclick="acknowledgeAlert('${msg.alertId}', ${currentSenderId})" ${hasRead ? 'disabled' : ''}>
                      ${hasRead ? 'Acknowledged' : 'Mark as Read'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `;
        }

        if (msg.type === 'file') {
          return `
            <div class="msg file">
              <div class="msg-avatar" style="background:${member.color}">${member.initials}</div>
              <div class="msg-body">
                <div class="msg-meta">
                  <span class="msg-name" style="color:${member.color}">${member.name}</span>
                  <span class="msg-time">${msg.time}</span>
                </div>
                <div class="msg-text">📁 ${escHtml(msg.text)}</div>
              </div>
            </div>
          `;
        }

        return `
          <div class="msg">
            <div class="msg-avatar" style="background:${member.color}">${member.initials}</div>
            <div class="msg-body">
              <div class="msg-meta">
                <span class="msg-name" style="color:${member.color}">${member.name}</span>
                <span class="msg-time">${msg.time}</span>
              </div>
              <div class="msg-text">${escHtml(msg.text)}</div>
            </div>
          </div>
        `;
      }).join('');

      wrap.scrollTop = wrap.scrollHeight;
    }


    function renderAlerts() {
      const activeAlerts = getDisplayAlerts();
      const scroller = document.getElementById('alertsScroller');

      if (activeAlerts.length === 0) {
        scroller.innerHTML = `<div class="empty-state"><div class="emo">🔕</div>No active alerts</div>`;
      } else {
        scroller.innerHTML = activeAlerts.map(alert => {
          const member = state.members[alert.senderId];
          if (!member) return '';
          return `
            <div class="alert-item">
              <div class="alert-top">
                <div class="alert-badge">🚨 Alert Notice</div>
                <div class="alert-meta">${member.name}<br>${alert.time}</div>
              </div>
              <div class="alert-text">${escHtml(alert.text)}</div>
              <div class="ack-list">
                ${state.members.map(m => `<span class="ack-pill ${alert.acknowledgedBy.includes(m.id) ? 'read' : ''}">${m.initials}</span>`).join('')}
              </div>
              <div class="alert-footer">${alert.acknowledgedBy.length}/${state.members.length} members have acknowledged this alert.</div>
            </div>
          `;
        }).join('');
      }

      document.getElementById('alertSummaryChip').textContent = `${activeAlerts.length} active alerts`;
    }


    function renderTasks() {
      const inProgress = state.tasks.filter(t => !t.completed).sort(sortByDueDateAsc);
      renderTaskList('inProgressTasks', inProgress, false);
    }


    function renderCompletedTasks() {
      const completed = state.tasks.filter(t => t.completed).sort(sortByDueDateAsc);
      renderTaskList('completedTasks', completed, true);
    }


    function renderTaskList(targetId, items, showCompletedStatus) {
      const el = document.getElementById(targetId);

      if (items.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="emo">📝</div>No tasks to show</div>`;
        return;
      }

      el.innerHTML = items.map(task => {
        const member = state.members[task.assigneeId];
        if (!member) return '';
        const statusLabel = task.completed ? 'Completed' : 'In Progress';
        const priority = task.priority || 'Medium';
        const priorityClass = `priority-${priority.toLowerCase()}`;

        return `
          <div class="task-item ${task.completed ? 'done' : ''}">
            <div class="task-main">
              <div class="task-title">${escHtml(task.title)}</div>
              <div class="task-meta">
                <span class="meta-pill assignee-pill" style="background:${member.color}">${member.name}</span>
                <span class="meta-pill priority-pill ${priorityClass}">${priority} Priority</span>
                <span class="meta-pill">Due ${formatDateLabel(task.dueDate)}</span>
                ${showCompletedStatus ? `<span class="meta-pill">${statusLabel}</span>` : ''}
              </div>
            </div>
            <div class="task-actions">
              <div class="task-status ${task.completed ? 'done' : 'pending'}">${statusLabel}</div>
              <div class="task-actions-row">
                ${task.completed
                  ? `<button class="btn btn-secondary btn-small" disabled>Done</button>`
                  : `<button class="btn btn-primary btn-small" onclick="completeTask('${task.id}')">Mark Complete</button>`
                }
                <button class="btn btn-secondary btn-small" onclick="editTask('${task.id}')">Edit</button>
                <button class="btn btn-danger btn-small" onclick="deleteTask('${task.id}')">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }


    function renderSchedule() {
      const grid = document.getElementById('scheduleGrid');

      grid.innerHTML = SCHEDULE_DAYS.map(day => {
        const sectionHtml = SCHEDULE_SECTIONS.map(section => {
          const open = isScheduleSectionOpen(day.weekday, section.key);

          const sectionMembers = state.availabilityBlocks
            .filter(block => block.weekday === day.weekday && section.hours.includes(block.start_hour))
            .map(block => state.members.find(member => member.dbId === block.user_id))
            .filter(Boolean);

          const uniqueMembers = Array.from(new Map(sectionMembers.map(member => [member.dbId, member])).values());

          const blocksHtml = section.hours.map(startHour => {
            const endHour = startHour + 2;

            const matchingBlocks = state.availabilityBlocks.filter(block =>
              block.weekday === day.weekday && block.start_hour === startHour
            );

            const visibleMembers = matchingBlocks
              .map(block => state.members.find(member => member.dbId === block.user_id))
              .filter(Boolean);

            const selectedByMe = isMyAvailabilityBlockSelected(day.weekday, startHour);

            return `
              <div class="slot-item ${selectedByMe ? 'selected-by-me' : ''}" onclick="toggleAvailabilityBlock(${day.weekday}, ${startHour})">
                <div class="slot-time">${formatHourRange(startHour, endHour)}</div>
                <div class="slot-members">
                  ${visibleMembers.length > 0
                    ? visibleMembers.map(member => `<span class="mini-member" style="background:${member.color}">${member.initials}</span>`).join('')
                    : `<span class="meta-pill">No selection</span>`
                  }
                </div>
              </div>
            `;
          }).join('');

          return `
            <div class="schedule-section ${open ? 'open' : ''}">
              <div class="schedule-section-head" onclick="toggleScheduleSection(${day.weekday}, '${section.key}')">
                <div>
                  <div class="schedule-section-title">${section.label}</div>
                  <div class="schedule-section-summary">${uniqueMembers.length} selected</div>
                </div>
                <div class="schedule-section-arrow">${open ? 'Hide' : 'Show'}</div>
              </div>
              <div class="schedule-section-body">
                ${blocksHtml}
              </div>
            </div>
          `;
        }).join('');

        return `
          <div class="day-column">
            <div class="day-head">
              <div class="day-name">${day.label}</div>
              <div class="day-sub">${day.shortDate}</div>
            </div>
            <div class="slot-list">${sectionHtml}</div>
          </div>
        `;
      }).join('');
    }


         

    function renderResources() {
      const el = document.getElementById('resourceList');
      const typeFilter = document.getElementById('resourceTypeFilter');
      const searchInput = document.getElementById('resourceSearchInput');
      const selectedType = typeFilter ? typeFilter.value : 'all';
      const query = searchInput ? searchInput.value.trim().toLowerCase() : '';

      const filteredResources = state.resources.filter(resource => {
        const matchesType = selectedType === 'all' || resource.type === selectedType;
        const matchesSearch = !query || resource.name.toLowerCase().includes(query);
        return matchesType && matchesSearch;
      });

      if (filteredResources.length === 0) {
        el.innerHTML = `<div class="empty-state"><div class="emo">📂</div>No matching files found</div>`;
        return;
      }

      el.innerHTML = filteredResources.map(resource => {
        const member = state.members[resource.senderId];
        if (!member) return '';
        return `
          <div class="resource-item">
            <div class="resource-main">
              <div class="resource-icon">${resource.icon}</div>
              <div>
                <div class="resource-name">${escHtml(resource.name)}</div>
                <div class="resource-meta">${resource.type} · ${resource.size} · Uploaded at ${resource.time}</div>
              </div>
            </div>
            <div class="resource-by" style="background:${member.color}">${member.name}</div>
          </div>
        `;
      }).join('');
    }


    function renderNearestDue() {
      const wrap = document.getElementById('nearestDueWrap');
      const upcoming = getNearestDueTask();

      if (!upcoming) {
        wrap.innerHTML = `<div class="empty-state"><div class="emo">⏳</div>No unfinished tasks with a due date</div>`;
        return;
      }

      const member = state.members[upcoming.assigneeId];
      if (!member) {
        wrap.innerHTML = `<div class="empty-state"><div class="emo">⏳</div>No member data for the nearest task</div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="due-card">
          <div class="due-left">
            <div class="due-kicker">⚠ Closest Deadline</div>
            <div class="due-title">${escHtml(upcoming.title)}</div>
            <div class="due-meta">
              <span>Due ${formatDateLabel(upcoming.dueDate)}</span>
              <span>${daysUntilText(upcoming.dueDate)}</span>
            </div>
          </div>
          <div class="due-assignee" style="background:${member.color}">${member.name}</div>
        </div>
      `;
    }


    function renderProgress() {
      const overallBar = document.getElementById('overallProgressBar');
      const memberList = document.getElementById('memberProgressList');

      const totals = state.contributions.map(c => (c?.tasksCompleted || 0) + (c?.filesUploaded || 0));
      const totalUnits = totals.reduce((sum, n) => sum + n, 0);
      const completedTasks = state.tasks.filter(t => t.completed).length;
      const uploadedFiles = state.resources.length;
      const projectPercent = totalUnits > 0 ? 100 : 0;

      overallBar.innerHTML = state.members.map((member, i) => {
        const pct = totalUnits > 0 ? (totals[i] / totalUnits) * 100 : 0;
        return `<div class="big-progress-segment" style="width:${pct}%;background:${member.color}"></div>`;
      }).join('');

      memberList.innerHTML = state.members.map((member, i) => {
        const pct = totalUnits > 0 ? Math.round((totals[i] / totalUnits) * 100) : 0;
        return `
          <div class="member-progress-item">
            <div class="member-top">
              <div class="member-dot" style="background:${member.color}"></div>
              <div class="member-name">${member.name}</div>
              <div class="member-percent">${pct}%</div>
            </div>
            <div class="member-mini-bar">
              <div class="member-mini-fill" style="width:${pct}%;background:${member.color}"></div>
            </div>
            <div class="member-stats-row">
              <span class="member-stat-chip">✅ ${(state.contributions[i]?.tasksCompleted) || 0} tasks</span>
              <span class="member-stat-chip">📁 ${(state.contributions[i]?.filesUploaded) || 0} files</span>
            </div>
          </div>
        `;
      }).join('');

      document.getElementById('metricCompleted').textContent = completedTasks;
      document.getElementById('metricFiles').textContent = uploadedFiles;
      document.getElementById('metricUnits').textContent = totalUnits;
      document.getElementById('projectProgressChip').textContent = `${projectPercent}%`;

      const taskButton = document.querySelector('#view-tasks .btn.btn-primary');
      if (taskButton && !state.editingTaskId) {
        taskButton.textContent = 'Add Task';
      }
    }


    function renderSnapshots() {
      const list = document.getElementById('snapshotList');
      const incompleteTasks = state.tasks.filter(t => !t.completed).length;
      const activeAlerts = getDisplayAlerts().length;
      const nearestTask = getNearestDueTask();

      list.innerHTML = `
        <div class="snapshot-item">
          <div class="snapshot-left">
            <div class="snapshot-label">In Progress Tasks</div>
            <div class="snapshot-value">${incompleteTasks}</div>
          </div>
          <div class="snapshot-pill">task board</div>
        </div>

        <div class="snapshot-item">
          <div class="snapshot-left">
            <div class="snapshot-label">Shared Resources</div>
            <div class="snapshot-value">${state.resources.length}</div>
          </div>
          <div class="snapshot-pill">resource list</div>
        </div>

        <div class="snapshot-item">
          <div class="snapshot-left">
            <div class="snapshot-label">Active Alerts</div>
            <div class="snapshot-value">${activeAlerts}</div>
          </div>
          <div class="snapshot-pill">notice board</div>
        </div>

        <div class="snapshot-item">
          <div class="snapshot-left">
            <div class="snapshot-label">Nearest Task</div>
            <div class="snapshot-value">${nearestTask ? escHtml(nearestTask.title) : 'None'}</div>
          </div>
          <div class="snapshot-pill">deadline reminder</div>
        </div>
      `;
    }


    function updateStatusChips() {
      document.getElementById('tasksStatusChip').textContent = `${state.tasks.length} tasks · ${state.tasks.filter(t => !t.completed).length} active`;
      document.getElementById('resourcesStatusChip').textContent = `${state.resources.length} files`;
      document.getElementById('dashboardStatusChip').textContent = state.currentGroup
        ? `${state.currentGroup.name} · ${state.tasks.filter(t => !t.completed).length} active tasks · ${getDisplayAlerts().length} alerts`
        : 'Project overview';
    }


    function getNearestDueTask() {
      const upcoming = state.tasks.filter(t => !t.completed).sort(sortByDueDateAsc);
      return upcoming[0] || null;
    }


    function getDisplayAlerts() {
      const sorted = [...state.alerts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      return sorted.filter((alert, index) => index === 0 || alert.acknowledgedBy.length < state.members.length);
    }
