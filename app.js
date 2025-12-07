const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const geoip = require('geoip-lite');
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static("public"));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 500 });
app.use(limiter);

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("✅ MongoDB Atlas Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

const activeUsers = new Map();
const typingUsers = new Map();

io.on("connection", (socket) => {
  socket.on("user-online", (userId) => {
    activeUsers.set(userId, socket.id);
    io.emit("online-users", Array.from(activeUsers.keys()));
  });

  socket.on("join-chat", (chatId) => {
    socket.join(chatId);
  });

  socket.on("send-message", (data) => {
    io.to(data.chatId).emit("new-message", data);
  });

  socket.on("typing-start", ({ chatId, userId, username }) => {
    typingUsers.set(userId, { chatId, username });
    socket.to(chatId).emit("user-typing", { userId, username });
  });

  socket.on("typing-stop", ({ userId }) => {
    typingUsers.delete(userId);
  });

  socket.on("like-notification", (data) => {
    const recipientSocket = activeUsers.get(data.userId);
    if (recipientSocket) {
      io.to(recipientSocket).emit("new-like", data);
    }
  });

  socket.on("new-follower", (data) => {
    const recipientSocket = activeUsers.get(data.userId);
    if (recipientSocket) {
      io.to(recipientSocket).emit("new-follower-notification", data);
    }
  });

  socket.on("new-comment-notification", (data) => {
    const recipientSocket = activeUsers.get(data.userId);
    if (recipientSocket) {
      io.to(recipientSocket).emit("new-comment", data);
    }
  });

  socket.on("admin-alert", (data) => {
    io.emit("admin-broadcast", data);
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
        typingUsers.delete(userId);
        io.emit("online-users", Array.from(activeUsers.keys()));
        break;
      }
    }
  });
});

app.set("socketio", io);

const authRoutes = require("./auth");
const postRoutes = require("./posts");
const socialRoutes = require("./social");
const adminRoutes = require("./admin");

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/social", socialRoutes);
app.use("/api/admin", adminRoutes);

app.get("/api/stats", async (req, res) => {
  try {
    const User = mongoose.model('User');
    const Post = mongoose.model('Post');
    
    const totalUsers = await User.countDocuments();
    const totalPosts = await Post.countDocuments();
    const onlineUsers = activeUsers.size;
    
    res.json({ totalUsers, totalPosts, onlineUsers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: "Internal server error" });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🔧 Admin login: Voltage / Voltage6#`);
});
