const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const sharp = require("sharp");

const Post = mongoose.model("Post", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  image: String,
  video: String,
  caption: String,
  location: String,
  tags: [String],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  likeCount: { type: Number, default: 0 },
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    text: String,
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    replies: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      text: String,
      timestamp: { type: Date, default: Date.now }
    }],
    timestamp: { type: Date, default: Date.now }
  }],
  shares: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  shareCount: { type: Number, default: 0 },
  saves: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
}));

const storage = multer.diskStorage({
  destination: "public/uploads/posts",
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 10000000 } });

router.post("/", upload.single("media"), async (req, res) => {
  try {
    const post = new Post({
      userId: req.user._id,
      caption: req.body.caption,
      location: req.body.location,
      tags: req.body.tags ? JSON.parse(req.body.tags) : []
    });

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video");
      if (isVideo) {
        post.video = `/uploads/posts/${req.file.filename}`;
      } else {
        const thumbnail = await sharp(req.file.path).resize(1080, 1350).toFile(`public/uploads/posts/thumb_${req.file.filename}`);
        post.image = `/uploads/posts/thumb_${req.file.filename}`;
      }
    }

    await post.save();
    await mongoose.model("User").findByIdAndUpdate(req.user._id, { $inc: { postsCount: 1 } });
    res.json(post);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/feed", async (req, res) => {
  try {
    const user = await mongoose.model("User").findById(req.user._id);
    const followingIds = [...user.following, req.user._id];
    
    const posts = await Post.find({ userId: { $in: followingIds } })
      .populate("userId", "username profilePic")
      .populate("likes", "username profilePic")
      .sort({ createdAt: -1 })
      .limit(20);
    
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/like", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const userId = req.user._id;
    
    const alreadyLiked = post.likes.includes(userId);
    if (alreadyLiked) {
      post.likes.pull(userId);
      post.likeCount -= 1;
    } else {
      post.likes.push(userId);
      post.likeCount += 1;
    }
    
    await post.save();
    
    if (!alreadyLiked && post.userId.toString() !== userId.toString()) {
      const io = req.app.get("socketio");
      io.to(post.userId.toString()).emit("new-like", {
        postId: post._id,
        userId: userId,
        username: req.user.username
      });
    }
    
    res.json({ liked: !alreadyLiked, count: post.likeCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/comment", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    post.comments.push({
      userId: req.user._id,
      text: req.body.text
    });
    
    await post.save();
    
    if (post.userId.toString() !== req.user._id.toString()) {
      const io = req.app.get("socketio");
      io.to(post.userId.toString()).emit("new-comment", {
        postId: post._id,
        userId: req.user._id,
        username: req.user.username,
        text: req.body.text
      });
    }
    
    const comment = post.comments[post.comments.length - 1];
    await comment.populate("userId", "username profilePic");
    res.json(comment);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/share", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const userId = req.user._id;
    
    if (!post.shares.includes(userId)) {
      post.shares.push(userId);
      post.shareCount += 1;
      await post.save();
    }
    
    res.json({ shared: true, count: post.shareCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/:id/save", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    const userId = req.user._id;
    
    const alreadySaved = post.saves.includes(userId);
    if (alreadySaved) {
      post.saves.pull(userId);
    } else {
      post.saves.push(userId);
    }
    
    await post.save();
    res.json({ saved: !alreadySaved });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/explore", async (req, res) => {
  try {
    const posts = await Post.find()
      .populate("userId", "username profilePic")
      .sort({ likeCount: -1 })
      .limit(50);
    
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
