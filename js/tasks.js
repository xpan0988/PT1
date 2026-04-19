// Task actions

    function getDueDateFromSelectors() {
      const year = document.getElementById('taskDueYear')?.value;
      const month = document.getElementById('taskDueMonth')?.value;
      const day = document.getElementById('taskDueDay')?.value;
      if (!year || !month || !day) return '';
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    function setDueDateSelectors(dateStr) {
      const yearSelect = document.getElementById('taskDueYear');
      const monthSelect = document.getElementById('taskDueMonth');
      const daySelect = document.getElementById('taskDueDay');
      if (!yearSelect || !monthSelect || !daySelect) return;

      if (!isValidDueDateInput(dateStr)) {
        yearSelect.value = '';
        monthSelect.value = '';
        daySelect.value = '';
        return;
      }

      const [year, month, day] = dateStr.split('-');
      yearSelect.value = year;
      monthSelect.value = String(Number(month));
      daySelect.value = String(Number(day));
    }

    function initializeTaskDueDateSelectors() {
      const yearSelect = document.getElementById('taskDueYear');
      const monthSelect = document.getElementById('taskDueMonth');
      const daySelect = document.getElementById('taskDueDay');
      if (!yearSelect || !monthSelect || !daySelect) return;

      const currentYear = new Date().getFullYear();
      const years = [];
      for (let year = currentYear - 5; year <= currentYear + 5; year += 1) {
        years.push(`<option value="${year}">${year}</option>`);
      }
      yearSelect.innerHTML = `<option value="">Year</option>${years.join('')}`;

      const months = [];
      for (let month = 1; month <= 12; month += 1) {
        months.push(`<option value="${month}">${month}</option>`);
      }
      monthSelect.innerHTML = `<option value="">Month</option>${months.join('')}`;

      const days = [];
      for (let day = 1; day <= 31; day += 1) {
        days.push(`<option value="${day}">${day}</option>`);
      }
      daySelect.innerHTML = `<option value="">Day</option>${days.join('')}`;
    }

    async function addTask() {
      const title = document.getElementById('taskInput').value.trim();
      const assigneeId = parseInt(document.getElementById('taskAssignee').value, 10);
      const dueDate = getDueDateFromSelectors();
      const priority = document.getElementById('taskPriority').value;

      if (!title || !dueDate || !state.currentGroup) return;
      if (!isValidDueDateInput(dueDate)) {
        showToast('Please select a valid due date', 'alert');
        return;
      }
      const normalizedDueDate = toIsoDateInput(parseDateInputToDate(dueDate));

      const assignee = state.members[assigneeId];
      if (!assignee) return;

      if (state.editingTaskId) {
        const task = state.tasks.find(t => t.id === state.editingTaskId);
        if (!task) return;
        if (!canEditTask(task)) {
          showToast('You can only edit tasks you created', 'alert');
          resetTaskForm();
          return;
        }

        const { error } = await supabaseClient
          .from('tasks')
          .update({
            title,
            assignee_user_id: assignee.dbId,
            due_date: normalizedDueDate,
            priority
          })
          .eq('id', state.editingTaskId);

        if (error) {
          console.error('updateTask failed', error);
          showToast('Failed to update task', 'alert');
          return;
        }

        resetTaskForm();
        await refreshTasks({ source: 'post-action:update-task' });
        showToast(`Task updated for ${state.members[assigneeId]?.name || 'A member'}`, 'task');
        return;
      }

      const { error } = await supabaseClient
        .from('tasks')
        .insert({
          group_id: state.currentGroup.id,
          title,
          assignee_user_id: assignee.dbId,
          due_date: normalizedDueDate,
          priority,
          completed: false,
          created_by: state.currentUser.id
        });

      if (error) {
        console.error('addTask failed', error);
        showToast('Failed to add task', 'alert');
        return;
      }

      resetTaskForm();
      await refreshTasks({ source: 'post-action:add-task' });
      showToast(`Task added for ${assignee.name}`, 'task');
    }


    async function completeTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task || task.completed) return;

      const completedAt = new Date().toISOString();
      if (!canCompleteTask(task)) {
        showToast('Only the creator or assignee can complete this task', 'alert');
        return;
      }

      const { error } = await supabaseClient
        .from('tasks')
        .update({
          completed: true,
          completed_at: completedAt
        })
        .eq('id', taskId);

      if (error) {
        console.error('completeTask failed', error);
        showToast('Failed to complete task', 'alert');
        return;
      }

      await refreshTasks({ source: 'post-action:complete-task' });
      showToast(`${state.members[task.assigneeId]?.name || 'A member'} completed a task`, 'task');
    }


    function editTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;
      if (!canEditTask(task)) {
        showToast('You can only edit tasks you created', 'alert');
        return;
      }

      document.getElementById('taskInput').value = task.title;
      document.getElementById('taskAssignee').value = String(task.assigneeId);
      setDueDateSelectors(task.dueDate);
      document.getElementById('taskPriority').value = task.priority || 'Medium';
      state.editingTaskId = taskId;

      const taskButton = document.querySelector('#view-tasks .btn.btn-primary');
      if (taskButton) taskButton.textContent = 'Save Changes';

      switchView('tasks');
      document.getElementById('taskInput').focus();
    }


    function resetTaskForm() {
      document.getElementById('taskInput').value = '';
      setDueDateSelectors('');
      document.getElementById('taskPriority').value = 'Medium';
      document.getElementById('taskAssignee').selectedIndex = 0;
      state.editingTaskId = null;

      const taskButton = document.querySelector('#view-tasks .btn.btn-primary');
      if (taskButton) taskButton.textContent = 'Add Task';
    }

    function canEditTask(task) {
      if (!task || !state.currentUser?.id) return false;
      return task.createdByUserId === state.currentUser.id;
    }

    function canCompleteTask(task) {
      if (!task || !state.currentUser?.id) return false;
      return task.assigneeUserId === state.currentUser.id || canEditTask(task);
    }
