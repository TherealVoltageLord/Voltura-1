const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const usersFilePath = path.join(__dirname, "users.json");
const postsFilePath = path.join(__dirname, "posts.json");

if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
}

if (!fs.existsSync(postsFilePath)) {
    fs.writeFileSync(postsFilePath, JSON.stringify({ posts: [] }, null, 2), "utf8");
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(publicPath, "uploads"));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

const upload = multer({ storage });

function readPosts() {
    const data = fs.readFileSync(postsFilePath, "utf8");
    return JSON.parse(data).posts;
}

function writePosts(posts) {
    fs.writeFileSync(postsFilePath, JSON.stringify({ posts }, null, 2), "utf8");
}

function readUsers() {
    const data = fs.readFileSync(usersFilePath, "utf8");
    return JSON.parse(data);
}

function writeUsers(users) {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

app.post("/register", (req, res) => {
    const userData = req.body;
    let users = readUsers();
    if (users.some(user => user.username === userData.username)) {
        return res.status(400).json({ success: false, message: "Username already exists." });
    }
    const newUser = {
        id: users.length + 1,
        username: userData.username,
        email: userData.email,
        password: userData.password,
        bio: userData.bio || "",
        followers: [],
        following: [],
        savedPosts: [],
        notifications: [
            {
                type: "welcome",
                message: "Welcome to Voltura! 🎉 Do well to set up your profile and start exploring.",
                timestamp: new Date().toISOString(),
            },
        ],
    };
    users.push(newUser);
    writeUsers(users);
    res.json({ success: true, message: "Registration successful!", user: newUser });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();
    const user = users.find(user => user.username === username || user.email === username);
    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, message: "Invalid username or password." });
    }
    res.json({ success: true, message: "Login successful!", user });
});

app.get("/posts", (req, res) => {
    const { page = 1, limit = 10, username } = req.query;
    const posts = readPosts();
    let filteredPosts = posts;
    if (username) {
        filteredPosts = posts.filter(post => post.username === username);
    }
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedPosts = filteredPosts.slice(startIndex, endIndex);
    res.json({ posts: paginatedPosts });
});

app.post("/posts/:id/like", (req, res) => {
    const postId = parseInt(req.params.id);
    const { userId } = req.body;
    const posts = readPosts();
    const post = posts.find(post => post.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: "Post not found." });
    }
    post.likes += 1;
    const users = readUsers();
    const postOwner = users.find(user => user.username === post.username);
    if (postOwner) {
        postOwner.notifications.push({
            type: "like",
            fromUserId: userId,
            postId: postId,
            timestamp: new Date().toISOString(),
        });
        writeUsers(users);
    }
    writePosts(posts);
    res.json({ success: true, message: "Post liked!", likes: post.likes });
});

app.post("/posts/:id/save", (req, res) => {
    const postId = parseInt(req.params.id);
    const { userId } = req.body;
    const posts = readPosts();
    const post = posts.find(post => post.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: "Post not found." });
    }
    if (!post.savedBy) {
        post.savedBy = [];
    }
    if (!post.savedBy.includes(userId)) {
        post.savedBy.push(userId);
        writePosts(posts);
        res.json({ success: true, message: "Post saved!" });
    } else {
        res.json({ success: false, message: "Post already saved." });
    }
});

app.post("/users/:username/follow", (req, res) => {
    const { username } = req.params;
    const { followerId } = req.body;
    const users = readUsers();
    const userToFollow = users.find(user => user.username === username);
    const follower = users.find(user => user.id === followerId);
    if (!userToFollow || !follower) {
        return res.status(404).json({ success: false, message: "User not found." });
    }
    if (!userToFollow.followers) {
        userToFollow.followers = [];
    }
    if (!follower.following) {
        follower.following = [];
    }
    if (!userToFollow.followers.includes(followerId)) {
        userToFollow.followers.push(followerId);
        follower.following.push(userToFollow.id);
        userToFollow.notifications.push({
            type: "follow",
            fromUserId: followerId,
            timestamp: new Date().toISOString(),
        });
        writeUsers(users);
        res.json({ success: true, message: "Followed user!" });
    } else {
        res.json({ success: false, message: "Already following this user." });
    }
});

app.get("/users/:username", (req, res) => {
    const { username } = req.params;
    const users = readUsers();
    const user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ success: true, user });
});

app.get("/users/:userId/saved", (req, res) => {
    const { userId } = req.params;
    const posts = readPosts();
    const savedPosts = posts.filter(post => post.savedBy?.includes(parseInt(userId)));
    res.json({ savedPosts });
});

app.post("/upload", upload.single("image"), (req, res) => {
    const { caption, username } = req.body;
    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
    if (!imagePath) {
        return res.status(400).json({ success: false, message: "No image uploaded." });
    }
    const posts = readPosts();
    const newPost = {
        id: posts.length + 1,
        username,
        image: imagePath,
        caption,
        likes: 0,
        comments: [],
        timestamp: new Date().toISOString(),
        savedBy: [],
    };
    posts.push(newPost);
    writePosts(posts);
    res.json({ success: true, message: "Post uploaded successfully!", post: newPost });
});

app.get("/notifications/:userId", (req, res) => {
    const { userId } = req.params;
    const users = readUsers();
    const user = users.find(user => user.id === parseInt(userId));
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }
    res.json({ notifications: user.notifications || [] });
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(publicPath, "dashboard.html"));
});

app.get("/profile", (req, res) => {
    res.sendFile(path.join(publicPath, "profile.html"));
});

app.get("/upload", (req, res) => {
    res.sendFile(path.join(publicPath, "upload.html"));
});

app.get("/notification", (req, res) => {
    res.sendFile(path.join(publicPath, "notification.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
