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

if (!fs.existsSync(usersFilePath)) fs.writeFileSync(usersFilePath, "[]", "utf8");
if (!fs.existsSync(postsFilePath)) fs.writeFileSync(postsFilePath, JSON.stringify({ posts: [] }, null, 2), "utf8");

const readPosts = () => JSON.parse(fs.readFileSync(postsFilePath, "utf8")).posts;
const writePosts = (posts) => fs.writeFileSync(postsFilePath, JSON.stringify({ posts }, null, 2), "utf8");

app.post("/register", (req, res) => {
    let users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    if (users.some(user => user.username === req.body.username)) {
        return res.status(400).json({ success: false, message: "Username already exists." });
    }

    const newUser = {
        username: req.body.username,
        email: req.body.email,
        password: req.body.password,
        bio: req.body.bio || "",
        followers: [],
        savedPosts: []
    };

    users.push(newUser);
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

    res.json({ success: true, message: "Registration successful!" });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

    const user = users.find(user => user.username === username || user.email === username);
    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, message: "Invalid username or password." });
    }

    res.json({ success: true, message: "Login successful!", user });
});

app.get("/posts", (req, res) => {
    const { page = 1, limit = 10 } = req.query;
    const posts = readPosts();
    const paginatedPosts = posts.slice((page - 1) * limit, page * limit);
    res.json({ posts: paginatedPosts });
});

app.post("/posts/:id/like", (req, res) => {
    const postId = parseInt(req.params.id);
    const posts = readPosts();
    const post = posts.find(post => post.id === postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    post.likes += 1;
    writePosts(posts);

    res.json({ success: true, message: "Post liked!", likes: post.likes });
});

app.post("/posts/:id/save", (req, res) => {
    const postId = parseInt(req.params.id);
    const { userId } = req.body;
    const posts = readPosts();
    const post = posts.find(post => post.id === postId);
    if (!post) return res.status(404).json({ success: false, message: "Post not found." });

    if (!post.savedBy) post.savedBy = [];
    if (!post.savedBy.includes(userId)) {
        post.savedBy.push(userId);
        writePosts(posts);
        return res.json({ success: true, message: "Post saved!" });
    }

    res.json({ success: false, message: "Post already saved." });
});

app.post("/users/:username/follow", (req, res) => {
    const { username } = req.params;
    const { followerId } = req.body;
    const users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));

    const user = users.find(user => user.username === username);
    if (!user) return res.status(404).json({ success: false, message: "User not found." });

    if (!user.followers) user.followers = [];
    if (!user.followers.includes(followerId)) {
        user.followers.push(followerId);
        fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
        return res.json({ success: true, message: "Followed user!" });
    }

    res.json({ success: false, message: "Already following this user." });
});

app.get("/dashboard", (req, res) => {
    res.sendFile(path.join(publicPath, "dashboard.html"));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
