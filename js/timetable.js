// Timetable interactions

    async function toggleAvailabilityBlock(weekday, startHour) {
      if (!state.currentGroup || !state.currentUser) return;

      const existingBlock = state.availabilityBlocks.find(block =>
        block.group_id === state.currentGroup.id &&
        block.user_id === state.currentUser.id &&
        block.weekday === weekday &&
        block.start_hour === startHour
      );

      if (existingBlock) {
        const { error } = await supabaseClient
          .from('availability_blocks')
          .delete()
          .eq('id', existingBlock.id);

        if (error) {
          console.error('toggleAvailabilityBlock delete failed', error);
          showToast('Failed to remove time block', 'alert');
          return;
        }
      } else {
        const { error } = await supabaseClient
          .from('availability_blocks')
          .insert({
            group_id: state.currentGroup.id,
            user_id: state.currentUser.id,
            weekday,
            start_hour: startHour,
            end_hour: startHour + 2
          });

        if (error) {
          console.error('toggleAvailabilityBlock insert failed', error);
          showToast('Failed to save time block', 'alert');
          return;
        }
      }

      await loadAvailabilityBlocks();
      renderSchedule();
      showToast('Availability updated', 'task');
    }


    function isMyAvailabilityBlockSelected(weekday, startHour) {
      return state.availabilityBlocks.some(block =>
        block.group_id === state.currentGroup?.id &&
        block.user_id === state.currentUser?.id &&
        block.weekday === weekday &&
        block.start_hour === startHour
      );
    }


    function getScheduleSectionStateKey(weekday, sectionKey) {
      return `${weekday}-${sectionKey}`;
    }


    function toggleScheduleSection(weekday, sectionKey) {
      const stateKey = getScheduleSectionStateKey(weekday, sectionKey);
      state.openScheduleSections[stateKey] = !state.openScheduleSections[stateKey];
      renderSchedule();
    }


    function isScheduleSectionOpen(weekday, sectionKey) {
      return !!state.openScheduleSections[getScheduleSectionStateKey(weekday, sectionKey)];
    }
