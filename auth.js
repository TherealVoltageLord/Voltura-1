const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const mongoose = require("mongoose");
const { body, validationResult } = require("express-validator");

const User = mongoose.model("User", new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String, default: "/default-avatar.png" },
  bio: String,
  website: String,
  gender: String,
  privateAccount: { type: Boolean, default: false },
  verified: { type: Boolean, default: false },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  postsCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
}));

const storage = multer.diskStorage({
  destination: "public/uploads/avatars",
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5000000 } });

router.post("/register", upload.single("avatar"), [
  body("username").isLength({ min: 3 }).trim(),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : "/default-avatar.png";
    
    const user = new User({
      username: req.body.username,
      email: req.body.email,
      password: hashedPassword,
      profilePic: avatarUrl,
      bio: req.body.bio || ""
    });

    await user.save();
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, username: user.username, profilePic: user.profilePic } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/login", [
  body("email").isEmail(),
  body("password").exists()
], async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
    res.json({ token, user: { id: user._id, username: user.username, profilePic: user.profilePic } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/profile", upload.single("avatar"), async (req, res) => {
  try {
    const updates = {};
    if (req.body.bio) updates.bio = req.body.bio;
    if (req.body.website) updates.website = req.body.website;
    if (req.body.gender) updates.gender = req.body.gender;
    if (req.file) updates.profilePic = `/uploads/avatars/${req.file.filename}`;
    
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/profile/:username", async (req, res) => {
  try {
    const user = await User.findOne({ username: req.params.username })
      .select("-password")
      .populate("followers", "username profilePic")
      .populate("following", "username profilePic");
    
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
