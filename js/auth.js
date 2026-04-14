// Authentication, profile, and group membership flows

    async function initAuth() {
      let { data: { session } } = await supabaseClient.auth.getSession();

      if (!session) {
        const { data } = await supabaseClient.auth.signInAnonymously();
        session = data.session;
      }

      state.currentUser = session.user;
    }


    async function ensureProfile() {
      const user = state.currentUser;

      const { data } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (!data) {
        const { data: inserted } = await supabaseClient
          .from('profiles')
          .insert({
            id: user.id,
            display_name: 'User'
          })
          .select()
          .single();

        state.currentProfile = inserted || { id: user.id, display_name: 'User' };
        return;
      }

      state.currentProfile = data;
    }

    async function ensureMembershipOrShowOnboarding() {
      const { data, error } = await supabaseClient
        .from('group_members')
        .select(`
          id,
          group_id,
          user_id,
          groups:group_id (
            id,
            name,
            password_hash,
            created_by,
            created_at
          )
        `)
        .eq('user_id', state.currentUser.id)
        .maybeSingle();

      if (error) {
        console.error('ensureMembershipOrShowOnboarding failed', error);
      }

      if (data && data.groups) {
        state.currentMembership = data;
        state.currentGroup = data.groups;
        updateHeaderGroupTag();
        document.getElementById('groupModal').classList.remove('open');
        return true;
      }

      await unsubscribeRealtime();
      openGroupModal();
      return false;
    }


    function openGroupModal() {
      setGroupMode('create');
      clearGroupModalError();
      document.getElementById('groupUserName').value = state.currentProfile?.display_name || '';
      document.getElementById('groupNameInput').value = '';
      document.getElementById('groupPasswordInput').value = '';
      document.getElementById('groupModal').classList.add('open');
      document.getElementById('groupUserName').focus();
    }


    function setGroupMode(mode) {
      state.groupMode = mode;
      document.getElementById('createModeBtn').classList.toggle('active', mode === 'create');
      document.getElementById('joinModeBtn').classList.toggle('active', mode === 'join');
      document.getElementById('groupSubmitBtn').textContent = mode === 'create' ? 'Create Group' : 'Join Group';
      document.getElementById('groupModeHelper').textContent = mode === 'create'
        ? 'Create a new group. You will become the first member and other people can join with the same group name and password.'
        : 'Join an existing group by entering the exact group name and matching 6-digit password.';
      clearGroupModalError();
    }


    function showGroupModalError(message) {
      const el = document.getElementById('groupModalError');
      el.textContent = message;
      el.classList.add('open');
    }


    function clearGroupModalError() {
      const el = document.getElementById('groupModalError');
      el.textContent = '';
      el.classList.remove('open');
    }


    async function submitGroupFlow() {
      const displayName = document.getElementById('groupUserName').value.trim();
      const groupName = document.getElementById('groupNameInput').value.trim();
      const password = document.getElementById('groupPasswordInput').value.trim();

      clearGroupModalError();

      if (!displayName) {
        showGroupModalError('Please enter your name.');
        return;
      }

      if (!groupName) {
        showGroupModalError('Please enter a group name.');
        return;
      }

      if (!/^\d{6}$/.test(password)) {
        showGroupModalError('The group password must be exactly 6 digits.');
        return;
      }

      const { data: updatedProfile, error: profileError } = await supabaseClient
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', state.currentUser.id)
        .select()
        .single();

      if (profileError) {
        console.error('profile update failed', profileError);
        showGroupModalError('Failed to update your profile name.');
        return;
      }

      state.currentProfile = updatedProfile || { id: state.currentUser.id, display_name: displayName };

      if (state.groupMode === 'create') {
        await createGroupFlow(groupName, password);
      } else {
        await joinGroupFlow(groupName, password);
      }
    }


    async function createGroupFlow(groupName, password) {
      const { data: existingGroup, error: existingError } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('name', groupName)
        .maybeSingle();

      if (existingError) {
        console.error('group existence check failed', existingError);
        showGroupModalError('Failed to check whether the group already exists.');
        return;
      }

      if (existingGroup) {
        showGroupModalError('A group with this name already exists. Choose another name or switch to Join Group.');
        return;
      }

      const { data: createdGroup, error: groupError } = await supabaseClient
        .from('groups')
        .insert({
          name: groupName,
          password_hash: password,
          created_by: state.currentUser.id
        })
        .select()
        .single();

      if (groupError || !createdGroup) {
        console.error('group creation failed', groupError);
        showGroupModalError('Failed to create the group.');
        return;
      }

      const { data: membership, error: membershipError } = await supabaseClient
        .from('group_members')
        .insert({
          group_id: createdGroup.id,
          user_id: state.currentUser.id
        })
        .select()
        .single();

      if (membershipError || !membership) {
        console.error('membership creation failed', membershipError);
        showGroupModalError('The group was created, but joining it failed.');
        return;
      }

      state.currentGroup = createdGroup;
      state.currentMembership = membership;
      updateHeaderGroupTag();
      document.getElementById('groupModal').classList.remove('open');
      await hydrateCurrentGroupData();
      await ensureGroupRealtimeSubscription();
      renderAvatars();
      populateMemberSelects();
      refreshAll();
      showToast(`Group created: ${groupName}`, 'task');
    }


    async function joinGroupFlow(groupName, password) {
      const { data: targetGroup, error: groupError } = await supabaseClient
        .from('groups')
        .select('*')
        .eq('name', groupName)
        .maybeSingle();

      if (groupError) {
        console.error('group lookup failed', groupError);
        showGroupModalError('Failed to look up the group.');
        return;
      }

      if (!targetGroup) {
        showGroupModalError('No group with this name was found.');
        return;
      }

      if (targetGroup.password_hash !== password) {
        showGroupModalError('The 6-digit password does not match this group.');
        return;
      }

      const { data: existingMembers, error: memberLookupError } = await supabaseClient
        .from('group_members')
        .select(`
          user_id,
          profiles:user_id (
            display_name
          )
        `)
        .eq('group_id', targetGroup.id);

      if (memberLookupError) {
        console.error('group member lookup failed', memberLookupError);
        showGroupModalError('Failed to check existing group members.');
        return;
      }

      const normalizedDisplayName = (state.currentProfile?.display_name || '').trim().toLowerCase();
      const duplicateMember = (existingMembers || []).find(row =>
        row.user_id !== state.currentUser.id &&
        (row.profiles?.display_name || '').trim().toLowerCase() === normalizedDisplayName
      );

      if (duplicateMember) {
        showGroupModalError('This name is already being used in the group. Please choose a different display name before joining.');
        return;
      }

      const { data: existingMembership } = await supabaseClient
        .from('group_members')
        .select('*')
        .eq('group_id', targetGroup.id)
        .eq('user_id', state.currentUser.id)
        .maybeSingle();

      let membership = existingMembership;

      if (!membership) {
        const { data: createdMembership, error: membershipError } = await supabaseClient
          .from('group_members')
          .insert({
            group_id: targetGroup.id,
            user_id: state.currentUser.id
          })
          .select()
          .single();

        if (membershipError || !createdMembership) {
          console.error('join group membership failed', membershipError);
          showGroupModalError('Failed to join the group.');
          return;
        }

        membership = createdMembership;
      }

      state.currentGroup = targetGroup;
      state.currentMembership = membership;
      updateHeaderGroupTag();
      document.getElementById('groupModal').classList.remove('open');
      await hydrateCurrentGroupData();
      await ensureGroupRealtimeSubscription();
      renderAvatars();
      populateMemberSelects();
      refreshAll();
      showToast(`Joined group: ${groupName}`, 'task');
    }


    async function restartGroupFlow() {
      // Group flow reset must clear realtime channels to prevent stale callbacks.
      await unsubscribeRealtime();

      state.currentGroup = null;
      state.currentMembership = null;
      state.members = [];
      state.messages = [];
      state.tasks = [];
      state.resources = [];
      state.alerts = [];
      state.availabilityBlocks = [];
      state.contributions = [];
      state.editingTaskId = null;
      state.memberIndexByDbId = new Map();
      state.memberByDbId = new Map();
      state.pendingRealtimeTables = new Set();
      state.hasRenderedSchedule = false;
      state.isHydratingInitialData = false;

      updateHeaderGroupTag();
      renderAvatars();
      populateMemberSelects();
      closeComposerPanels();
      switchView('dashboard');
      openGroupModal();
      refreshAll();
    }
