const Message = require("./models/Message");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

// Import authentication routes
const authRoutes = require("./routes/authRoutes");

const app = express();

app.use(cors());
app.use(express.json());
const server = http.createServer(app);

// Set up the API endpoint for authentication
app.use("/api/auth", authRoutes);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.log("MongoDB connection error:", err));

const io = require("socket.io")(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. Join a specific subject room
  socket.on("joinRoom", async (data) => {
    const { room, username } = data; // Now receiving both

    const currentRooms = Array.from(socket.rooms);
    currentRooms.forEach((r) => {
      if (r !== socket.id) socket.leave(r);
    });

    socket.join(room);

    // Save these to the socket object so we can reference them on disconnect
    socket.currentRoom = room;
    socket.username = username;

    console.log(`User ${username} (${socket.id}) joined room: ${room}`);

    // --- UNIQUE USER COUNT LOGIC ---
    // Fetch all socket instances in this specific room
    const socketsInRoom = await io.in(room).fetchSockets();
    const uniqueUsers = new Set();

    // Add each socket's username to the Set (Sets automatically ignore duplicates)
    socketsInRoom.forEach((s) => {
      if (s.username) uniqueUsers.add(s.username);
    });

    // Broadcast the size of the Set (the number of unique usernames)
    io.to(room).emit("roomUsersUpdate", uniqueUsers.size);
    // -------------------------------

    try {
      const messages = await Message.find({ room })
        .sort({ createdAt: 1 })
        .limit(50);
      socket.emit("previousMessages", messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  });

  // 2. Handle incoming messages
  socket.on("sendMessage", async (data) => {
    const { username, room, message } = data;
    try {
      const newMessage = new Message({ room, sender: username, text: message });
      await newMessage.save();
      io.to(room).emit("receiveMessage", newMessage);
    } catch (error) {
      console.error("Error saving message:", error);
    }
  });

  // 3. Handle upvotes (Single Upvote per User)
  socket.on("upvoteMessage", async (data) => {
    const { messageId, username } = data;

    try {
      const message = await Message.findById(messageId);
      if (!message) return;

      // Check if the user has already upvoted this message
      if (message.upvotedBy.includes(username)) {
        // User already upvoted, do nothing (or you could remove the upvote here to act as a toggle)
        return;
      }

      // Add user to the array and increment the count
      message.upvotedBy.push(username);
      message.upvotes = message.upvotedBy.length;
      const updatedMessage = await message.save();

      // Broadcast the new upvote count
      io.to(updatedMessage.room).emit("messageUpvoted", {
        messageId: updatedMessage._id,
        upvotes: updatedMessage.upvotes,
      });
    } catch (error) {
      console.error("Error upvoting message:", error);
    }
  });

  // 4. Handle Typing Indicator
  socket.on("typing", (data) => {
    // socket.to(room) sends to everyone in the room EXCEPT the sender
    socket.to(data.room).emit("displayTyping", data.username);
  });

  socket.on("stopTyping", (room) => {
    socket.to(room).emit("clearTyping");
  });

  // Handle Disconnect
  socket.on("disconnect", async () => {
    console.log(`User disconnected: ${socket.id}`);

    if (socket.currentRoom) {
      // Recalculate unique users for the room they just left
      const socketsInRoom = await io.in(socket.currentRoom).fetchSockets();
      const uniqueUsers = new Set();

      socketsInRoom.forEach((s) => {
        if (s.username) uniqueUsers.add(s.username);
      });

      io.to(socket.currentRoom).emit("roomUsersUpdate", uniqueUsers.size);
    }
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
