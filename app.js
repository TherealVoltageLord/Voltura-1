const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

const usersFilePath = path.join(__dirname, "users.json");
const postsFilePath = path.join(__dirname, "posts.json");

// Initialize files if they don't exist
if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
}

if (!fs.existsSync(postsFilePath)) {
    fs.writeFileSync(postsFilePath, JSON.stringify({ posts: [] }, null, 2), "utf8");
}

// Helper function to read posts
function readPosts() {
    const data = fs.readFileSync(postsFilePath, "utf8");
    return JSON.parse(data).posts;
}

// Helper function to write posts
function writePosts(posts) {
    fs.writeFileSync(postsFilePath, JSON.stringify({ posts }, null, 2), "utf8");
}

// Helper function to read users
function readUsers() {
    const data = fs.readFileSync(usersFilePath, "utf8");
    return JSON.parse(data);
}

// Helper function to write users
function writeUsers(users) {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

// Register endpoint
app.post("/register", (req, res) => {
    const userData = req.body;

    let users = readUsers();
    if (users.some(user => user.username === userData.username)) {
        return res.status(400).json({ success: false, message: "Username already exists." });
    }

    const newUser = {
        id: users.length + 1, // Assign a unique ID
        username: userData.username,
        email: userData.email,
        password: userData.password,
        bio: userData.bio || "",
        followers: [],
        following: [],
        savedPosts: []
    };

    users.push(newUser);
    writeUsers(users);

    res.json({ success: true, message: "Registration successful!", user: newUser });
});

// Login endpoint
app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = readUsers();

    const user = users.find(user => user.username === username || user.email === username);
    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, message: "Invalid username or password." });
    }

    res.json({ success: true, message: "Login successful!", user });
});

// Fetch posts endpoint
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

// Like a post endpoint
app.post("/posts/:id/like", (req, res) => {
    const postId = parseInt(req.params.id);
    const posts = readPosts();

    const post = posts.find(post => post.id === postId);
    if (!post) {
        return res.status(404).json({ success: false, message: "Post not found." });
    }

    post.likes += 1;
    writePosts(posts);

    res.json({ success: true, message: "Post liked!", likes: post.likes });
});

// Save a post endpoint
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

// Follow a user endpoint
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
        writeUsers(users);
        res.json({ success: true, message: "Followed user!" });
    } else {
        res.json({ success: false, message: "Already following this user." });
    }
});

// Fetch user profile endpoint
app.get("/users/:username", (req, res) => {
    const { username } = req.params;
    const users = readUsers();

    const user = users.find(user => user.username === username);
    if (!user) {
        return res.status(404).json({ success: false, message: "User not found." });
    }

    res.json({ success: true, user });
});

// Fetch saved posts endpoint
app.get("/users/:userId/saved", (req, res) => {
    const { userId } = req.params;
    const posts = readPosts();

    const savedPosts = posts.filter(post => post.savedBy?.includes(parseInt(userId)));
    res.json({ savedPosts });
});

// Serve dashboard
app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(publicPath, "dashboard.html"));
});

// Serve profile page
app.get("/profile", (req, res) => {
    res.sendFile(path.join(publicPath, "profile.html"));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
