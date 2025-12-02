const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const Joi = require("joi");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://lostboytech1:n1n2nanaagye@cluster0.yqp30.mongodb.net/luminangl?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log("✅ Connected to MongoDB Atlas"))
.catch(err => console.error("❌ MongoDB connection error:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 6 },
  bio: { type: String, default: "", maxlength: 500 },
  profilePic: { type: String, default: "/uploads/profile_pics/default.png" },
  coverPhoto: { type: String, default: "/uploads/covers/default.jpg" },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }],
  notifications: [{
    type: { type: String, enum: ['welcome', 'like', 'follow', 'comment', 'share', 'reply'], required: true },
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    read: { type: Boolean, default: false }
  }],
  privacy: {
    profile: { type: String, enum: ['public', 'private'], default: 'public' },
    messages: { type: String, enum: ['everyone', 'followers_only', 'none'], default: 'everyone' },
    tags: { type: String, enum: ['everyone', 'followers_only', 'none'], default: 'everyone' }
  },
  location: {
    country: String,
    city: String,
    ip: String
  },
  status: { type: String, enum: ['active', 'suspended', 'banned', 'deleted'], default: 'active' },
  isVerified: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  adminRole: { type: String, enum: ['super_admin', 'content_mod', 'support_agent'], default: 'content_mod' },
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  createdAt: { type: Date, default: Date.now }
});

const postSchema = new mongoose.Schema({
  username: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  image: { type: String, required: true },
  caption: { type: String, maxlength: 2200 },
  hashtags: [String],
  mentions: [String],
  location: {
    name: String,
    lat: Number,
    lng: Number
  },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  dislikedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  comments: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    likes: { type: Number, default: 0 },
    likedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replies: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      username: { type: String, required: true },
      text: { type: String, required: true, maxlength: 1000 },
      timestamp: { type: Date, default: Date.now }
    }],
    timestamp: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'flagged', 'removed'], default: 'active' }
  }],
  shares: { type: Number, default: 0 },
  sharedBy: [{ 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now }
  }],
  savedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  status: { type: String, enum: ['active', 'flagged', 'removed', 'archived'], default: 'active' },
  flags: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    timestamp: { type: Date, default: Date.now }
  }],
  timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);

const profilePicStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public/uploads/profile_pics")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});

const coverStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public/uploads/covers")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});

const postStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public/uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);
  if (mimetype && extname) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

const profilePicUpload = multer({ 
  storage: profilePicStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter 
});

const coverUpload = multer({ 
  storage: coverStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter 
});

const upload = multer({ 
  storage: postStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter 
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  bio: Joi.string().max(500).optional().allow('')
});

const loginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required()
});

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: "Access token required" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    req.user = user;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};

app.post("/register", profilePicUpload.single("profilePic"), async (req, res) => {
  try {
    const { error } = registerSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    const { username, email, password, bio } = req.body;
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) return res.status(400).json({ success: false, message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 12);
    const profilePicUrl = req.file ? `/uploads/profile_pics/${req.file.filename}` : "/uploads/profile_pics/default.png";
    const newUser = new User({
      username, email, password: hashedPassword, bio: bio || "", profilePic: profilePicUrl,
      notifications: [{ type: "welcome", message: "Welcome to Voltura! 🎉", timestamp: new Date() }],
      location: { ip: req.ip }
    });
    await newUser.save();
    const token = jwt.sign({ userId: newUser._id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '24h' });
    res.json({ success: true, message: "Registration successful!", token, user: { id: newUser._id, username: newUser.username, email: newUser.email, bio: newUser.bio, profilePic: newUser.profilePic, followers: newUser.followers, following: newUser.following } });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { error } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ success: false, message: error.details[0].message });
    const { username, password } = req.body;
    const user = await User.findOne({ $or: [{ email: username }, { username: username }] });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ success: false, message: "Invalid credentials" });
    user.lastLogin = new Date();
    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET || 'fallback-secret', { expiresIn: '24h' });
    res.json({ success: true, message: "Login successful!", token, user: { id: user._id, username: user.username, email: user.email, bio: user.bio, profilePic: user.profilePic, followers: user.followers, following: user.following, isAdmin: user.isAdmin } });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.get("/posts", async (req, res) => {
  try {
    const { page = 1, limit = 10, username, hashtag } = req.query;
    const skip = (page - 1) * limit;
    let query = { status: 'active' };
    if (username) query.username = username;
    if (hashtag) query.hashtags = hashtag;
    const posts = await Post.find(query)
      .populate('userId', 'username profilePic privacy')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await Post.countDocuments(query);
    res.json({ posts, currentPage: parseInt(page), totalPages: Math.ceil(total / limit), totalPosts: total });
  } catch (error) {
    console.error("Get posts error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.post("/upload", authenticateToken, upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded" });
    const { caption, hashtags, location } = req.body;
    
    const hashtagArray = hashtags ? hashtags.split(',').map(tag => tag.trim().replace('#', '')) : [];
    const mentionArray = (caption.match(/@(\w+)/g) || []).map(mention => mention.replace('@', ''));
    
    const newPost = new Post({
      username: req.user.username,
      userId: req.user._id,
      image: `/uploads/${req.file.filename}`,
      caption: caption || "",
      hashtags: hashtagArray,
      mentions: mentionArray,
      location: location ? JSON.parse(location) : {}
    });
    
    await newPost.save();
    await newPost.populate('userId', 'username profilePic');
    res.json({ success: true, message: "Post uploaded successfully!", post: newPost });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
});
