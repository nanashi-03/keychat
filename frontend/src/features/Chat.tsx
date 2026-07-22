import React, { useState, useEffect } from 'react';
import { useAuth } from '../core/useAuth';
import { useWebSocket } from '../core/useWebSocket';
import { cryptoService } from '../crypto/wasm-crypto';
import { idbService } from '../core/indexed-db';
import { Plus, Hash, LogOut } from 'lucide-react';

interface Message {
  id: string;
  room_id: string;
  sender_username: string;
  plainText: string;
  created_at: string;
}

interface Room {
  id: string;
  name: string;
  messages: Message[];
}

interface RoomResponse {
  id: string;
  name: string;
  created_at?: string;
}

interface EncryptedWSMessage {
  id: string;
  room_id: string;
  sender_username: string;
  cipher_blob: string;
  nonce: string;
  created_at: string;
}

export const Chat: React.FC = () => {
  const { user, token, logout } = useAuth();
  const { subscribe } = useWebSocket();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [inputText, setInputText] = useState('');
  const [sessionKey, setSessionKey] = useState<CryptoKey | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  useEffect(() => {
    async function initCrypto() {
      await cryptoService.initWasm();
      const key = await cryptoService.deriveKey('user-master-password', 'keychat-salt');
      setSessionKey(key);
    }
    initCrypto();
  }, []);

  // Fetch Rooms
  useEffect(() => {
    async function fetchRooms() {
      if (!token) return;
      try {
        const res = await fetch('/api/v1/rooms/', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data: RoomResponse[] = await res.json();
          const mapped: Room[] = data.map((r) => ({ ...r, messages: [] }));
          setRooms(mapped);

          if (mapped.length > 0) {
            setActiveRoom((prevActive) => prevActive ?? mapped[0]);
          }
        }
      } catch (err) {
        console.error('Failed to fetch rooms:', err);
      }
    }
    fetchRooms();
  }, [token]);

  // WebSocket Subscription
  useEffect(() => {
    if (!sessionKey) return;

    const unsubscribe = subscribe(async (message) => {
      const rawPayload = message as unknown as EncryptedWSMessage;

      try {
        const decryptedText = await cryptoService.decryptText(
          { cipherBlob: rawPayload.cipher_blob, nonce: rawPayload.nonce },
          sessionKey
        );

        const newMsg: Message = {
          id: rawPayload.id,
          room_id: rawPayload.room_id,
          sender_username: rawPayload.sender_username,
          plainText: decryptedText,
          created_at: rawPayload.created_at
        };

        await idbService.cacheDecryptedMessage(newMsg.id, newMsg.plainText);

        setRooms((prevRooms) =>
          prevRooms.map((r) =>
            r.id === newMsg.room_id
              ? { ...r, messages: [...r.messages, newMsg] }
              : r
          )
        );
      } catch (err) {
        console.error('Error decrypting message payload:', err);
      }
    });

    return () => unsubscribe();
  }, [sessionKey, subscribe]);

  // Form Event handling typed with React.FormEvent<HTMLFormElement>
  const handleCreateRoom = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newRoomName.trim() || !token) return;

    try {
      const res = await fetch('/api/v1/rooms/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newRoomName.trim() })
      });

      if (res.ok) {
        const createdRoom: RoomResponse = await res.json();
        const roomObj: Room = { ...createdRoom, messages: [] };
        setRooms((prev) => [...prev, roomObj]);
        setActiveRoom(roomObj);
        setNewRoomName('');
        setShowModal(false);
      }
    } catch (err) {
      console.error('Failed to create room:', err);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !activeRoom || !sessionKey || !token) return;

    const encrypted = await cryptoService.encryptText(inputText, sessionKey);

    await fetch('/api/v1/messages/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        room_id: activeRoom.id,
        cipher_blob: encrypted.cipherBlob,
        nonce: encrypted.nonce
      })
    });

    setInputText('');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h3>KeyChat</h3>
          <span>@{user?.username}</span>
        </div>

        <div className="section-title">
          <span>Rooms</span>
          <button className="icon-btn" onClick={() => setShowModal(true)} title="Create Room">
            <Plus size={18} />
          </button>
        </div>

        <button
          className="primary-btn sidebar-create-btn"
          onClick={() => setShowModal(true)}
        >
          <Plus size={16} /> Create Room
        </button>

        <div className="room-list">
          {rooms.length > 0 ? (
            rooms.map((room) => (
              <div
                key={room.id}
                className={`room-item ${activeRoom?.id === room.id ? 'active' : ''}`}
                onClick={() => setActiveRoom(room)}
              >
                <Hash size={16} />
                <span>{room.name}</span>
              </div>
            ))
          ) : (
            <div className="room-list-empty">
              No rooms yet. Create one to start chatting.
            </div>
          )}
        </div>

        <button onClick={logout} className="logout-btn">
          <LogOut size={16} /> Logout
        </button>
      </aside>

      <main className="chat-window">
        {activeRoom ? (
          <>
            <header className="chat-header">
              <h2>#{activeRoom.name}</h2>
              <span className="badge">🔒 E2E Encrypted</span>
            </header>

            <div className="messages-container">
              {activeRoom.messages.map((m) => (
                <div
                  key={m.id}
                  className={`message-bubble ${m.sender_username === user?.username ? 'me' : ''}`}
                >
                  <div className="meta">{m.sender_username}</div>
                  <div className="text">{m.plainText}</div>
                </div>
              ))}
            </div>

            <footer className="input-bar">
              <input
                type="text"
                placeholder="Type an encrypted message..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              />
              <button onClick={sendMessage}>Send</button>
            </footer>
          </>
        ) : (
          <div className="empty-state">
            <h2>No room selected</h2>
            <p>Create a room to start sending encrypted messages.</p>
            <button className="primary-btn" onClick={() => setShowModal(true)}>
              <Plus size={16} /> Create your first room
            </button>
          </div>
        )}
      </main>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Create New Chat Room</h3>
            <form onSubmit={handleCreateRoom}>
              <input
                type="text"
                placeholder="Room Name"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                autoFocus
                required
              />
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="primary-btn">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
