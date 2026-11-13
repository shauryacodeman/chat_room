// --- Socket.IO Connection ---
const socket = io("https://chat-room-37nx.onrender.com");
const statusDiv = document.getElementById("connection-status");

socket.on("connect", () => {
  statusDiv.textContent = `Connected! Socket ID: ${socket.id}`;
  statusDiv.style.color = "green";
});

socket.on("disconnect", () => {
  statusDiv.textContent = "Disconnected from server.";
  statusDiv.style.color = "red";
});

// --- Authentication Logic ---
const registerBtn = document.getElementById("register-btn");
const loginBtn = document.getElementById("login-btn");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const authMessage = document.getElementById("auth-message");
const authSection = document.getElementById("auth-section");
const chatSection = document.getElementById("chat-section");

let currentUser = "";
let authToken = "";

registerBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) {
    authMessage.style.color = "red";
    authMessage.textContent = "Please enter both username and password.";
    return;
  }

  try {
    const response = await fetch(
      "https://chat-room-37nx.onrender.com/api/auth/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
    );
    const data = await response.json();
    if (response.ok) {
      authMessage.style.color = "green";
      authMessage.textContent = "Registration successful! You can now login.";
    } else {
      authMessage.style.color = "red";
      authMessage.textContent = data.message;
    }
  } catch (error) {
    authMessage.style.color = "red";
    authMessage.textContent = "Error connecting to server.";
  }
});

loginBtn.addEventListener("click", async () => {
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  try {
    const response = await fetch(
      "https://chat-room-37nx.onrender.com/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      },
    );
    const data = await response.json();
    if (response.ok) {
      authToken = data.token;
      currentUser = data.username;
      authSection.style.display = "none";
      chatSection.style.display = "block";
    } else {
      authMessage.style.color = "red";
      authMessage.textContent = data.message;
    }
  } catch (error) {
    authMessage.style.color = "red";
    authMessage.textContent = "Error connecting to server.";
  }
});

// --- Chat & Room Logic ---
const leaveRoomBtn = document.getElementById("leave-room-btn");
const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomBtn = document.getElementById("join-room-btn");
const roomInput = document.getElementById("room-id-input"); // This fixes the error!
const chatInterface = document.getElementById("chat-interface");
const currentRoomTitle = document.getElementById("current-room-title");
const chatBox = document.getElementById("chat-box");
const messageInput = document.getElementById("message-input");
const sendBtn = document.getElementById("send-btn");
const userCountDisplay = document.getElementById("user-count-display"); // For the user count

let currentRoom = "";

// Generate a random 6-character Room ID
createRoomBtn.addEventListener("click", () => {
  const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  roomInput.value = randomId;
});

// Join Room Event (Sending both room and username)
joinRoomBtn.addEventListener("click", () => {
  currentRoom = roomInput.value.trim().toUpperCase();
  if (!currentRoom) return;

  currentRoomTitle.textContent = `Room ID: ${currentRoom}`;
  chatInterface.style.display = "block";
  chatBox.innerHTML = "";

  socket.emit("joinRoom", { room: currentRoom, username: currentUser });
});

sendBtn.addEventListener("click", () => {
  const messageText = messageInput.value.trim();
  if (messageText && currentRoom) {
    socket.emit("sendMessage", {
      username: currentUser,
      room: currentRoom,
      message: messageText,
    });
    messageInput.value = "";
  }
});

messageInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendBtn.click();
});

leaveRoomBtn.addEventListener("click", () => {
  if (!currentRoom) return;

  // 1. Tell the server to remove this user from the room
  socket.emit("leaveRoom", { room: currentRoom, username: currentUser });

  // 2. Hide the chat interface and reset local variables
  chatInterface.style.display = "none";
  chatBox.innerHTML = "";
  currentRoomTitle.textContent = "";
  currentRoom = "";
});

// Helper function to render a message with an upvote button
function displayMessage(msg) {
  const messageElement = document.createElement("div");
  // Attach the MongoDB _id so we can target this specific message
  messageElement.id = `msg-${msg._id}`;
  messageElement.style.display = "flex";
  messageElement.style.justifyContent = "space-between";
  messageElement.style.alignItems = "center";
  messageElement.style.marginBottom = "10px";

  let textHTML = "";
  if (msg.sender === currentUser) {
    textHTML = `<span style="color: #2980b9;"><strong>You:</strong> ${msg.text}</span>`;
  } else {
    textHTML = `<span style="color: #333;"><strong>${msg.sender}:</strong> ${msg.text}</span>`;
  }

  // Create the Upvote button using the database upvote count
  const upvoteHTML = `
        <button onclick="triggerUpvote('${msg._id}')" style="border: 1px solid #ccc; background: #fff; padding: 4px 10px; border-radius: 12px; cursor: pointer; font-size: 12px;">
            👍 <span id="upvotes-${msg._id}">${msg.upvotes || 0}</span>
        </button>
    `;

  messageElement.innerHTML = `${textHTML} ${upvoteHTML}`;
  chatBox.appendChild(messageElement);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Global function triggered when the 👍 button is clicked
window.triggerUpvote = function (messageId) {
  // Send both the ID and the user clicking the button
  socket.emit("upvoteMessage", {
    messageId: messageId,
    username: currentUser,
  });
};

// Listen for new incoming messages
socket.on("receiveMessage", (data) => {
  displayMessage(data);
});

// Load message history when joining
socket.on("previousMessages", (messages) => {
  messages.forEach((msg) => displayMessage(msg));
});

// Listen for upvote updates from the backend
socket.on("messageUpvoted", (data) => {
  // Find the specific upvote counter span and update its number
  const upvoteSpan = document.getElementById(`upvotes-${data.messageId}`);
  if (upvoteSpan) {
    upvoteSpan.textContent = data.upvotes;
  }
});

socket.on("roomUsersUpdate", (count) => {
  userCountDisplay.textContent = `🟢 ${count} user(s) online`;
});

// --- Typing Indicator Logic ---
const typingIndicator = document.getElementById("typing-indicator");
let typingTimer;

// When the user types
messageInput.addEventListener("input", () => {
  if (!currentRoom) return;

  // Tell the server this user is typing
  socket.emit("typing", { room: currentRoom, username: currentUser });

  // Clear the previous timer
  clearTimeout(typingTimer);

  // Set a new timer to stop typing after 1.5 seconds of inactivity
  typingTimer = setTimeout(() => {
    socket.emit("stopTyping", currentRoom);
  }, 1500);
});

// Listen for other users typing
socket.on("displayTyping", (username) => {
  typingIndicator.textContent = `${username} is typing...`;
});

// Listen to clear the typing indicator
socket.on("clearTyping", () => {
  typingIndicator.textContent = "";
});
