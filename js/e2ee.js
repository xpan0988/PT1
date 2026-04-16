// MVP E2EE helpers (browser-global, no build tools).
// This first pass stores private key material in localStorage for simplicity.
// Tradeoff: localStorage is convenient for MVP but not the strongest key storage model.

const E2EE_STORAGE_PREFIX = 'studymesh.e2ee.userkey';
const E2EE_KEY_VERSION = 1;
const E2EE_MESSAGE_ENCRYPTION_VERSION = 'aes-gcm-v1';
const E2EE_ENVELOPE_ENCRYPTION_VERSION = 'rsa-oaep-v1';
const E2EE_DECRYPT_FAIL_PLACEHOLDER = 'Unable to decrypt message';

function e2eeUserStorageKey(userId) {
  return `${E2EE_STORAGE_PREFIX}.${userId}`;
}

function bytesToBase64(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  arr.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(String(base64 || ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function textToBytes(text) {
  return new TextEncoder().encode(String(text || ''));
}

function bytesToText(bytes) {
  return new TextDecoder().decode(bytes);
}

async function importUserPublicKeyFromRecord(publicKeyRecord) {
  if (!publicKeyRecord) return null;

  const rawPublicKey = publicKeyRecord.public_key || publicKeyRecord.publicKey || publicKeyRecord.key;
  if (!rawPublicKey) return null;

  const jwk = typeof rawPublicKey === 'string' ? JSON.parse(rawPublicKey) : rawPublicKey;
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'RSA-OAEP',
      hash: 'SHA-256'
    },
    true,
    ['encrypt']
  );
}

async function loadLocalPrivateKey(userId) {
  if (!userId) return null;

  if (state.userKeypair?.userId === userId?.toString() && state.userKeypair.privateKey) {
    return state.userKeypair.privateKey;
  }

  const storedRaw = localStorage.getItem(e2eeUserStorageKey(userId));
  if (!storedRaw) return null;

  try {
    const stored = JSON.parse(storedRaw);
    if (!stored?.privateJwk || !stored?.publicJwk) return null;

    const privateKey = await crypto.subtle.importKey(
      'jwk',
      stored.privateJwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['decrypt']
    );

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      stored.publicJwk,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      true,
      ['encrypt']
    );

    state.userKeypair = {
      userId: String(userId),
      privateKey,
      publicKey,
      publicJwk: stored.publicJwk
    };
    state.userKeypairReady = true;

    return privateKey;
  } catch (error) {
    console.error('loadLocalPrivateKey failed', error);
    return null;
  }
}

async function upsertUserPublicKey(userId, publicKeyJwk, keyVersion = E2EE_KEY_VERSION) {
  if (!userId || !publicKeyJwk) return;
  await upsertMemberPublicKey(userId, publicKeyJwk, keyVersion);
}

async function ensureLocalUserKeypair(userId = state.currentUser?.id) {
  if (!userId) return null;

  const existingPrivateKey = await loadLocalPrivateKey(userId);
  if (existingPrivateKey && state.userKeypair?.publicJwk) {
    await upsertUserPublicKey(userId, state.userKeypair.publicJwk, E2EE_KEY_VERSION);
    return state.userKeypair;
  }

  const generated = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256'
    },
    true,
    ['encrypt', 'decrypt']
  );

  const publicJwk = await crypto.subtle.exportKey('jwk', generated.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', generated.privateKey);

  localStorage.setItem(e2eeUserStorageKey(userId), JSON.stringify({
    version: 1,
    algorithm: 'RSA-OAEP-256',
    publicJwk,
    privateJwk,
    createdAt: new Date().toISOString()
  }));

  state.userKeypair = {
    userId: String(userId),
    privateKey: generated.privateKey,
    publicKey: generated.publicKey,
    publicJwk
  };
  state.userKeypairReady = true;

  await upsertUserPublicKey(userId, publicJwk, E2EE_KEY_VERSION);
  return state.userKeypair;
}

async function importGroupContentKey(rawKeyBytes) {
  return await crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function decryptGroupKeyEnvelope(envelopeRecord, privateKey) {
  if (!envelopeRecord || !privateKey) return null;
  const ciphertext = envelopeRecord.ciphertext || envelopeRecord.encrypted_key;
  if (!ciphertext) return null;

  const decryptedRaw = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    base64ToBytes(ciphertext)
  );

  return await importGroupContentKey(decryptedRaw);
}

async function bootstrapGroupKeyEnvelopes(groupId, memberIds) {
  if (!groupId || !memberIds || memberIds.length === 0) {
    throw new Error('Cannot bootstrap group key without group and members');
  }

  const groupKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const rawGroupKey = new Uint8Array(await crypto.subtle.exportKey('raw', groupKey));

  const publicKeyRows = await getMemberPublicKeys(memberIds);
  const publicKeyByUserId = new Map((publicKeyRows || []).map(row => [row.user_id, row]));

  const envelopeRows = [];
  for (const memberId of memberIds) {
    const keyRow = publicKeyByUserId.get(memberId);
    if (!keyRow) {
      console.warn('Skipping envelope creation; member has no public key yet', { groupId, memberId });
      continue;
    }

    const memberPublicKey = await importUserPublicKeyFromRecord(keyRow);
    const wrappedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      memberPublicKey,
      rawGroupKey
    );

    envelopeRows.push({
      group_id: groupId,
      user_id: memberId,
      key_version: E2EE_KEY_VERSION,
      encryption_version: E2EE_ENVELOPE_ENCRYPTION_VERSION,
      ciphertext: bytesToBase64(wrappedKey),
      nonce: null
    });
  }

  if (envelopeRows.length === 0) {
    throw new Error('No member public keys available to bootstrap group envelopes');
  }

  await upsertGroupKeyEnvelopes(envelopeRows);
  return groupKey;
}

async function ensureGroupContentKey(groupId = state.currentGroup?.id) {
  if (!groupId || !state.currentUser?.id) return null;

  if (!state.groupContentKeys) state.groupContentKeys = {};
  if (state.groupContentKeys[groupId]) {
    return state.groupContentKeys[groupId];
  }

  await ensureLocalUserKeypair(state.currentUser.id);
  const privateKey = await loadLocalPrivateKey(state.currentUser.id);

  let envelope = await getMyGroupKeyEnvelope(groupId, state.currentUser.id, E2EE_KEY_VERSION);

  if (!envelope) {
    const existingEnvelopeCount = await getGroupKeyEnvelopeCount(groupId, E2EE_KEY_VERSION);
    if (existingEnvelopeCount === 0) {
      const memberIds = state.members.map(member => member.dbId).filter(Boolean);
      await bootstrapGroupKeyEnvelopes(groupId, memberIds);
      envelope = await getMyGroupKeyEnvelope(groupId, state.currentUser.id, E2EE_KEY_VERSION);
    } else {
      throw new Error('Missing group key envelope for current user in an existing encrypted group');
    }
  }

  if (!envelope) {
    throw new Error('Missing group key envelope for current user');
  }

  const groupKey = await decryptGroupKeyEnvelope(envelope, privateKey);
  state.groupContentKeys[groupId] = groupKey;
  return groupKey;
}

async function getDecryptedGroupKey(groupId = state.currentGroup?.id) {
  return await ensureGroupContentKey(groupId);
}

async function encryptGroupMessageText(groupId, plaintext) {
  const groupKey = await ensureGroupContentKey(groupId);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    groupKey,
    textToBytes(plaintext)
  );

  return {
    ciphertext: bytesToBase64(ciphertext),
    nonce: bytesToBase64(nonce),
    keyVersion: E2EE_KEY_VERSION,
    encryptionVersion: E2EE_MESSAGE_ENCRYPTION_VERSION
  };
}

async function decryptMessageRecord(messageRecord, groupKey) {
  if (!messageRecord?.is_encrypted) {
    return messageRecord?.text || '';
  }

  const ciphertext = messageRecord.ciphertext;
  const nonce = messageRecord.nonce;
  if (!ciphertext || !nonce) {
    return E2EE_DECRYPT_FAIL_PLACEHOLDER;
  }

  try {
    const resolvedGroupKey = groupKey || await ensureGroupContentKey(messageRecord.group_id || state.currentGroup?.id);
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(nonce) },
      resolvedGroupKey,
      base64ToBytes(ciphertext)
    );
    return bytesToText(new Uint8Array(decrypted));
  } catch (error) {
    console.warn('decryptMessageRecord failed', error);
    return E2EE_DECRYPT_FAIL_PLACEHOLDER;
  }
}

async function getRenderableMessageText(messageRecord) {
  if (!messageRecord?.is_encrypted) {
    return messageRecord?.text || '';
  }
  return await decryptMessageRecord(messageRecord);
}

async function createEncryptedChatMessage(groupId, senderUserId, plaintext) {
  const encrypted = await encryptGroupMessageText(groupId, plaintext);

  return await createMessageRecord({
    group_id: groupId,
    sender_user_id: senderUserId,
    type: 'text',
    text: null,
    is_encrypted: true,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    key_version: encrypted.keyVersion,
    encryption_version: encrypted.encryptionVersion
  });
}
