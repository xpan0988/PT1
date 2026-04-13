// Resource upload and filter actions


    async function handleChatFileInput(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) {
        showToast('Please choose a file to upload', 'alert');
        return;
      }

      if (!state.currentGroup || !state.currentUser) {
        showToast('Join a group before uploading files', 'alert');
        event.target.value = '';
        return;
      }

      const senderId = parseInt(document.getElementById('chatSender').value, 10);
      const sender = state.members[senderId];
      if (!sender) {
        showToast('Unable to determine uploader', 'alert');
        event.target.value = '';
        return;
      }

      const ext = file.name.split('.').pop().toLowerCase();
      const icon = getFileIcon(ext);

      try {
        const uploadMeta = await uploadResourceBinary(file, state.currentGroup.id, sender.dbId);

        await addResource({
          senderId,
          name: file.name,
          originalName: uploadMeta.originalName,
          icon,
          type: inferFileTypeLabel(file.name),
          sizeLabel: formatFileSize(file.size),
          sizeBytes: uploadMeta.sizeBytes,
          mimeType: uploadMeta.mimeType,
          storagePath: uploadMeta.storagePath,
          bucketName: uploadMeta.bucketName,
          createMessage: true,
        });

        closeComposerPanels();
        switchView('resources');
        showToast(`File uploaded by ${state.members[senderId]?.name || 'A member'}`, 'file');
      } catch (error) {
        console.error('handleChatFileInput failed', error);
        showToast('Failed to upload file', 'alert');
      } finally {
        event.target.value = '';
      }
    }


    async function simulateUploadFromComposer() {
      const senderId = parseInt(document.getElementById('chatSender').value, 10);
      const item = FILE_LIBRARY[fileSeedIndex % FILE_LIBRARY.length];
      fileSeedIndex += 1;

      await addResource({
        senderId,
        name: item.name,
        originalName: item.name,
        icon: item.icon,
        type: item.type,
        sizeLabel: randomDemoSize(),
        createMessage: true,
      });
      closeComposerPanels();
      switchView('resources');
      showToast(`Simulated upload: ${item.name}`, 'file');
    }


    async function addResource(resourceInput) {
      if (!state.currentGroup) return;

      const senderId = resourceInput.senderId;
      const sender = state.members[senderId];
      if (!sender) return;

      try {
        await createResourceRecord({
          groupId: state.currentGroup.id,
          senderUserId: sender.dbId,
          name: resourceInput.name,
          originalName: resourceInput.originalName || resourceInput.name,
          type: resourceInput.type,
          sizeLabel: resourceInput.sizeLabel || '—',
          sizeBytes: resourceInput.sizeBytes || null,
          mimeType: resourceInput.mimeType || null,
          storagePath: resourceInput.storagePath || null,
          bucketName: resourceInput.bucketName || null,
          icon: resourceInput.icon
        });

        if (resourceInput.createMessage !== false) {
          await createFileMessage(state.currentGroup.id, sender.dbId, resourceInput.name);
        }

        await loadResources();
        await loadMessages();
        refreshAll();
      } catch (error) {
        console.error('addResource failed', error);
        showToast('Failed to upload resource', 'alert');
      }
    }

    function inferFileTypeLabel(fileName) {
      const ext = String(fileName || '').split('.').pop().toUpperCase();
      return ext || 'FILE';
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
