// Task actions

    async function addTask() {
      const title = document.getElementById('taskInput').value.trim();
      const assigneeId = parseInt(document.getElementById('taskAssignee').value, 10);
      const dueDate = document.getElementById('taskDueDate').value;
      const priority = document.getElementById('taskPriority').value;

      if (!title || !dueDate || !state.currentGroup) return;

      const assignee = state.members[assigneeId];
      if (!assignee) return;

      if (state.editingTaskId) {
        const task = state.tasks.find(t => t.id === state.editingTaskId);
        if (!task) return;

        const { error } = await supabaseClient
          .from('tasks')
          .update({
            title,
            assignee_user_id: assignee.dbId,
            due_date: dueDate,
            priority
          })
          .eq('id', state.editingTaskId);

        if (error) {
          console.error('updateTask failed', error);
          showToast('Failed to update task', 'alert');
          return;
        }

        resetTaskForm();
        await loadTasks();
        refreshAll();
        showToast(`Task updated for ${state.members[assigneeId]?.name || 'A member'}`, 'task');
        return;
      }

      const { error } = await supabaseClient
        .from('tasks')
        .insert({
          group_id: state.currentGroup.id,
          title,
          assignee_user_id: assignee.dbId,
          due_date: dueDate,
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
      await loadTasks();
      refreshAll();
      showToast(`Task added for ${assignee.name}`, 'task');
    }


    async function completeTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task || task.completed) return;

      const completedAt = new Date().toISOString();

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

      await loadTasks();
      refreshAll();
      showToast(`${state.members[task.assigneeId]?.name || 'A member'} completed a task`, 'task');
    }


    function editTask(taskId) {
      const task = state.tasks.find(t => t.id === taskId);
      if (!task) return;

      document.getElementById('taskInput').value = task.title;
      document.getElementById('taskAssignee').value = String(task.assigneeId);
      document.getElementById('taskDueDate').value = task.dueDate;
      document.getElementById('taskPriority').value = task.priority || 'Medium';
      state.editingTaskId = taskId;

      const taskButton = document.querySelector('#view-tasks .btn.btn-primary');
      if (taskButton) taskButton.textContent = 'Save Changes';

      switchView('tasks');
      document.getElementById('taskInput').focus();
    }


    function resetTaskForm() {
      document.getElementById('taskInput').value = '';
      document.getElementById('taskDueDate').value = '';
      document.getElementById('taskPriority').value = 'Medium';
      document.getElementById('taskAssignee').selectedIndex = 0;
      state.editingTaskId = null;

      const taskButton = document.querySelector('#view-tasks .btn.btn-primary');
      if (taskButton) taskButton.textContent = 'Add Task';
    }
