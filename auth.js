const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");
const geoip = require('geoip-lite');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, minlength: 3, maxlength: 30 },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: "/default-avatar.png" },
  coverPhoto: { type: String, default: "/default-cover.jpg" },
  bio: { type: String, maxlength: 500, default: "" },
  website: String,
  gender: { type: String, enum: ['male', 'female', 'other', 'prefer-not-to-say'], default: 'prefer-not-to-say' },
  privateAccount: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  verifiedByAdmin: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  adminRole: { type: String, enum: ['super_admin', 'content_mod', 'support_agent'], default: 'content_mod' },
  accountStatus: { type: String, enum: ['active', 'suspended', 'banned', 'deleted'], default: 'active' },
  suspensionReason: String,
  suspensionEnds: Date,
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  postsCount: { type: Number, default: 0 },
  location: {
    country: String,
    city: String,
    ip: String,
    lastSeen: Date
  },
  lastLogin: Date,
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const User = mongoose.model("User", userSchema);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') cb(null, "public/uploads/avatars");
    if (file.fieldname === 'cover') cb(null, "public/uploads/covers");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 5000000 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  }
});

const authenticate = async (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        error: `Account is ${user.accountStatus}`,
        reason: user.suspensionReason,
        ends: user.suspensionEnds 
      });
    }
    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

const getLocationFromIP = (ip) => {
  const geo = geoip.lookup(ip);
  return geo ? {
    country: geo.country,
    city: geo.city,
    ip: ip
  } : { ip: ip };
};

router.post("/register", upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), [
  body("username").isLength({ min: 3, max: 30 }).trim(),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const existingUser = await User.findOne({ 
      $or: [{ email: req.body.email }, { username: req.body.username }] 
    });
    
    if (existingUser) {
      return res.status(400).json({ error: "Username or email already exists" });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 12);
    const avatarFile = req.files?.avatar?.[0];
    const coverFile = req.files?.cover?.[0];
    
    const location = getLocationFromIP(req.ip);
    
    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword,
      profilePic: avatarFile ? `/uploads/avatars/${avatarFile.filename}` : "/default-avatar.png",
      coverPhoto: coverFile ? `/uploads/covers/${coverFile.filename}` : "/default-cover.jpg",
      bio: req.body.bio || "",
      gender: req.body.gender || "prefer-not-to-say",
      location: {
        ...location,
        lastSeen: new Date()
      }
    });

    await user.save();
    
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        coverPhoto: user.coverPhoto,
        bio: user.bio,
        isAdmin: user.isAdmin,
        verified: user.verified,
        followers: user.followers.length,
        following: user.following.length
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", [
  body("username").notEmpty(),
  body("password").notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const { username, password } = req.body;
    
    const user = await User.findOne({
      $or: [{ email: username }, { username: username }]
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.accountStatus !== 'active') {
      return res.status(403).json({ 
        error: `Account is ${user.accountStatus}`,
        reason: user.suspensionReason,
        ends: user.suspensionEnds 
      });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      user.loginAttempts += 1;
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(403).json({ 
        error: "Account locked due to too many failed attempts",
        unlockTime: user.lockUntil 
      });
    }

    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    user.location.lastSeen = new Date();
    user.location.ip = req.ip;
    
    const geo = geoip.lookup(req.ip);
    if (geo) {
      user.location.country = geo.country;
      user.location.city = geo.city;
    }
    
    await user.save();

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        profilePic: user.profilePic,
        coverPhoto: user.coverPhoto,
        bio: user.bio,
        isAdmin: user.isAdmin,
        adminRole: user.adminRole,
        verified: user.verified,
        verifiedByAdmin: user.verifiedByAdmin,
        followers: user.followers.length,
        following: user.following.length,
        accountStatus: user.accountStatus
      }
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.put("/profile", authenticate, upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'cover', maxCount: 1 }
]), async (req, res) => {
  try {
    const updates = {};
    if (req.body.bio !== undefined) updates.bio = req.body.bio;
    if (req.body.website !== undefined) updates.website = req.body.website;
    if (req.body.gender !== undefined) updates.gender = req.body.gender;
    if (req.body.privateAccount !== undefined) updates.privateAccount = req.body.privateAccount;
    
    if (req.files?.avatar) {
      updates.profilePic = `/uploads/avatars/${req.files.avatar[0].filename}`;
    }
    if (req.files?.cover) {
      updates.coverPhoto = `/uploads/covers/${req.files.cover[0].filename}`;
    }
    
    updates.updatedAt = new Date();
    
    const user = await User.findByIdAndUpdate(
      req.user._id, 
      updates, 
      { new: true, runValidators: true }
    ).select('-password -loginAttempts -lockUntil');
    
    res.json({
      success: true,
      user
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select('-password -loginAttempts -lockUntil -location.ip')
      .populate("followers", "username profilePic verified")
      .populate("following", "username profilePic verified");
    
    if (!user) return res.status(404).json({ error: "User not found" });
    
    if (user.accountStatus !== 'active' && !req.user?.isAdmin) {
      return res.status(403).json({ error: "This account is not available" });
    }
    
    const Post = mongoose.model('Post');
    const posts = await Post.find({ userId: user._id, status: 'active' })
      .populate('userId', 'username profilePic verified')
      .sort({ createdAt: -1 })
      .limit(12);
    
    res.json({
      success: true,
      user: {
        ...user.toObject(),
        postsCount: user.postsCount,
        posts,
        isFollowing: req.user ? user.followers.includes(req.user._id) : false,
        isFollower: req.user ? user.following.includes(req.user._id) : false
      }
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/search", async (req, res) => {
  try {
    const { q, page = 1, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: "Search query must be at least 2 characters" });
    }
    
    const users = await User.find({
      $or: [
        { username: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { bio: new RegExp(q, 'i') }
      ],
      accountStatus: 'active'
    })
    .select('username profilePic bio verified followers following')
    .skip((page - 1) * limit)
    .limit(parseInt(limit))
    .sort({ followers: -1 });
    
    const total = await User.countDocuments({
      $or: [
        { username: new RegExp(q, 'i') },
        { email: new RegExp(q, 'i') },
        { bio: new RegExp(q, 'i') }
      ],
      accountStatus: 'active'
    });
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
