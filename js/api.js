// Supabase data loading and persistence

    async function upsertMemberPublicKey(userId, publicKeyJwk) {
      // `member_public_keys` is user-scoped in MVP. Do not write `key_version` here;
      // versioned key metadata belongs to `group_key_envelopes` and `messages`.
      const { error } = await supabaseClient
        .from('member_public_keys')
        .upsert({
          user_id: userId,
          public_key: publicKeyJwk
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;
    }

    async function getMemberPublicKeys(userIds) {
      if (!Array.isArray(userIds) || userIds.length === 0) return [];
      const { data, error } = await supabaseClient
        .from('member_public_keys')
        .select('*')
        .in('user_id', userIds);

      if (error) throw error;
      return data || [];
    }

    async function getMyGroupKeyEnvelope(groupId, userId, keyVersion = 1) {
      const { data, error } = await supabaseClient
        .from('group_key_envelopes')
        .select('group_id,user_id,encrypted_group_key,key_version,algorithm')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .eq('key_version', keyVersion)
        .maybeSingle();

      if (error) throw error;
      return data || null;
    }

    async function getGroupKeyEnvelopeCount(groupId, keyVersion = 1) {
      if (!groupId) return 0;
      const { count, error } = await supabaseClient
        .from('group_key_envelopes')
        .select('group_id', {
          head: true,
          count: 'exact'
        })
        .eq('group_id', groupId)
        .eq('key_version', keyVersion);

      if (error) throw error;
      return count || 0;
    }

    async function getGroupMemberUserIds(groupId) {
      if (!groupId) return [];
      const { data, error } = await supabaseClient
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

      if (error) throw error;
      return (data || []).map((row) => row.user_id).filter(Boolean);
    }

    async function getGroupKeyEnvelopes(groupId, keyVersion = 1) {
      if (!groupId) return [];
      const { data, error } = await supabaseClient
        .from('group_key_envelopes')
        .select('group_id,user_id,encrypted_group_key,key_version,algorithm')
        .eq('group_id', groupId)
        .eq('key_version', keyVersion);

      if (error) throw error;
      return data || [];
    }

    async function upsertGroupKeyEnvelopes(envelopes) {
      if (!Array.isArray(envelopes) || envelopes.length === 0) return;
      const normalizedEnvelopes = envelopes.map((row) => ({
        group_id: row.group_id,
        user_id: row.user_id,
        encrypted_group_key: row.encrypted_group_key,
        key_version: row.key_version,
        algorithm: row.algorithm
      }));

      const { error } = await supabaseClient
        .from('group_key_envelopes')
        .upsert(normalizedEnvelopes, {
          onConflict: 'group_id,user_id,key_version'
        });

      if (error) throw error;
    }

    async function createMessageRecord(messageInput) {
      const { data, error } = await supabaseClient
        .from('messages')
        .insert(messageInput)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    }

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
      state.memberIndexByDbId = new Map(state.members.map(member => [member.dbId, member.id]));
      state.memberByDbId = new Map(state.members.map(member => [member.dbId, member]));

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

      const dbMessages = [];
      for (const row of (data || [])) {
        const senderIndex = state.memberIndexByDbId.get(row.sender_user_id) ?? -1;
        const text = await getRenderableMessageText(row);
        dbMessages.push({
          id: row.id,
          type: row.type || 'text',
          senderId: senderIndex,
          text,
          time: formatTime(new Date(row.created_at || Date.now())),
          createdAt: row.created_at,
          alertId: null
        });
      }

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

      state.messages = [...dbMessages, ...alertMessages].filter(msg => msg.senderId !== -1).sort((a, b) => {
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
        const assigneeIndex = state.memberIndexByDbId.get(row.assignee_user_id) ?? -1;
        return {
          id: row.id,
          title: row.title,
          assigneeId: assigneeIndex,
          assigneeUserId: row.assignee_user_id,
          createdByUserId: row.created_by,
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
        const senderIndex = state.memberIndexByDbId.get(row.sender_user_id) ?? -1;
        const acknowledgedDbIds = readsByAlert.get(row.id) || [];
        const acknowledgedBy = acknowledgedDbIds
          .map(dbId => state.memberIndexByDbId.get(dbId) ?? -1)
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
        const senderIndex = state.memberIndexByDbId.get(row.sender_user_id) ?? -1;
        return {
          id: row.id,
          senderId: senderIndex,
          name: row.name,
          icon: row.icon || getFileIcon((row.type || '').toLowerCase()),
          type: row.type,
          size: row.size_label || '—',
          sizeBytes: row.size_bytes || 0,
          mimeType: row.mime_type || '',
          storagePath: row.storage_path || '',
          bucketName: row.bucket_name || 'group-files',
          originalName: row.original_name || row.name,
          time: formatTime(new Date(row.created_at || Date.now())),
          createdAt: row.created_at,
          simulated: false
        };
      }).filter(resource => resource.senderId !== -1);
    }


    async function uploadResourceBinary(file, groupId, userId) {
      const bucketName = 'group-files';
      if (!file) throw new Error('Missing file for upload');
      if (!groupId) throw new Error('Missing group id for upload');
      if (!userId) throw new Error('Missing user id for upload');

      const sanitizedOriginalName = String(file.name || 'file')
        .replace(/[^\w.\- ]+/g, '_')
        .replace(/\s+/g, '_');
      const timestamp = Date.now();
      const storagePath = `${groupId}/${userId}/${timestamp}_${sanitizedOriginalName}`;

      const { error } = await supabaseClient
        .storage
        .from(bucketName)
        .upload(storagePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false
        });

      if (error) throw error;

      return {
        bucketName,
        storagePath,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size || 0,
        originalName: file.name || 'file'
      };
    }


    async function createResourceRecord(resourceInput) {
      const { data, error } = await supabaseClient
        .from('resources')
        .insert(resourceInput)
        .select('*')
        .single();

      if (error) throw error;
      return data;
    }


    async function createFileMessage(groupId, senderUserId, fileDisplayText) {
      return await createMessageRecord({
        group_id: groupId,
        sender_user_id: senderUserId,
        type: 'file',
        text: fileDisplayText,
        is_encrypted: false
      });
    }


    async function getSignedResourceDownloadUrl(resource) {
      if (!resource?.storagePath) {
        throw new Error('Resource is missing storage path');
      }

      const bucketName = resource.bucketName || 'group-files';
      const { data, error } = await supabaseClient
        .storage
        .from(bucketName)
        .createSignedUrl(resource.storagePath, 60, {
          download: resource.originalName || resource.name || 'download'
        });

      if (error) throw error;
      return data?.signedUrl || '';
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


    const REALTIME_SUBSCRIBE_MAX_WAIT_MS = 15000;
    const REALTIME_RETRY_BASE_DELAY_MS = 1200;
    const REALTIME_RETRY_MAX_DELAY_MS = 10000;
    const REALTIME_MESSAGES_ONLY_MODE = false;

    function clearRealtimeRetryTimer() {
      if (!state.realtimeRetryTimer) return;
      clearTimeout(state.realtimeRetryTimer);
      state.realtimeRetryTimer = null;
    }

    function scheduleRealtimeRetry(groupId, reason = 'unknown') {
      if (!groupId || state.currentGroup?.id !== groupId || !state.currentMembership) return;

      clearRealtimeRetryTimer();

      const retryCount = Number(state.realtimeRetryCount || 0) + 1;
      state.realtimeRetryCount = retryCount;
      const delayMs = Math.min(REALTIME_RETRY_BASE_DELAY_MS * (2 ** (retryCount - 1)), REALTIME_RETRY_MAX_DELAY_MS);

      console.warn('[realtime] scheduling group subscription retry', {
        groupId,
        reason,
        retryCount,
        delayMs
      });

      state.realtimeRetryTimer = setTimeout(async () => {
        state.realtimeRetryTimer = null;
        try {
          await subscribeToGroupRealtime(groupId);
        } catch (error) {
          console.error('[realtime] retry attempt threw', error);
          scheduleRealtimeRetry(groupId, 'retry-threw');
        }
      }, delayMs);
    }

    function getPayloadGroupId(payload) {
      return payload?.new?.group_id || payload?.old?.group_id || null;
    }

    function getAlertIdFromPayload(payload) {
      return payload?.new?.alert_id || payload?.old?.alert_id || null;
    }

    function waitForRealtimeSubscribed(channel, groupId, attemptId) {
      return new Promise((resolve) => {
        let settled = false;
        let latestStatus = 'JOINING';
        const settle = (status) => {
          if (settled) return;
          settled = true;
          clearTimeout(waitTimer);
          resolve({ status, latestStatus });
        };

        const waitTimer = setTimeout(() => settle('APP_MAX_WAIT_EXCEEDED'), REALTIME_SUBSCRIBE_MAX_WAIT_MS);

        channel.subscribe((nextStatus) => {
          latestStatus = nextStatus;
          console.log('[realtime] channel status', { groupId, attemptId, status: nextStatus, retryCount: state.realtimeRetryCount });
          if (nextStatus === 'SUBSCRIBED') {
            settle('SUBSCRIBED');
            return;
          }
          if (nextStatus === 'CHANNEL_ERROR' || nextStatus === 'CLOSED') {
            settle(nextStatus);
            return;
          }
          if (nextStatus === 'TIMED_OUT') return;
        });
      });
    }

    async function unsubscribeRealtime() {
      const activeChannels = Array.isArray(state.realtimeChannels) ? state.realtimeChannels : [];
      clearRealtimeRetryTimer();
      state.realtimeRetryCount = 0;
      state.realtimePendingGroupId = null;
      state.realtimeAttemptSeq = 0;

      if (activeChannels.length === 0) {
        state.realtimeChannels = [];
        state.realtimeGroupId = null;
        return;
      }

      await Promise.allSettled(activeChannels.map(channel => supabaseClient.removeChannel(channel)));

      state.realtimeChannels = [];
      state.realtimeGroupId = null;
    }


    async function subscribeToGroupRealtime(groupId) {
      if (!groupId) return;
      const session = (await supabaseClient.auth.getSession())?.data?.session || null;
      const sessionAccessToken = session?.access_token || null;
      if (supabaseClient?.realtime?.setAuth) {
        supabaseClient.realtime.setAuth(sessionAccessToken || null);
      }
      if (!state.currentUser?.id || !state.currentMembership || state.currentGroup?.id !== groupId) {
        console.warn('[realtime] skipped subscribe: prerequisites not ready', {
          hasUser: !!state.currentUser?.id,
          hasMembership: !!state.currentMembership,
          currentGroupId: state.currentGroup?.id,
          targetGroupId: groupId
        });
        return;
      }

      // Avoid duplicate subscriptions when init/group flow runs more than once for the same group.
      if (state.realtimeGroupId === groupId && state.realtimeChannels.length > 0) {
        return;
      }
      if (state.realtimePendingGroupId === groupId) {
        return;
      }
      state.realtimePendingGroupId = groupId;
      const attemptId = Number(state.realtimeAttemptSeq || 0) + 1;
      state.realtimeAttemptSeq = attemptId;
      clearRealtimeRetryTimer();

      // Always clear stale channels before creating new group-scoped subscriptions.
      await unsubscribeRealtime();
      state.realtimePendingGroupId = groupId;
      state.realtimeAttemptSeq = attemptId;

      const runRealtimeHandler = async (tableKey, work) => {
        if (state.isHydratingInitialData) {
          state.pendingRealtimeTables.add(tableKey);
          console.log('[realtime] deferred during hydration', {
            table: tableKey,
            groupId
          });
          return;
        }
        try {
          await work();
        } catch (error) {
          console.error('[realtime] handler failed', {
            table: tableKey,
            groupId,
            error
          });
        }
      };

      const handleMessagesRealtimePayload = async (payload) => {
        const payloadGroupId = getPayloadGroupId(payload);
        const currentGroupId = state.currentGroup?.id || null;
        const membershipGroupId = state.currentMembership?.group_id || null;
        const currentUserId = state.currentUser?.id || null;
        const isStaleAttempt = state.realtimeAttemptSeq !== attemptId;

        console.log('[realtime] messages payload received', {
          eventType: payload?.eventType || null,
          payloadGroupId,
          currentGroupId,
          currentUserId,
          membershipGroupId,
          attemptId,
          currentAttemptId: state.realtimeAttemptSeq || null,
          isStaleAttempt
        });

        if (!state.currentGroup) {
          console.log('[realtime] messages callback skipped', {
            reason: 'missing-current-group',
            payloadGroupId,
            currentGroupId,
            attemptId
          });
          return;
        }

        if (!state.currentMembership) {
          console.log('[realtime] messages callback skipped', {
            reason: 'missing-membership',
            payloadGroupId,
            membershipGroupId,
            attemptId
          });
          return;
        }

        if (state.currentGroup.id !== groupId) {
          console.log('[realtime] messages callback skipped', {
            reason: 'subscription-group-mismatch',
            payloadGroupId,
            callbackGroupId: groupId,
            currentGroupId: state.currentGroup.id,
            attemptId
          });
          return;
        }

        if (payloadGroupId && payloadGroupId !== state.currentGroup.id) {
          console.log('[realtime] messages callback skipped', {
            reason: 'payload-group-mismatch',
            payloadGroupId,
            currentGroupId: state.currentGroup.id,
            attemptId
          });
          return;
        }

        if (isStaleAttempt) {
          console.log('[realtime] messages callback skipped', {
            reason: 'stale-attempt',
            attemptId,
            currentAttemptId: state.realtimeAttemptSeq || null
          });
          return;
        }

        if (state.isHydratingInitialData) {
          state.pendingRealtimeTables.add('messages');
          console.log('[realtime] messages callback skipped', {
            reason: 'hydration-in-progress',
            payloadGroupId,
            currentGroupId: state.currentGroup.id,
            attemptId
          });
          return;
        }

        console.log('[realtime] loadMessages start from realtime', {
          eventType: payload?.eventType || null,
          groupId: state.currentGroup.id,
          attemptId
        });
        await loadMessages();
        console.log('[realtime] loadMessages done from realtime', {
          messageCount: state.messages.length,
          groupId: state.currentGroup.id,
          attemptId
        });

        console.log('[realtime] renderChatMessages start from realtime', {
          messageCount: state.messages.length,
          attemptId
        });
        renderChatMessages();
        console.log('[realtime] renderChatMessages done from realtime', {
          messageCount: state.messages.length,
          attemptId
        });
      };

      const groupFilter = `group_id=eq.${groupId}`;
      const channelTopic = `group-realtime:${groupId}`;
      const messageBinding = { event: '*', schema: 'public', table: 'messages', filter: groupFilter };
      console.log('[realtime] subscribe attempt start', {
        attemptId,
        userId: state.currentUser?.id || null,
        membershipGroupId: state.currentMembership?.group_id || null,
        currentGroupId: state.currentGroup?.id || null,
        hasAccessToken: !!sessionAccessToken,
        channelTopic,
        messagesOnlyMode: REALTIME_MESSAGES_ONLY_MODE,
        bindings: [messageBinding]
      });
      const channel = supabaseClient
        .channel(channelTopic)
        .on('postgres_changes', messageBinding, async (payload) => {
          await handleMessagesRealtimePayload(payload);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'tasks',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'tasks', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('tasks', async () => {
            await loadTasks();
            recalculateContributions();
            renderTasks();
            renderCompletedTasks();
            renderNearestDue();
            renderProgress();
            renderSnapshots();
            updateStatusChips();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'alerts',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'alerts', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('alerts', async () => {
            await loadAlerts();
            await loadMessages();
            renderAlerts();
            renderChatMessages();
            renderSnapshots();
            updateStatusChips();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_reads' }, async (payload) => {
          const alertId = getAlertIdFromPayload(payload);
          const alertKnownInState = !!state.alerts.find((alert) => String(alert.id) === String(alertId));
          if (!alertKnownInState && !state.isHydratingInitialData) {
            console.log('[realtime] event skipped', {
              table: 'alert_reads',
              reason: 'unknown-alert-id',
              alertId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', {
            table: 'alert_reads',
            groupId,
            alertId,
            eventType: payload?.eventType || null
          });
          await runRealtimeHandler('alerts', async () => {
            await loadAlerts();
            await loadMessages();
            renderAlerts();
            renderChatMessages();
            renderSnapshots();
            updateStatusChips();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'resources', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'resources',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'resources', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('resources', async () => {
            await loadResources();
            await loadMessages();
            recalculateContributions();
            renderResources();
            populateResourceTypeFilter();
            renderChatMessages();
            renderProgress();
            renderSnapshots();
            updateStatusChips();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_blocks', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'availability_blocks',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'availability_blocks', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('availability_blocks', async () => {
            await loadAvailabilityBlocks();
            if (state.currentView === 'timetable') {
              renderSchedule();
            }
            syncMeetingRecommendationUI();
            renderSnapshots();
            updateStatusChips();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_members', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'group_members',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'group_members', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('group_members', async () => {
            await loadMembers();
            await ensureGroupContentKey(state.currentGroup?.id);
            await Promise.all([
              loadTasks(),
              loadAlerts(),
              loadResources(),
              loadAvailabilityBlocks()
            ]);
            await loadMessages();
            renderAvatars();
            populateMemberSelects();
            refreshAll();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'member_public_keys' }, async (payload) => {
          const payloadUserId = payload?.new?.user_id || payload?.old?.user_id || null;
          const isCurrentGroupMember = !!state.memberByDbId.get(payloadUserId);
          if (!isCurrentGroupMember && !state.isHydratingInitialData) {
            console.log('[realtime] event skipped', {
              table: 'member_public_keys',
              reason: 'non-member-key',
              payloadUserId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', {
            table: 'member_public_keys',
            groupId,
            payloadUserId,
            eventType: payload?.eventType || null
          });
          await runRealtimeHandler('member_public_keys', async () => {
            await ensureGroupContentKey(state.currentGroup?.id);
            await loadMessages();
            renderChatMessages();
          });
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'group_key_envelopes', filter: groupFilter }, async (payload) => {
          const payloadGroupId = getPayloadGroupId(payload);
          if (payloadGroupId && payloadGroupId !== groupId) {
            console.log('[realtime] event skipped', {
              table: 'group_key_envelopes',
              reason: 'group-mismatch',
              payloadGroupId,
              groupId
            });
            return;
          }
          console.log('[realtime] event accepted', { table: 'group_key_envelopes', groupId, eventType: payload?.eventType || null });
          await runRealtimeHandler('group_key_envelopes', async () => {
            delete state.groupContentKeys[groupId];
            await ensureGroupContentKey(state.currentGroup?.id);
            await loadMessages();
            renderChatMessages();
          });
        });

      const { status, latestStatus } = await waitForRealtimeSubscribed(channel, groupId, attemptId);
      const isLatestAttempt = state.realtimeAttemptSeq === attemptId;

      if (status !== 'SUBSCRIBED' && !(!isLatestAttempt && latestStatus === 'SUBSCRIBED')) {
        console.error('subscribeToGroupRealtime failed', status, {
          attemptId,
          latestStatus,
          isLatestAttempt
        });
        await supabaseClient.removeChannel(channel);
        state.realtimePendingGroupId = null;
        scheduleRealtimeRetry(groupId, status);
        return;
      }

      if (!isLatestAttempt) {
        console.warn('[realtime] late success ignored because a newer attempt exists', {
          attemptId,
          currentAttemptId: state.realtimeAttemptSeq
        });
      }

      state.realtimeChannels = [channel];
      state.realtimeGroupId = groupId;
      state.realtimePendingGroupId = null;
      state.realtimeRetryCount = 0;
      clearRealtimeRetryTimer();
    }


    async function flushPendingRealtimeTables() {
      if (!state.pendingRealtimeTables || state.pendingRealtimeTables.size === 0) return;
      const pending = Array.from(state.pendingRealtimeTables);
      state.pendingRealtimeTables.clear();

      if (pending.includes('group_members')) {
        await loadMembers();
        await ensureGroupContentKey(state.currentGroup?.id);
      }
      if (pending.includes('member_public_keys')) {
        await ensureGroupContentKey(state.currentGroup?.id);
      }
      if (pending.includes('group_key_envelopes')) {
        if (state.currentGroup?.id) {
          delete state.groupContentKeys[state.currentGroup.id];
        }
        await ensureGroupContentKey(state.currentGroup?.id);
      }

      if (pending.includes('alerts')) {
        await loadAlerts();
        await loadMessages();
        renderAlerts();
        renderChatMessages();
      } else if (pending.includes('messages')) {
        await loadMessages();
        renderChatMessages();
      }

      if (pending.includes('tasks')) {
        await loadTasks();
      }
      if (pending.includes('resources')) {
        await loadResources();
      }
      if (pending.includes('availability_blocks')) {
        await loadAvailabilityBlocks();
        if (state.currentView === 'timetable') {
          renderSchedule();
        }
      }

      recalculateContributions();
      renderTasks();
      renderCompletedTasks();
      renderResources();
      populateResourceTypeFilter();
      renderNearestDue();
      renderProgress();
      renderSnapshots();
      updateStatusChips();
      syncMeetingRecommendationUI();
    }
