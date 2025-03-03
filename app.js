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

if (!fs.existsSync(usersFilePath)) {
    fs.writeFileSync(usersFilePath, "[]", "utf8");
}

app.post("/register", (req, res) => {
    const userData = req.body;

    let users = [];
    if (fs.existsSync(usersFilePath)) {
        users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    }

    const userExists = users.some(user => user.username === userData.username);
    if (userExists) {
        return res.status(400).json({ success: false, message: "Username already exists." });
    }

    users.push(userData);

    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));

    res.json({ success: true, message: "Registration successful!" });
});

app.post("/login", (req, res) => {
    const { username, password } = req.body;

    let users = [];
    if (fs.existsSync(usersFilePath)) {
        users = JSON.parse(fs.readFileSync(usersFilePath, "utf8"));
    }

    const user = users.find(user => user.username === username);

    if (!user) {
        return res.status(400).json({ success: false, message: "User not found." });
    }

    if (user.password !== password) {
        return res.status(400).json({ success: false, message: "Incorrect password." });
    }

    res.json({ success: true, message: "Login successful!", user });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
