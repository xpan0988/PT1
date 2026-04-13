// Supabase data loading and persistence

    async function loadMembers() {
      if (!state.currentGroup) {
        state.members = [];
        state.contributions = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          profiles:user_id (
            id,
            display_name
          )
        `)
        .eq('group_id', state.currentGroup.id)
        .order('joined_at', { ascending: true });

      if (error) {
        console.error('loadMembers failed', error);
        state.members = [];
        state.contributions = [];
        return;
      }

      state.members = (data || []).map((row, i) => ({
        id: i,
        dbId: row.user_id,
        membershipId: row.id,
        name: row.profiles?.display_name || 'User',
        initials: (row.profiles?.display_name || 'U').slice(0, 2).toUpperCase(),
        color: ['#7c6af7','#f7c56a','#6af7b8','#f76a9f'][i % 4]
      }));

      state.contributions = state.members.map(() => ({
        tasksCompleted: 0,
        filesUploaded: 0
      }));
    }


    async function loadMessages() {
      if (!state.currentGroup) {
        state.messages = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('group_id', state.currentGroup.id)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('loadMessages failed', error);
        state.messages = [];
        return;
      }

      const dbMessages = (data || []).map(row => {
        const senderIndex = state.members.findIndex(member => member.dbId === row.sender_user_id);
        return {
          id: row.id,
          type: row.type || 'text',
          senderId: senderIndex,
          text: row.text,
          time: formatTime(new Date(row.created_at || Date.now())),
          createdAt: row.created_at,
          alertId: null
        };
      }).filter(msg => msg.senderId !== -1);

      const alertMessages = state.alerts
        .map(alert => ({
          id: `alert-message-${alert.id}`,
          type: 'alert',
          senderId: alert.senderId,
          text: alert.text,
          time: alert.time,
          createdAt: alert.createdAt,
          alertId: alert.id
        }))
        .filter(msg => msg.senderId !== -1);

      state.messages = [...dbMessages, ...alertMessages].sort((a, b) => {
        const aTime = new Date(a.createdAt || Date.now()).getTime();
        const bTime = new Date(b.createdAt || Date.now()).getTime();
        return aTime - bTime;
      });
    }


    async function loadTasks() {
      if (!state.currentGroup) {
        state.tasks = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('tasks')
        .select('*')
        .eq('group_id', state.currentGroup.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('loadTasks failed', error);
        state.tasks = [];
        return;
      }

      state.tasks = (data || []).map(row => {
        const assigneeIndex = state.members.findIndex(member => member.dbId === row.assignee_user_id);
        return {
          id: row.id,
          title: row.title,
          assigneeId: assigneeIndex,
          dueDate: row.due_date,
          priority: row.priority || 'Medium',
          completed: !!row.completed,
          createdAt: row.created_at,
          completedAt: row.completed_at
        };
      }).filter(task => task.assigneeId !== -1);
    }


    async function loadAlerts() {
      if (!state.currentGroup) {
        state.alerts = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('alerts')
        .select('*')
        .eq('group_id', state.currentGroup.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('loadAlerts failed', error);
        state.alerts = [];
        return;
      }

      const { data: readRows, error: readError } = await supabaseClient
        .from('alert_reads')
        .select('*')
        .in('alert_id', (data || []).map(row => row.id));

      if (readError) {
        console.error('loadAlerts read rows failed', readError);
      }

      const readsByAlert = new Map();
      (readRows || []).forEach(row => {
        if (!readsByAlert.has(row.alert_id)) {
          readsByAlert.set(row.alert_id, []);
        }
        readsByAlert.get(row.alert_id).push(row.user_id);
      });

      state.alerts = (data || []).map(row => {
        const senderIndex = state.members.findIndex(member => member.dbId === row.sender_user_id);
        const acknowledgedDbIds = readsByAlert.get(row.id) || [];
        const acknowledgedBy = acknowledgedDbIds
          .map(dbId => state.members.findIndex(member => member.dbId === dbId))
          .filter(index => index !== -1);

        return {
          id: row.id,
          senderId: senderIndex,
          text: row.text,
          time: formatTime(new Date(row.created_at || Date.now())),
          createdAt: row.created_at,
          acknowledgedBy,
        };
      }).filter(alert => alert.senderId !== -1);
    }


    async function loadResources() {
      if (!state.currentGroup) {
        state.resources = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('resources')
        .select('*')
        .eq('group_id', state.currentGroup.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('loadResources failed', error);
        state.resources = [];
        return;
      }

      state.resources = (data || []).map(row => {
        const senderIndex = state.members.findIndex(member => member.dbId === row.sender_user_id);
        return {
          id: row.id,
          senderId: senderIndex,
          name: row.name,
          icon: row.icon || getFileIcon((row.type || '').toLowerCase()),
          type: row.type,
          size: row.size_label || '—',
          time: formatTime(new Date(row.created_at || Date.now())),
          createdAt: row.created_at
        };
      }).filter(resource => resource.senderId !== -1);
    }


    async function loadAvailabilityBlocks() {
      if (!state.currentGroup) {
        state.availabilityBlocks = [];
        return;
      }

      const { data, error } = await supabaseClient
        .from('availability_blocks')
        .select('*')
        .eq('group_id', state.currentGroup.id)
        .order('weekday', { ascending: true })
        .order('start_hour', { ascending: true });

      if (error) {
        console.error('loadAvailabilityBlocks failed', error);
        state.availabilityBlocks = [];
        return;
      }

      state.availabilityBlocks = data || [];
    }
