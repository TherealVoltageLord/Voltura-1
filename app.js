const express = require("express");
const mongoose = require("mongoose");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(limiter);

const MONGODB_URI = process.env.MONGODB_URI;
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB Error:", err));

const activeUsers = new Map();
io.on("connection", (socket) => {
  socket.on("user-online", (userId) => {
    activeUsers.set(userId, socket.id);
    io.emit("online-users", Array.from(activeUsers.keys()));
  });

  socket.on("join-chat", (chatId) => socket.join(chatId));
  socket.on("send-message", (data) => io.to(data.chatId).emit("new-message", data));
  socket.on("typing", (data) => socket.to(data.chatId).emit("user-typing", data));
  socket.on("like-notification", (data) => {
    const recipientSocket = activeUsers.get(data.userId);
    if (recipientSocket) io.to(recipientSocket).emit("new-like", data);
  });

  socket.on("disconnect", () => {
    for (const [userId, socketId] of activeUsers.entries()) {
      if (socketId === socket.id) {
        activeUsers.delete(userId);
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

app.use((req, res) => res.status(404).json({ success: false, message: "Not Found" }));
app.use((err, req, res, next) => res.status(500).json({ success: false, message: "Server Error" }));

server.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));
