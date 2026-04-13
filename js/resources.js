// Resource upload and filter actions


    async function handleChatFileInput(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      const senderId = parseInt(document.getElementById('chatSender').value, 10);
      const ext = file.name.split('.').pop().toLowerCase();
      const icon = getFileIcon(ext);

      await addResource(senderId, file.name, icon, ext.toUpperCase(), formatFileSize(file.size));
      event.target.value = '';
      closeComposerPanels();
      switchView('resources');
      showToast(`File uploaded by ${state.members[senderId]?.name || 'A member'}`, 'file');    
    }


    async function simulateUploadFromComposer() {
      const senderId = parseInt(document.getElementById('chatSender').value, 10);
      const item = FILE_LIBRARY[fileSeedIndex % FILE_LIBRARY.length];
      fileSeedIndex += 1;

      await addResource(senderId, item.name, item.icon, item.type, randomDemoSize());
      closeComposerPanels();
      switchView('resources');
      showToast(`Simulated upload: ${item.name}`, 'file');
    }


    async function addResource(senderId, name, icon, type, size, timeLabel) {
      if (!state.currentGroup) return;

      const sender = state.members[senderId];
      if (!sender) return;

      const { error: resourceError } = await supabaseClient
        .from('resources')
        .insert({
          group_id: state.currentGroup.id,
          sender_user_id: sender.dbId,
          name,
          type,
          size_label: size,
          icon
        });

      if (resourceError) {
        console.error('addResource failed', resourceError);
        showToast('Failed to upload resource', 'alert');
        return;
      }

      const { error: messageError } = await supabaseClient
        .from('messages')
        .insert({
          group_id: state.currentGroup.id,
          sender_user_id: sender.dbId,
          type: 'file',
          text: name
        });

      if (messageError) {
        console.error('addResource message insert failed', messageError);
      }

      await loadResources();
      await loadMessages();
      refreshAll();
    }


    function populateResourceTypeFilter() {
      const select = document.getElementById('resourceTypeFilter');
      if (!select) return;

      const types = [...new Set([...FILE_LIBRARY.map(item => item.type), ...state.resources.map(item => item.type)])].sort();
      const currentValue = select.value || 'all';

      select.innerHTML = `<option value="all">All Types</option>` +
        types.map(type => `<option value="${type}">${type}</option>`).join('');

      if ([...select.options].some(option => option.value === currentValue)) {
        select.value = currentValue;
      }
    }


    function resetResourceFilters() {
      const typeFilter = document.getElementById('resourceTypeFilter');
      const searchInput = document.getElementById('resourceSearchInput');
      if (typeFilter) typeFilter.value = 'all';
      if (searchInput) searchInput.value = '';
      renderResources();
    }
