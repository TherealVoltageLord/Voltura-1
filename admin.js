const router = require("express").Router();
const mongoose = require("mongoose");

const User = mongoose.model("User");
const Post = mongoose.model("Post");
const Chat = mongoose.model("Chat");
const Story = mongoose.model("Story");

const adminAuth = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: "Admin access required" });
  next();
};

router.use(adminAuth);

router.get("/dashboard", async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPosts = await Post.countDocuments();
    const totalStories = await Story.countDocuments();
    const activeUsers = await User.countDocuments({ lastLogin: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } });
    
    const userGrowth = await User.aggregate([
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
      { $limit: 7 }
    ]);
    
    const postStats = await Post.aggregate([
      { $group: { _id: null, totalLikes: { $sum: "$likeCount" }, totalComments: { $sum: { $size: "$comments" } } } }
    ]);
    
    res.json({
      totalUsers, totalPosts, totalStories, activeUsers,
      userGrowth, postStats: postStats[0] || { totalLikes: 0, totalComments: 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/users", async (req, res) => {
  try {
    const { page = 1, limit = 20, search = "" } = req.query;
    const skip = (page - 1) * limit;
    
    const query = search ? {
      $or: [
        { username: new RegExp(search, "i") },
        { email: new RegExp(search, "i") }
      ]
    } : {};
    
    const users = await User.find(query)
      .select("-password")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await User.countDocuments(query);
    
    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/posts", async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    
    const posts = await Post.find()
      .populate("userId", "username profilePic")
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
    
    const total = await Post.countDocuments();
    
    res.json({ posts, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/posts/:id", async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/users/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    await User.findByIdAndUpdate(req.params.id, { accountStatus: status });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/reports", async (req, res) => {
  try {
    const reports = await Report.find()
      .populate("reporter", "username")
      .populate("targetUser", "username")
      .populate("targetPost", "caption")
      .sort({ createdAt: -1 });
    
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
