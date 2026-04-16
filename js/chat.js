// Chat composer and messaging actions

    async function sendMessage() {
      const input = document.getElementById('chatInput');
      const text = input.value.trim();
      if (!text || !state.currentGroup) return;

      const senderId = getCurrentMemberIndex();
      const sender = state.members[senderId];
      if (!sender) return;

      try {
        await createEncryptedChatMessage(state.currentGroup.id, sender.dbId, text);
      } catch (error) {
        console.error('sendMessage failed', error);
        showToast('Failed to send message', 'alert');
        return;
      }

      input.value = '';
      await loadMessages();
      renderChatMessages();
      showToast(`${sender.name} sent a message`, 'chat');
    }


    function togglePlusMenu(event) {
      event.stopPropagation();
      document.getElementById('plusMenu').classList.toggle('open');
    }


    function openAlertComposer() {
      closeComposerPanels();
      document.getElementById('plusMenu').classList.remove('open');
      document.getElementById('alertComposer').classList.add('open');
      document.getElementById('alertInput').focus();
    }


    function openUploadComposer() {
      closeComposerPanels();
      document.getElementById('plusMenu').classList.remove('open');
      document.getElementById('uploadComposer').classList.add('open');
    }


    function closeComposerPanels() {
      document.getElementById('alertComposer').classList.remove('open');
      document.getElementById('uploadComposer').classList.remove('open');
    }
