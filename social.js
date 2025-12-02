const router = require("express").Router();
const mongoose = require("mongoose");

const Chat = mongoose.model("Chat", new mongoose.Schema({
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    image: String,
    read: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
  }],
  lastMessage: Date
}));

const Story = mongoose.model("Story", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  media: String,
  mediaType: String,
  caption: String,
  views: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) },
  createdAt: { type: Date, default: Date.now }
}));

router.post("/follow/:userId", async (req, res) => {
  try {
    const targetUser = await mongoose.model("User").findById(req.params.userId);
    const currentUser = await mongoose.model("User").findById(req.user._id);
    
    if (!targetUser) return res.status(404).json({ error: "User not found" });
    
    const isFollowing = currentUser.following.includes(req.params.userId);
    if (isFollowing) {
      currentUser.following.pull(req.params.userId);
      targetUser.followers.pull(req.user._id);
    } else {
      currentUser.following.push(req.params.userId);
      targetUser.followers.push(req.user._id);
    }
    
    await currentUser.save();
    await targetUser.save();
    
    res.json({ following: !isFollowing, followers: targetUser.followers.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/messages", async (req, res) => {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate("participants", "username profilePic")
      .sort({ lastMessage: -1 });
    
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/messages/:userId", async (req, res) => {
  try {
    const chat = await Chat.findOne({
      participants: { $all: [req.user._id, req.params.userId] }
    }).populate("participants", "username profilePic");
    
    if (!chat) {
      const newChat = new Chat({
        participants: [req.user._id, req.params.userId]
      });
      await newChat.save();
      await newChat.populate("participants", "username profilePic");
      return res.json(newChat);
    }
    
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/messages/:userId", async (req, res) => {
  try {
    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, req.params.userId] }
    });
    
    if (!chat) {
      chat = new Chat({
        participants: [req.user._id, req.params.userId]
      });
    }
    
    chat.messages.push({
      sender: req.user._id,
      text: req.body.text,
      image: req.body.image
    });
    
    chat.lastMessage = new Date();
    await chat.save();
    
    const io = req.app.get("socketio");
    io.to(req.params.userId.toString()).emit("new-message", {
      chatId: chat._id,
      sender: req.user._id,
      text: req.body.text
    });
    
    res.json(chat.messages[chat.messages.length - 1]);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/stories", async (req, res) => {
  try {
    const story = new Story({
      userId: req.user._id,
      media: req.body.media,
      mediaType: req.body.mediaType,
      caption: req.body.caption
    });
    
    await story.save();
    res.json(story);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/stories", async (req, res) => {
  try {
    const user = await mongoose.model("User").findById(req.user._id);
    const followingIds = [...user.following, req.user._id];
    
    const stories = await Story.find({
      userId: { $in: followingIds },
      expiresAt: { $gt: new Date() }
    })
    .populate("userId", "username profilePic")
    .sort({ createdAt: -1 });
    
    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/stories/:id/view", async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story.views.includes(req.user._id)) {
      story.views.push(req.user._id);
      await story.save();
    }
    res.json({ viewed: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/suggestions", async (req, res) => {
  try {
    const user = await mongoose.model("User").findById(req.user._id);
    
    const suggestions = await mongoose.model("User").find({
      _id: { $nin: [...user.following, user._id] },
      followers: { $size: { $gte: 10 } }
    })
    .select("username profilePic followers")
    .limit(10);
    
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
