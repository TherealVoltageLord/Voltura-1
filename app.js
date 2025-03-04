const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const usersFilePath = path.join(__dirname, "users.json");
const postsFilePath = path.join(__dirname, "posts.json");

if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, "[]", "utf8");
if (!fs.existsSync(postsFilePath)) fs.writeFileSync(postsFilePath, JSON.stringify({ posts: [] }, null, 2), "utf8");

const profilePicStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(publicPath, "uploads/profile_pics")),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});

const profilePicUpload = multer({ storage: profilePicStorage });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(publicPath, "uploads")),
    filename: (req, file, cb) => cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});

const upload = multer({ storage });

const readPosts = () => {
    try {
        return JSON.parse(fs.readFileSync(postsFilePath, "utf8")).posts || [];
    } catch (error) {
        return [];
    }
};

const writePosts = (posts) => fs.writeFileSync(postsFilePath, JSON.stringify({ posts }, null, 2), "utf8");

const readUsers = () => {
    try {
        return JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    } catch (error) {
        return [];
    }
};

const writeUsers = (users) => fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");

app.post("/register", profilePicUpload.single("profilePic"), (req, res) => {
    const userData = req.body;
    let users = readUsers();
    if (users.some(user => user.username === userData.username)) return res.status(400).json({ success: false, message: "Username already exists." });

    const profilePicUrl = req.file ? `/uploads/profile_pics/${req.file.filename}` : "/uploads/profile_pics/default.png";

    const newUser = {
        id: Date.now(),
        username: userData.username,
        email: userData.email,
        password: userData.password,
        bio: userData.bio || "",
        profilePic: profilePicUrl,
        followers: [],
        following: [],
        savedPosts: [],
        notifications: [{ type: "welcome", message: "Welcome to Voltura! 🎉 Set up your profile and start exploring.", timestamp: new Date().toISOString() }],
    };

    users.push(newUser);
    writeUsers(users);
    res.json({ success: true, message: "Registration successful!", user: newUser });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find(user => user.username === username || user.email === username);
    if (!user || user.password !== password) return res.status(400).json({ success: false, message: "Invalid username or password." });
    res.json({ success: true, message: "Login successful!", user });
});

app.get("/posts", (req, res) => {
    const { page = 1, limit = 10, username } = req.query;
    let posts = readPosts();
    if (username) posts = posts.filter(post => post.username === username);
    res.json({ posts: posts.slice((page - 1) * limit, page * limit) });
});

app.post("/posts/:id/like", (req, res) => {
    const postId = parseInt(req.params.id);
    const { userId } = req.body;
    const posts = readPosts();
    const post = posts.find(post => post.id === postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    post.likedBy = post.likedBy || [];
    if (post.likedBy.includes(userId)) return res.status(400).json({ success: false, message: "Already liked this post." });

    post.likedBy.push(userId);
    post.likes = post.likedBy.length;

    const users = readUsers();
    const postOwner = users.find(user => user.username === post.username);
    if (postOwner) {
        postOwner.notifications.push({ type: "like", fromUserId: userId, postId, timestamp: new Date().toISOString() });
        writeUsers(users);
    }

    writePosts(posts);
    res.json({ success: true, message: "Post liked!", likes: post.likes });
});

app.post("/users/:username/follow", (req, res) => {
    const { username } = req.params;
    const { followerId } = req.body;
    const users = readUsers();
    const userToFollow = users.find(user => user.username === username);
    const follower = users.find(user => user.id === followerId);

    if (!userToFollow || !follower) return res.status(404).json({ success: false, message: "User not found." });

    userToFollow.followers = Array.isArray(userToFollow.followers) ? userToFollow.followers : [];
    follower.following = Array.isArray(follower.following) ? follower.following : [];

    if (!userToFollow.followers.includes(followerId)) {
        userToFollow.followers.push(followerId);
        follower.following.push(userToFollow.id);
        userToFollow.notifications.push({ type: "follow", fromUserId: followerId, timestamp: new Date().toISOString() });
        writeUsers(users);
        res.json({ success: true, message: "Followed user!" });
    } else {
        res.json({ success: false, message: "Already following this user." });
    }
});

app.get("/users/:username", (req, res) => {
    const user = readUsers().find(user => user.username === req.params.username);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ success: true, user });
});

app.post("/upload", upload.single("image"), (req, res) => {
    const { caption, username } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "No image uploaded." });

    const posts = readPosts();
    const newPost = {
        id: Date.now(),
        username,
        image: `/uploads/${req.file.filename}`,
        caption,
        likes: 0,
        likedBy: [],
        comments: [],
        timestamp: new Date().toISOString(),
        savedBy: [],
    };

    posts.push(newPost);
    writePosts(posts);
    res.json({ success: true, message: "Post uploaded successfully!", post: newPost });
});

app.get("/notifications/:userId", (req, res) => {
    const user = readUsers().find(user => user.id === parseInt(req.params.userId));
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    res.json({ notifications: user.notifications || [] });
});

app.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
